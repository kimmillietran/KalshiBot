# M12.1G: short live capture smoke gate for reconnect auth finalization.
#
# Runs a bounded (15-20 minute) authenticated Kalshi WebSocket capture with
# forceReconnectAfterFirstValidTopOfBook through the dedicated validation
# path, audits the EXACT run directory it created (never an ambiguous
# "latest"), and fail-closes unless every reconnect / status / health /
# writer / restart-gate / post-run lock invariant passes.
#
# This wrapper never starts an eight-hour capture.
#
# Usage:
#   ./run-capture-reconnect-smoke.ps1                       # 20-minute smoke
#   ./run-capture-reconnect-smoke.ps1 -DurationMinutes 15

param(
    [double]$DurationMinutes = 20
)

$ErrorActionPreference = "Stop"

$smokeDurationMin = 15
$smokeDurationMax = 20

if ($DurationMinutes -lt $smokeDurationMin -or $DurationMinutes -gt $smokeDurationMax) {
    throw "DurationMinutes must be between $smokeDurationMin and $smokeDurationMax (got $DurationMinutes). This is a reconnect smoke gate, not an eight-hour capture."
}

# Hard guard: never allow an eight-hour duration through this wrapper.
if ($DurationMinutes -ge 480) {
    throw "Refusing to start an eight-hour capture from run-capture-reconnect-smoke.ps1 (DurationMinutes=$DurationMinutes)."
}

$captureRoot = "data/live-capture/forward-quotes"

# ---------------------------------------------------------------------------
# Step 1/6: refuse to run while starting a capture would be unsafe.
# ---------------------------------------------------------------------------
Write-Host "Step 1/6: verifying it is safe to start a capture..."
npx tsx scripts/research/evaluateCaptureRestartGate.ts --assert-no-active-capture --capture-root $captureRoot
$preCapturePreflightExitCode = $LASTEXITCODE
if ($preCapturePreflightExitCode -ne 0) {
    throw "Capture-start preflight failed; refusing to start the reconnect smoke capture."
}

# ---------------------------------------------------------------------------
# Step 2/6: run the bounded reconnect validation capture (forceReconnect).
# Process exit IS terminal writer completion.
# ---------------------------------------------------------------------------
Write-Host "Step 2/6: running $DurationMinutes-minute reconnect validation capture (forceReconnectAfterFirstValidTopOfBook)..."
$captureStdout = npx tsx scripts/live/runReconnectValidationCapture.ts `
    --series KXBTC15M `
    --duration-minutes $DurationMinutes `
    --max-markets 3 `
    --capture-btc-spot `
    --top-of-book-throttle-ms 1000
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
Write-Host "Reconnect smoke capture run:"
Write-Host "  runId:   $runId"
Write-Host "  runDir:  $runDir"
Write-Host "  capture exit code: $captureExitCode"
if ($captureExitCode -ne 0) {
    Write-Host "  capture failed; continuing exact-run diagnostics (reconnect gate will be denied)."
}
Write-Host ""

# ---------------------------------------------------------------------------
# Step 3/6: capture health audit of that exact run directory.
# ---------------------------------------------------------------------------
Write-Host "Step 3/6: running capture health audit on the exact run..."
npx tsx scripts/research/buildCaptureHealthAudit.ts --capture-run-dir "$runDir"
$auditExitCode = $LASTEXITCODE
Write-Host "  capture-health-audit exit code: $auditExitCode"

$auditPath = Join-Path $runDir "capture-health-audit.json"
if (-not (Test-Path $auditPath -PathType Leaf)) {
    throw "capture-health-audit.json missing for exact run $runDir"
}

# ---------------------------------------------------------------------------
# Step 4/6: exact-run status / health paths must exist before restart gate.
# Full fail-closed invariant evaluation runs in Step 6 after all exit codes.
# ---------------------------------------------------------------------------
Write-Host "Step 4/6: verifying exact-run status and health artifacts..."
$statusPath = Join-Path $runDir "capture-run-status.json"
$healthPath = Join-Path $runDir "capture-health.json"
if (-not (Test-Path $statusPath -PathType Leaf)) {
    throw "capture-run-status.json missing for exact run $runDir"
}
if (-not (Test-Path $healthPath -PathType Leaf)) {
    throw "capture-health.json missing for exact run $runDir"
}
# PowerShell 5.1-safe UTF-8 read; fail closed on malformed JSON.
$status = Get-Content -Raw -Encoding UTF8 $statusPath | ConvertFrom-Json
$health = Get-Content -Raw -Encoding UTF8 $healthPath | ConvertFrom-Json
$audit = Get-Content -Raw -Encoding UTF8 $auditPath | ConvertFrom-Json
Write-Host "  status.state=$($status.state) health.verdict=$($health.verdict) audit.verdict=$($audit.summary.verdict)"

# ---------------------------------------------------------------------------
# Step 5/6: exact-run production restart gate (no special-case reconnect).
# ---------------------------------------------------------------------------
Write-Host "Step 5/6: evaluating exact-run restart gate..."
npm run research:capture-restart-gate -- `
    --capture-run-dir "$runDir" `
    --expected-duration-minutes $DurationMinutes
$restartGateExitCode = $LASTEXITCODE
Write-Host "  restart-gate exit code: $restartGateExitCode"

# ---------------------------------------------------------------------------
# Step 6/6: post-run lock / preflight + fail-closed reconnect acceptance.
# ---------------------------------------------------------------------------
Write-Host "Step 6/6: verifying post-run lock absence and evaluating reconnect gate..."
npx tsx scripts/research/evaluateCaptureRestartGate.ts --assert-no-active-capture --capture-root $captureRoot
$postRunPreflightExitCode = $LASTEXITCODE
Write-Host "  post-run preflight exit code: $postRunPreflightExitCode"

$lockPath = Join-Path $captureRoot "capture.lock"
$lockPresent = Test-Path $lockPath -PathType Leaf
if ($lockPresent) {
    Write-Host "  capture.lock is still present at $lockPath (fail closed; lock not deleted)."
}

$lockPresentArg = if ($lockPresent) { "true" } else { "false" }
npx tsx scripts/research/evaluateReconnectSmokeGate.ts `
    --run-id $runId `
    --run-dir "$runDir" `
    --duration-minutes $DurationMinutes `
    --capture-exit-code $captureExitCode `
    --audit-exit-code $auditExitCode `
    --restart-gate-exit-code $restartGateExitCode `
    --post-run-preflight-exit-code $postRunPreflightExitCode `
    --lock-present $lockPresentArg
$gateExitCode = $LASTEXITCODE

if ($gateExitCode -eq 0) {
    Write-Host ""
    Write-Host "RECONNECT GATE PASSED: reconnect auth finalization validated (run $runId)."
    exit 0
} else {
    Write-Host ""
    Write-Host "RECONNECT GATE FAILED: do NOT treat reconnect as proven (run $runId)."
    exit 1
}
