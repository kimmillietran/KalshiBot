# Thin Windows launcher for the cross-platform reconnect smoke (TypeScript SSoT).
# M12.1I: behavior lives in scripts/operator/runCaptureReconnectSmoke.ts.
param(
    [double]$DurationMinutes = 20
)

$ErrorActionPreference = "Stop"

$argsList = @("--duration-minutes", "$DurationMinutes")
foreach ($arg in $args) {
    $argsList += $arg
}

npx tsx scripts/operator/runCaptureReconnectSmoke.ts @argsList
exit $LASTEXITCODE
