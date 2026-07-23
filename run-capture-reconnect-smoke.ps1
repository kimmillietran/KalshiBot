# M12.1G: short live capture smoke gate for reconnect auth finalization.
#
# Runs a bounded (15-20 minute) authenticated Kalshi WebSocket capture with
# forceReconnectAfterFirstValidTopOfBook through the dedicated validation
# path, audits the EXACT run directory it created (never an ambiguous
# "latest"), and requires reconnectCount >= 1, recovery success >= 1, and
# terminalWebSocketFailure = false. Exits nonzero unless every reconnect
# gate passes.
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
# Step 1: refuse to run while starting a capture would be unsafe.
# ---------------------------------------------------------------------------
Write-Host "Step 1/4: verifying it is safe to start a capture..."
npx tsx scripts/research/evaluateCaptureRestartGate.ts --assert-no-active-capture --capture-root $captureRoot
if ($LASTEXITCODE -ne 0) {
    throw "Capture-start preflight failed; refusing to start the reconnect smoke capture."
}

# ---------------------------------------------------------------------------
# Step 2: run the bounded reconnect validation capture (forceReconnect).
# Process exit IS terminal writer completion.
# ---------------------------------------------------------------------------
Write-Host "Step 2/4: running $DurationMinutes-minute reconnect validation capture (forceReconnectAfterFirstValidTopOfBook)..."
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
    Write-Host "  capture failed; continuing exact-run reconnect gate (reconnect will be denied)."
}
Write-Host ""

# ---------------------------------------------------------------------------
# Step 3: capture health audit of that exact run directory.
# ---------------------------------------------------------------------------
Write-Host "Step 3/4: running capture health audit on the exact run..."
npx tsx scripts/research/buildCaptureHealthAudit.ts --capture-run-dir "$runDir"
$auditExitCode = $LASTEXITCODE
Write-Host "  capture-health-audit exit code: $auditExitCode"

# ---------------------------------------------------------------------------
# Step 4: evaluate reconnect acceptance criteria against the exact run.
# ---------------------------------------------------------------------------
Write-Host "Step 4/4: evaluating reconnect validation gate..."

$healthPath = Join-Path $runDir "capture-health.json"
if (-not (Test-Path $healthPath -PathType Leaf)) {
    throw "capture-health.json missing for exact run $runDir"
}

$health = Get-Content -Raw -Encoding UTF8 $healthPath | ConvertFrom-Json

$reconnectCount = [int]$health.connection.reconnectCount
$wsRecoverySuccessCount = 0
$terminalWebSocketFailure = $false
if ($null -ne $health.watchdog) {
    $wsRecoverySuccessCount = [int]$health.watchdog.wsRecoverySuccessCount
    $terminalWebSocketFailure = [bool]$health.watchdog.terminalWebSocketFailure
}

$authHeaderGenerationCount = 0
if ($null -ne $health.connection.authHeaderGenerationCount) {
    $authHeaderGenerationCount = [int]$health.connection.authHeaderGenerationCount
}

$failedChecks = @()
if ($captureExitCode -ne 0) { $failedChecks += "capture-exit ($captureExitCode)" }
if ($auditExitCode -ne 0) { $failedChecks += "capture-health-audit ($auditExitCode)" }
if ($reconnectCount -lt 1) { $failedChecks += "reconnectCount<$reconnectCount>" }
if ($wsRecoverySuccessCount -lt 1) { $failedChecks += "wsRecoverySuccessCount<$wsRecoverySuccessCount>" }
if ($terminalWebSocketFailure -eq $true) { $failedChecks += "terminalWebSocketFailure=true" }
if ($authHeaderGenerationCount -lt 2) { $failedChecks += "authHeaderGenerationCount<$authHeaderGenerationCount>" }
if ($health.connection.captureEndReason -ne "duration-complete") {
    $failedChecks += "captureEndReason=$($health.connection.captureEndReason)"
}

$summary = [ordered]@{
    schemaVersion = 1
    mode = "reconnect-smoke"
    runId = $runId
    runDir = $runDir
    durationMinutes = $DurationMinutes
    reconnectCount = $reconnectCount
    wsRecoverySuccessCount = $wsRecoverySuccessCount
    terminalWebSocketFailure = $terminalWebSocketFailure
    authHeaderGenerationCount = $authHeaderGenerationCount
    captureEndReason = $health.connection.captureEndReason
    passed = ($failedChecks.Count -eq 0)
    failedChecks = $failedChecks
}
Write-Host ($summary | ConvertTo-Json -Compress)

if ($failedChecks.Count -eq 0) {
    Write-Host ""
    Write-Host "RECONNECT GATE PASSED: reconnect auth finalization validated (run $runId)."
    exit 0
} else {
    Write-Host ""
    Write-Host "RECONNECT GATE FAILED: do NOT treat reconnect as proven (run $runId)."
    Write-Host "  failed checks: $($failedChecks -join ', ')"
    exit 1
}
