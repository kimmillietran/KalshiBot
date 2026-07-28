#!/usr/bin/env bash
# Thin macOS launcher for the cross-platform reconnect smoke (TypeScript SSoT).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT}"
exec npx tsx scripts/operator/runCaptureReconnectSmoke.ts "$@"
