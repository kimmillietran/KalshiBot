# Thin Windows launcher for six-hour operator capture (TypeScript SSoT).
# NONCANONICAL-DURATION: does not satisfy the eight-hour restart gate.
$ErrorActionPreference = "Stop"
npx tsx scripts/operator/runCaptureWithProgress.ts --preset 6h @args
exit $LASTEXITCODE
