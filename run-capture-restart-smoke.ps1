# M12.1F: short live capture smoke gate for eight-hour restart approval.
#
# Runs a bounded (15-30 minute) authenticated Kalshi WebSocket capture with
# BTC spot through the canonical capture path, audits the EXACT run directory
# it created (never an ambiguous "latest"), and evaluates the frozen restart
# acceptance criteria. Exits nonzero unless every restart gate passes.
#
# Usage:
#   ./run-capture-restart-smoke.ps1                       # 20-minute smoke
#   ./run-capture-restart-smoke.ps1 -DurationMinutes 15
#
# This wrapper never starts an eight-hour capture; it only decides whether
# one may be started.

param(
    [double]$DurationMinutes = 20,
    # Must match the top-of-book throttle intended for eight-hour runs
    # (the capture CLI default, 0 = unthrottled, is the canonical setting).
    [int]$TopOfBookThrottleMs = 0,
    [int]$MaxMarkets = 3,
    [string]$Series = "KXBTC15M"
)

$ErrorActionPreference = "Stop"

if ($DurationMinutes -lt 15 -or $DurationMinutes -gt 30) {
    throw "DurationMinutes must be between 15 and 30 (got $DurationMinutes). This is a smoke gate, not an eight-hour capture."
}

$captureRoot = "data/live-capture/forward-quotes"

# ---------------------------------------------------------------------------
# Step 1: refuse to run while another capture is active or finalizing.
# ---------------------------------------------------------------------------
Write-Host "Step 1/5: verifying no capture is currently active..."
npx tsx scripts/research/evaluateCaptureRestartGate.ts --assert-no-active-capture --capture-root $captureRoot
if ($LASTEXITCODE -ne 0) {
    throw "Another capture run is active or finalizing; refusing to start the smoke capture."
}

# ---------------------------------------------------------------------------
# Step 2: run the bounded live smoke capture on the canonical capture path.
# The CLI process exits only after producers are quiesced, the buffered
# writer has fully drained, and the terminal run status is published — so
# process exit IS terminal writer completion.
# ---------------------------------------------------------------------------
Write-Host "Step 2/5: running $DurationMinutes-minute authenticated live capture (series $Series, throttle ${TopOfBookThrottleMs}ms)..."
$captureStdout = npx tsx scripts/live/runForwardQuoteCapture.ts `
    --series $Series `
    --duration-minutes $DurationMinutes `
    --max-markets $MaxMarkets `
    --capture-btc-spot `
    --top-of-book-throttle-ms $TopOfBookThrottleMs
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
# Step 4: bid-size coverage and health reconciliation (diagnostic artifacts;
# the restart decision itself is made by the gate in step 5).
# ---------------------------------------------------------------------------
Write-Host "Step 4/5: running bid-size coverage audit and health reconciliation..."
npx tsx scripts/research/buildBidSizeCoverageAudit.ts --capture-run-dir "$runDir"
Write-Host "  bid-size-coverage-audit exit code: $LASTEXITCODE"
npx tsx scripts/research/buildCaptureHealthReconciliation.ts --capture-run-dir "$runDir"
Write-Host "  capture-health-reconciliation exit code: $LASTEXITCODE"

# ---------------------------------------------------------------------------
# Step 5: evaluate the frozen restart acceptance criteria and print the one
# machine-readable readiness summary. The wrapper's exit code is the gate's.
# ---------------------------------------------------------------------------
Write-Host "Step 5/5: evaluating eight-hour restart gate..."
npx tsx scripts/research/evaluateCaptureRestartGate.ts `
    --capture-run-dir "$runDir" `
    --expected-duration-minutes $DurationMinutes
$gateExitCode = $LASTEXITCODE

if ($gateExitCode -eq 0) {
    Write-Host ""
    Write-Host "RESTART GATE PASSED: eight-hour captures may be restarted (run $runId)."
} else {
    Write-Host ""
    Write-Host "RESTART GATE FAILED: do NOT restart eight-hour captures (run $runId)."
}

exit $gateExitCode
