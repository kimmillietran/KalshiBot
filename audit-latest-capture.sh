#!/usr/bin/env bash
# Thin macOS launcher for capture auditing (TypeScript SSoT).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT}"
exec npx tsx scripts/operator/auditCapture.ts "$@"
