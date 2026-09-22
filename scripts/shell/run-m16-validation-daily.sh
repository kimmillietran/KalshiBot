#!/usr/bin/env bash
# M16.2c governed daily validation runner wrapper (macOS launchd).
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
#
# Env loader priority (repo-local wins over Desktop — required for unattended
# runtime outside ~/Desktop privacy boundary):
#   1. KALSHI_ENV_LOADER (explicit override)
#   2. ${REPO_ROOT}/load-kalshi-env.sh
#   3. legacy Desktop KalshiBot loader (interactive fallback only)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

ENV_LOADER=""
if [[ -n "${KALSHI_ENV_LOADER:-}" && -f "${KALSHI_ENV_LOADER}" ]]; then
  ENV_LOADER="${KALSHI_ENV_LOADER}"
elif [[ -f "${REPO_ROOT}/load-kalshi-env.sh" ]]; then
  ENV_LOADER="${REPO_ROOT}/load-kalshi-env.sh"
elif [[ -f "/Users/builder/Desktop/KalshiBot/load-kalshi-env.sh" ]]; then
  ENV_LOADER="/Users/builder/Desktop/KalshiBot/load-kalshi-env.sh"
fi

if [[ -z "${ENV_LOADER}" ]]; then
  echo "M16.2c: missing load-kalshi-env.sh (set KALSHI_ENV_LOADER or add ${REPO_ROOT}/load-kalshi-env.sh)" >&2
  exit 1
fi

# Log only the path label — never secret contents.
echo "M16.2c: sourcing env loader from ${ENV_LOADER}" >&2

# shellcheck disable=SC1090
source "${ENV_LOADER}"

if [[ -z "${KALSHI_API_KEY_ID:-}" || -z "${KALSHI_API_PRIVATE_KEY_PATH:-}" ]]; then
  echo "M16.2c: Kalshi credentials not loaded" >&2
  exit 1
fi

export M16_VALIDATION_ALLOW_LIVE_CAPTURE=1
export TZ=UTC
export M16_VALIDATION_CAFFEINATE=1
# launchd default PATH lacks Homebrew; ensure npm/node resolve unattended.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

LOG_DIR="${REPO_ROOT}/data/research-results/m16-validation-collection/scheduler"
mkdir -p "${LOG_DIR}"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
echo "M16.2c launch ${STAMP} repo=${REPO_ROOT} loader=${ENV_LOADER} caffeinate=1 live=1" >> "${LOG_DIR}/wrapper.log"

# caffeinate once the job is running; never claims missed late wakes are OK.
exec /usr/bin/caffeinate -dims \
  /usr/bin/env npm run research:m16-validation-collection -- --run-daily
