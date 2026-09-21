#!/usr/bin/env bash
# M16.2b governed daily validation runner wrapper (macOS launchd).
# - Sources Kalshi credentials without printing secrets
# - Exports M16_VALIDATION_ALLOW_LIVE_CAPTURE=1
# - Wraps the lifecycle in caffeinate so idle sleep does not interrupt capture
# - Does NOT boot a powered-off machine
# - Does NOT authorize a shifted/late window
#
# launchd StartCalendarInterval uses the Mac LOCAL clock (Hours 10 + 11).
# Child TZ=UTC below does NOT rematerialize those calendar hours as UTC.
# The TypeScript runner gate remains the sole scientific authority for
# 18:00–22:00Z eligibility (tolerance 17:55–18:05Z).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

# Prefer primary checkout env loader; fall back to repo-root gitignored loader.
ENV_LOADER=""
if [[ -f "/Users/builder/Desktop/KalshiBot/load-kalshi-env.sh" ]]; then
  ENV_LOADER="/Users/builder/Desktop/KalshiBot/load-kalshi-env.sh"
elif [[ -f "${REPO_ROOT}/load-kalshi-env.sh" ]]; then
  ENV_LOADER="${REPO_ROOT}/load-kalshi-env.sh"
fi

if [[ -z "${ENV_LOADER}" ]]; then
  echo "M16.2b: missing load-kalshi-env.sh (expected KalshiBot primary or repo root)" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "${ENV_LOADER}"

if [[ -z "${KALSHI_API_KEY_ID:-}" || -z "${KALSHI_API_PRIVATE_KEY_PATH:-}" ]]; then
  echo "M16.2b: Kalshi credentials not loaded" >&2
  exit 1
fi

export M16_VALIDATION_ALLOW_LIVE_CAPTURE=1
export TZ=UTC
export M16_VALIDATION_CAFFEINATE=1

LOG_DIR="${REPO_ROOT}/data/research-results/m16-validation-collection/scheduler"
mkdir -p "${LOG_DIR}"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
echo "M16.2b launch ${STAMP} repo=${REPO_ROOT} caffeinate=1 live=1" >> "${LOG_DIR}/wrapper.log"

# caffeinate once the job is running; never claims missed late wakes are OK.
exec /usr/bin/caffeinate -dims \
  /usr/bin/env npm run research:m16-validation-collection -- --run-daily
