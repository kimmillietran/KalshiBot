param(
    [switch]$Full
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

$latest = Get-ChildItem $captureRoot -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($null -eq $latest) {
    throw "No capture runs found under $captureRoot"
}

$runId = $latest.Name
$runDir = $latest.FullName

Write-Host ""
Write-Host "Latest capture run:"
Write-Host "  runId:  $runId"
Write-Host "  runDir: $runDir"
Write-Host ""

Write-Host "Running capture health audit..."
npx tsx scripts/research/buildCaptureHealthAudit.ts --capture-run-dir "$runDir"
Assert-LastCommandSucceeded -StepName "capture-health-audit"

Write-Host ""
Write-Host "Running bid-size coverage audit..."
npx tsx scripts/research/buildBidSizeCoverageAudit.ts --capture-run-dir "$runDir"
Assert-LastCommandSucceeded -StepName "bid-size-coverage-audit"

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
Write-Host "Done auditing latest capture: $runId"
