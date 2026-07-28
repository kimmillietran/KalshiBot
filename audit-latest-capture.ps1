# Thin Windows launcher for capture auditing (TypeScript SSoT).
# M12.1I: behavior lives in scripts/operator/auditCapture.ts.
param(
    [switch]$Full,
    [string]$RunDir,
    [string]$RunId,
    [switch]$Latest
)

$ErrorActionPreference = "Stop"

$argsList = @()
if ($Full) { $argsList += "--full" }
if ($RunDir) { $argsList += @("--run-dir", $RunDir) }
elseif ($RunId) { $argsList += @("--run-id", $RunId) }
elseif ($Latest) { $argsList += "--latest" }
else { $argsList += "--latest" }

npx tsx scripts/operator/auditCapture.ts @argsList
exit $LASTEXITCODE
