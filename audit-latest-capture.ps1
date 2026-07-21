param(
    [switch]$Full,
    [string]$RunDir
)

$ErrorActionPreference = "Stop"

function Assert-LastCommandSucceeded {
    param(
        [string]$StepName
    )

    if ($LASTEXITCODE -ne 0) {
        throw "Audit step failed: $StepName (exit code $LASTEXITCODE)"
    }
}

$captureRoot = "data/live-capture/forward-quotes"

if (!(Test-Path $captureRoot)) {
    throw "Capture directory not found: $captureRoot"
}

# Run selection is lifecycle-aware (M12.1E): active/finalizing runs are never
# audited; the default is the newest terminally *completed* run; failed or
# user-cancelled runs are auditable only via an explicit -RunDir.
$selectorArgs = @("--capture-root", $captureRoot)
if ($RunDir) {
    $selectorArgs += @("--run-dir", $RunDir)
}

$selectionJson = npx tsx scripts/live/selectAuditableCaptureRun.ts @selectorArgs
if ($LASTEXITCODE -ne 0) {
    $reason = "unknown"
    try {
        $failed = $selectionJson | ConvertFrom-Json
        $reason = $failed.reason
    } catch {}
    throw "No auditable capture run selected: $reason"
}

$selection = $selectionJson | ConvertFrom-Json
$runId = $selection.runId
$runDirSelected = $selection.runDir

Write-Host ""
Write-Host "Selected capture run:"
Write-Host "  runId:    $runId"
Write-Host "  runDir:   $runDirSelected"
Write-Host "  runState: $($selection.runState)"
foreach ($warning in $selection.warnings) {
    Write-Host "  warning:  $warning"
}
Write-Host ""

Write-Host "Running capture health audit..."
npx tsx scripts/research/buildCaptureHealthAudit.ts --capture-run-dir "$runDirSelected"
Assert-LastCommandSucceeded -StepName "capture-health-audit"

Write-Host ""
Write-Host "Running bid-size coverage audit..."
npx tsx scripts/research/buildBidSizeCoverageAudit.ts --capture-run-dir "$runDirSelected"
Assert-LastCommandSucceeded -StepName "bid-size-coverage-audit"

Write-Host ""
Write-Host "Running capture health reconciliation..."
npx tsx scripts/research/buildCaptureHealthReconciliation.ts --capture-run-dir "$runDirSelected"
Assert-LastCommandSucceeded -StepName "capture-health-reconciliation"

if ($Full) {
    Write-Host ""
    Write-Host "Running downstream research pipeline..."
    npm run research:static-parity-scan
    Assert-LastCommandSucceeded -StepName "static-parity-scan"
    npm run research:bid-only-candidate-lifecycle
    Assert-LastCommandSucceeded -StepName "bid-only-candidate-lifecycle"
    npm run research:strategy-evaluation-readiness
    Assert-LastCommandSucceeded -StepName "strategy-evaluation-readiness"
    npm run research:executable-confirmation-design
    Assert-LastCommandSucceeded -StepName "executable-confirmation-design"
    npm run research:forward-capture-readiness
    Assert-LastCommandSucceeded -StepName "forward-capture-readiness"
}

Write-Host ""
Write-Host "Done auditing capture run: $runId"
