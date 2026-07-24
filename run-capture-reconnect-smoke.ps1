# M12.1H: short live capture smoke gate for reconnect auth finalization.
#
# Runs a bounded (15-20 minute) authenticated Kalshi WebSocket capture with
# forceReconnectAfterFirstValidTopOfBook through the dedicated validation
# path, audits the EXACT run directory it created (never an ambiguous
# "latest"), and fail-closes unless every reconnect / status / health /
# writer / restart-gate / post-run lock / controlled-lifecycle invariant
# passes.
#
# Capture workload (series, throttle, market count, BTC spot, watchdog)
# comes from the canonical eight-hour profile — the same source used by
# run-capture-restart-smoke.ps1. The only permitted differences are:
#   - duration between 15 and 20 minutes (reconnect smoke window)
#   - forceReconnectAfterFirstValidTopOfBook (validation CLI)
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

# Reconnect smoke keeps a tighter duration window than the restart smoke
# (15-20 vs 15-30). The validation CLI enforces the same bound.
$smokeDurationMin = 15
$smokeDurationMax = 20

if ($DurationMinutes -lt $smokeDurationMin -or $DurationMinutes -gt $smokeDurationMax) {
    throw "DurationMinutes must be between $smokeDurationMin and $smokeDurationMax (got $DurationMinutes). This is a reconnect smoke gate, not an eight-hour capture."
}

# Hard guard: never allow an eight-hour duration through this wrapper.
if ($DurationMinutes -ge 480) {
    throw "Refusing to start an eight-hour capture from run-capture-reconnect-smoke.ps1 (DurationMinutes=$DurationMinutes)."
}

# ---------------------------------------------------------------------------
# Canonical capture profile: single source of truth in TypeScript
# (CANONICAL_EIGHT_HOUR_CAPTURE_PROFILE). Never duplicate workload values
# here. Profile travels through a unique temporary UTF-8 JSON file — the
# same PowerShell 5.1-safe transport as run-capture-restart-smoke.ps1.
# ---------------------------------------------------------------------------
$profilePath = Join-Path `
    ([System.IO.Path]::GetTempPath()) `
    ("kalshibot-reconnect-capture-profile-" + [guid]::NewGuid().ToString("N") + ".json")

try {
    npx tsx scripts/research/evaluateCaptureRestartGate.ts `
        --write-canonical-profile "$profilePath"

    if ($LASTEXITCODE -ne 0) {
        throw "Could not write the canonical capture profile (exit code $LASTEXITCODE)."
    }

    if (-not (Test-Path $profilePath -PathType Leaf)) {
        throw "Canonical capture profile file was not created."
    }

    $captureProfile = Get-Content -Raw -Encoding UTF8 $profilePath |
        ConvertFrom-Json
}
finally {
    Remove-Item $profilePath -Force -ErrorAction SilentlyContinue
}

function Test-CaptureProfileField {
    param($Value, [string]$Name, [string]$Kind)

    switch ($Kind) {
        "string" {
            if ($Value -isnot [string] -or [string]::IsNullOrWhiteSpace($Value)) {
                return "$Name must be a non-empty string (got: '$Value')"
            }
        }
        "number" {
            $isNumber = $Value -is [int] -or $Value -is [long] -or
                $Value -is [double] -or $Value -is [decimal]
            if (-not $isNumber) {
                return "$Name must be a number (got: '$Value')"
            }
        }
        "bool" {
            if ($Value -isnot [bool]) {
                return "$Name must be a boolean (got: '$Value')"
            }
        }
    }
    return $null
}

$profileProblems = @(
    (Test-CaptureProfileField $captureProfile.series "series" "string"),
    (Test-CaptureProfileField $captureProfile.maxMarkets "maxMarkets" "number"),
    (Test-CaptureProfileField $captureProfile.topOfBookThrottleMs "topOfBookThrottleMs" "number"),
    (Test-CaptureProfileField $captureProfile.captureBtcSpot "captureBtcSpot" "bool"),
    (Test-CaptureProfileField $captureProfile.wsWatchdogEnabled "wsWatchdogEnabled" "bool"),
    (Test-CaptureProfileField $captureProfile.priceRepresentation "priceRepresentation" "string"),
    (Test-CaptureProfileField $captureProfile.smokeDurationMinutesMin "smokeDurationMinutesMin" "number"),
    (Test-CaptureProfileField $captureProfile.smokeDurationMinutesMax "smokeDurationMinutesMax" "number"),
    (Test-CaptureProfileField $captureProfile.eightHourDurationMinutes "eightHourDurationMinutes" "number")
) | Where-Object { $_ -ne $null }

if ($profileProblems.Count -gt 0) {
    throw "Canonical capture profile is invalid; refusing to start a capture. Problems: $($profileProblems -join '; ')"
}

if ($captureProfile.wsWatchdogEnabled -ne $true) {
    throw "Canonical capture profile must have wsWatchdogEnabled=true for reconnect validation."
}

$captureRoot = "data/live-capture/forward-quotes"

$captureAttempted = $false
$runIdentified = $false
$runId = $null
$runDir = $null
$captureExitCode = 1
$auditExitCode = 1
$restartGateExitCode = 1
$postRunPreflightExitCode = 1
$lockPresent = $true
$primaryFailure = $null
$gateExitCode = 1

# ---------------------------------------------------------------------------
# Step 1/6: refuse to run while starting a capture would be unsafe.
# ---------------------------------------------------------------------------
Write-Host "Step 1/6: verifying it is safe to start a capture..."
npx tsx scripts/research/evaluateCaptureRestartGate.ts --assert-no-active-capture --capture-root $captureRoot
$preCapturePreflightExitCode = $LASTEXITCODE
if ($preCapturePreflightExitCode -ne 0) {
    throw "Capture-start preflight failed; refusing to start the reconnect smoke capture."
}

try {
    # -----------------------------------------------------------------------
    # Step 2/6: run the bounded reconnect validation capture (forceReconnect)
    # with the canonical eight-hour workload (except duration + forceReconnect).
    # -----------------------------------------------------------------------
    Write-Host "Step 2/6: running $DurationMinutes-minute reconnect validation capture (series $($captureProfile.series), $($captureProfile.maxMarkets) markets, throttle $($captureProfile.topOfBookThrottleMs)ms, forceReconnectAfterFirstValidTopOfBook)..."
    $captureAttempted = $true

    // Named flags via npx tsx (same PowerShell-safe shape as restart smoke).
    # Workload values come only from $captureProfile — never duplicated literals.
    # --capture-btc-spot is passed when the canonical profile enables BTC spot
    # (always true today); the bool is still validated above.
    if (-not $captureProfile.captureBtcSpot) {
        throw "Canonical reconnect smoke requires captureBtcSpot=true."
    }
    $captureStdout = npx tsx scripts/live/runReconnectValidationCapture.ts `
        --series $captureProfile.series `
        --duration-minutes $DurationMinutes `
        --max-markets $captureProfile.maxMarkets `
        --capture-btc-spot `
        --top-of-book-throttle-ms $captureProfile.topOfBookThrottleMs
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
    $runIdentified = $true

    Write-Host ""
    Write-Host "Reconnect smoke capture run:"
    Write-Host "  runId:   $runId"
    Write-Host "  runDir:  $runDir"
    Write-Host "  capture exit code: $captureExitCode"
    if ($captureExitCode -ne 0) {
        Write-Host "  capture failed; continuing exact-run diagnostics (reconnect gate will be denied)."
    }
    Write-Host ""

    # -----------------------------------------------------------------------
    # Step 3/6: capture health audit of that exact run directory.
    # -----------------------------------------------------------------------
    Write-Host "Step 3/6: running capture health audit on the exact run..."
    npx tsx scripts/research/buildCaptureHealthAudit.ts --capture-run-dir "$runDir"
    $auditExitCode = $LASTEXITCODE
    Write-Host "  capture-health-audit exit code: $auditExitCode"

    $auditPath = Join-Path $runDir "capture-health-audit.json"
    if (-not (Test-Path $auditPath -PathType Leaf)) {
        throw "capture-health-audit.json missing for exact run $runDir"
    }

    # -----------------------------------------------------------------------
    # Step 4/6: exact-run status / health / lifecycle artifacts must exist.
    # -----------------------------------------------------------------------
    Write-Host "Step 4/6: verifying exact-run status, health, and lifecycle artifacts..."
    $statusPath = Join-Path $runDir "capture-run-status.json"
    $healthPath = Join-Path $runDir "capture-health.json"
    $lifecyclePath = Join-Path $runDir "capture-lifecycle.jsonl"
    if (-not (Test-Path $statusPath -PathType Leaf)) {
        throw "capture-run-status.json missing for exact run $runDir"
    }
    if (-not (Test-Path $healthPath -PathType Leaf)) {
        throw "capture-health.json missing for exact run $runDir"
    }
    if (-not (Test-Path $lifecyclePath -PathType Leaf)) {
        throw "capture-lifecycle.jsonl missing for exact run $runDir"
    }
    # PowerShell 5.1-safe UTF-8 read; fail closed on malformed JSON.
    $status = Get-Content -Raw -Encoding UTF8 $statusPath | ConvertFrom-Json
    $health = Get-Content -Raw -Encoding UTF8 $healthPath | ConvertFrom-Json
    $audit = Get-Content -Raw -Encoding UTF8 $auditPath | ConvertFrom-Json
    Write-Host "  status.state=$($status.state) health.verdict=$($health.verdict) audit.verdict=$($audit.summary.verdict) audit.selectedRunId=$($audit.selectedRunId)"

    # -----------------------------------------------------------------------
    # Step 5/6: exact-run production restart gate.
    # Invoke tsx directly with named flags — do NOT use `npm run ... --`
    # which can strip option names under Windows PowerShell 5.1.
    # -----------------------------------------------------------------------
    Write-Host "Step 5/6: evaluating exact-run restart gate..."
    npx tsx scripts/research/evaluateCaptureRestartGate.ts `
        --capture-run-dir "$runDir" `
        --expected-duration-minutes $DurationMinutes
    $restartGateExitCode = $LASTEXITCODE
    Write-Host "  restart-gate exit code: $restartGateExitCode"
}
catch {
    $primaryFailure = $_
    Write-Host "Primary reconnect-smoke step failed: $($_.Exception.Message)"
}
finally {
    # -----------------------------------------------------------------------
    # Step 6/6: ALWAYS run post-run lock / preflight after a capture attempt.
    # -----------------------------------------------------------------------
    if ($captureAttempted) {
        Write-Host "Step 6/6: verifying post-run lock absence (finally) and evaluating reconnect gate..."
        npx tsx scripts/research/evaluateCaptureRestartGate.ts --assert-no-active-capture --capture-root $captureRoot
        $postRunPreflightExitCode = $LASTEXITCODE
        Write-Host "  post-run preflight exit code: $postRunPreflightExitCode"

        $lockPath = Join-Path $captureRoot "capture.lock"
        $lockPresent = Test-Path $lockPath -PathType Leaf
        if ($lockPresent) {
            Write-Host "  capture.lock is still present at $lockPath (fail closed; lock not deleted)."
        }

        if ($runIdentified -and $runId -and $runDir) {
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
        }
        else {
            Write-Host "  exact run was not identified; skipping lifecycle evaluator (still fail closed)."
            $gateExitCode = 1
        }
    }
}

if ($null -ne $primaryFailure) {
    Write-Host ""
    Write-Host "RECONNECT GATE FAILED: primary step error (run $runId)."
    Write-Host "  $($primaryFailure.Exception.Message)"
    exit 1
}

if ($gateExitCode -eq 0 -and $postRunPreflightExitCode -eq 0 -and -not $lockPresent) {
    Write-Host ""
    Write-Host "RECONNECT GATE PASSED: reconnect auth finalization validated (run $runId)."
    exit 0
}

Write-Host ""
Write-Host "RECONNECT GATE FAILED: do NOT treat reconnect as proven (run $runId)."
exit 1
