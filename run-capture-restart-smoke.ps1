# M12.1F: short live capture smoke gate for eight-hour restart approval.
#
# Runs a bounded (15-30 minute) authenticated Kalshi WebSocket capture with
# BTC spot through the canonical capture path, audits the EXACT run directory
# it created (never an ambiguous "latest"), and evaluates the frozen restart
# acceptance criteria. Exits nonzero unless every restart gate passes.
#
# The capture workload (series, throttle, market count, watchdog, BTC spot)
# comes from the canonical eight-hour profile printed by the gate command —
# it is intentionally NOT parameterized here, so the smoke always exercises
# the exact configuration an eight-hour capture will use. The only allowed
# difference is duration (15-30 minutes instead of 480), which the gate
# verifies as the documented smoke exception.
#
# Usage:
#   ./run-capture-restart-smoke.ps1                       # 20-minute smoke
#   ./run-capture-restart-smoke.ps1 -DurationMinutes 15
#
# This wrapper never starts an eight-hour capture; it only decides whether
# one may be started.

param(
    [double]$DurationMinutes = 20
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Canonical capture profile: the single source of truth lives in TypeScript
# (CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE); this wrapper never duplicates it.
# ---------------------------------------------------------------------------
$profileJson = npx tsx scripts/research/evaluateCaptureRestartGate.ts --print-canonical-profile
if ($LASTEXITCODE -ne 0) {
    throw "Could not read the canonical capture profile (exit code $LASTEXITCODE)."
}
$profile = ($profileJson -join "") | ConvertFrom-Json

if ($DurationMinutes -lt $profile.smokeDurationMinutesMin -or $DurationMinutes -gt $profile.smokeDurationMinutesMax) {
    throw "DurationMinutes must be between $($profile.smokeDurationMinutesMin) and $($profile.smokeDurationMinutesMax) (got $DurationMinutes). This is a smoke gate, not an eight-hour capture."
}

$captureRoot = "data/live-capture/forward-quotes"

# ---------------------------------------------------------------------------
# Step 1: refuse to run while starting a capture would be unsafe: any
# active/finalizing run, any invalid or identity-mismatched status marker
# (process state unknown), or an unreleased capture lock.
# ---------------------------------------------------------------------------
Write-Host "Step 1/5: verifying it is safe to start a capture..."
npx tsx scripts/research/evaluateCaptureRestartGate.ts --assert-no-active-capture --capture-root $captureRoot
if ($LASTEXITCODE -ne 0) {
    throw "Capture-start preflight failed; refusing to start the smoke capture."
}

# ---------------------------------------------------------------------------
# Step 2: run the bounded live smoke capture on the canonical capture path
# with the canonical eight-hour workload (watchdog stays enabled; the
# capture command itself takes the atomic global capture lock). The CLI
# process exits only after producers are quiesced, the buffered writer has
# fully drained, and the terminal run status is published — so process exit
# IS terminal writer completion.
# ---------------------------------------------------------------------------
Write-Host "Step 2/5: running $DurationMinutes-minute authenticated live capture (series $($profile.series), throttle $($profile.topOfBookThrottleMs)ms, $($profile.maxMarkets) markets)..."
$captureStdout = npx tsx scripts/live/runForwardQuoteCapture.ts `
    --series $profile.series `
    --duration-minutes $DurationMinutes `
    --max-markets $profile.maxMarkets `
    --capture-btc-spot `
    --top-of-book-throttle-ms $profile.topOfBookThrottleMs
$captureExitCode = $LASTEXITCODE
Write-Host $captureStdout

# Identify the EXACT run this wrapper created from the capture CLI's own
# machine-readable output. Never fall back to "newest directory".
$captureJsonLine = @($captureStdout) | Where-Object { $_ -match '"runId"' } | Select-Object -Last 1
if (-not $captureJsonLine) {
    throw "Could not identify the capture run: no runId JSON found in capture output (exit code $captureExitCode)."
}
$captureResult = $captureJsonLine | ConvertFrom-Json
$runId = $captureResult.runId
$runDir = Join-Path $captureResult.outputDir $runId
if (-not $runId -or -not (Test-Path $runDir)) {
    throw "Capture run directory not found for runId '$runId' (expected $runDir)."
}

Write-Host ""
Write-Host "Smoke capture run:"
Write-Host "  runId:   $runId"
Write-Host "  runDir:  $runDir"
Write-Host "  capture exit code: $captureExitCode"
Write-Host ""

# ---------------------------------------------------------------------------
# Step 3: explicit capture health audit of that exact run directory.
# A non-ready verdict exits nonzero here but the wrapper continues so the
# restart gate can print one complete machine-readable summary.
# ---------------------------------------------------------------------------
Write-Host "Step 3/5: running capture health audit on the exact run..."
npx tsx scripts/research/buildCaptureHealthAudit.ts --capture-run-dir "$runDir"
$auditExitCode = $LASTEXITCODE
Write-Host "  capture-health-audit exit code: $auditExitCode"

# ---------------------------------------------------------------------------
# Step 4: bid-size coverage and health reconciliation. These are diagnostic
# artifacts, but their FAILURES count against the final restart decision.
# ---------------------------------------------------------------------------
Write-Host "Step 4/5: running bid-size coverage audit and health reconciliation..."
npx tsx scripts/research/buildBidSizeCoverageAudit.ts --capture-run-dir "$runDir"
$bidSizeExitCode = $LASTEXITCODE
Write-Host "  bid-size-coverage-audit exit code: $bidSizeExitCode"
npx tsx scripts/research/buildCaptureHealthReconciliation.ts --capture-run-dir "$runDir"
$reconciliationExitCode = $LASTEXITCODE
Write-Host "  capture-health-reconciliation exit code: $reconciliationExitCode"

# ---------------------------------------------------------------------------
# Step 5: evaluate the frozen restart acceptance criteria and print the one
# machine-readable readiness summary. The declared duration must exactly
# match the capture's own recorded config; the gate re-verifies the
# canonical profile from the native health artifact.
# ---------------------------------------------------------------------------
Write-Host "Step 5/5: evaluating eight-hour restart gate..."
npx tsx scripts/research/evaluateCaptureRestartGate.ts `
    --capture-run-dir "$runDir" `
    --expected-duration-minutes $DurationMinutes
$gateExitCode = $LASTEXITCODE

# The final decision combines every step: the gate verdict, the capture
# process exit, and the step-3/4 audit commands. Any failure denies restart.
$failedSteps = @()
if ($gateExitCode -ne 0) { $failedSteps += "restart-gate ($gateExitCode)" }
if ($captureExitCode -ne 0) { $failedSteps += "capture ($captureExitCode)" }
if ($auditExitCode -ne 0) { $failedSteps += "capture-health-audit ($auditExitCode)" }
if ($bidSizeExitCode -ne 0) { $failedSteps += "bid-size-coverage-audit ($bidSizeExitCode)" }
if ($reconciliationExitCode -ne 0) { $failedSteps += "capture-health-reconciliation ($reconciliationExitCode)" }

if ($failedSteps.Count -eq 0) {
    Write-Host ""
    Write-Host "RESTART GATE PASSED: eight-hour captures may be restarted (run $runId)."
    exit 0
} else {
    Write-Host ""
    Write-Host "RESTART GATE FAILED: do NOT restart eight-hour captures (run $runId)."
    Write-Host "  failed steps: $($failedSteps -join ', ')"
    exit 1
}
