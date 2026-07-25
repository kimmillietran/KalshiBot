#!/usr/bin/env bash
# Thin macOS launcher for the six-hour operator capture (TypeScript SSoT).
# NONCANONICAL-DURATION: does not satisfy the eight-hour restart gate.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT}"
exec npx tsx scripts/operator/runCaptureWithProgress.ts --preset 6h "$@"
