#!/usr/bin/env bash
# Thin macOS launcher for the gated eight-hour capture (TypeScript SSoT).
# Requires prior restart + reconnect smoke authorization run dirs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT}"
exec npx tsx scripts/operator/runCaptureWithProgress.ts --preset 8h "$@"
