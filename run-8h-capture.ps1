# Thin Windows launcher for gated eight-hour capture (TypeScript SSoT).
param(
    [Parameter(Mandatory = $true)]
    [string]$AuthorizedByRestartSmokeRunDir,

    [Parameter(Mandatory = $true)]
    [string]$AuthorizedByReconnectSmokeRunDir
)

$ErrorActionPreference = "Stop"

npx tsx scripts/operator/runCaptureWithProgress.ts `
    --preset 8h `
    --authorized-by-restart-smoke-run-dir $AuthorizedByRestartSmokeRunDir `
    --authorized-by-reconnect-smoke-run-dir $AuthorizedByReconnectSmokeRunDir
exit $LASTEXITCODE
