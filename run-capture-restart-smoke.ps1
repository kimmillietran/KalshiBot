# Thin Windows launcher for the cross-platform restart smoke (TypeScript SSoT).
# M12.1I: behavior lives in scripts/operator/runCaptureRestartSmoke.ts.
param(
    [double]$DurationMinutes = 20
)

$ErrorActionPreference = "Stop"

$argsList = @("--duration-minutes", "$DurationMinutes")
foreach ($arg in $args) {
    $argsList += $arg
}

npx tsx scripts/operator/runCaptureRestartSmoke.ts @argsList
exit $LASTEXITCODE
