#!/usr/bin/env bash
# Launch repair-v2 monitored pilot and keep the process group alive.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=data/research-results/external-kalshi-data-audit/external-btc-delayed-repricing-pilot
mkdir -p "$OUT"
export NODE_OPTIONS='--max-old-space-size=8192'
exec bash scripts/research/monitorExternalBtcDelayedRepricingPilot.sh \
  -- --run-real --authorize-empirical-run --credit-balance-cents 1100
