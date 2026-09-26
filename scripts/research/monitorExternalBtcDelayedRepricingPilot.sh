#!/usr/bin/env bash
# Durable launch + completion monitor for the external BTC delayed-repricing pilot.
#
# Success requires ALL of:
#   - producer Node exit status 0 (not tee)
#   - no OOM / fatal in log
#   - not killed by signal
#   - expected report artifacts present and parseable
#   - all five Friday days present in daySummaries / inputHashes
#
# Usage:
#   NODE_OPTIONS='--max-old-space-size=8192' \
#     bash scripts/research/monitorExternalBtcDelayedRepricingPilot.sh \
#       -- --run-real --authorize-empirical-run --credit-balance-cents 1100

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

OUT="${PILOT_OUT_DIR:-data/research-results/external-kalshi-data-audit/external-btc-delayed-repricing-pilot}"
mkdir -p "$OUT"

# Colon-free stamp: `:` is illegal in Windows filenames and breaks checkout.
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$OUT/run-stdout-monitored-${STAMP}.log"
STATUS="$OUT/run-monitor-status-${STAMP}.txt"
CODE_SHA="$(git rev-parse HEAD)"
EXPECTED_DAYS=(2026-08-14 2026-08-21 2026-08-28 2026-09-04 2026-09-11)
EXPECTED_ARTIFACTS=(
  pilot-report.json
  events.jsonl
  trades.jsonl
  day-summaries.json
  by-delay.json
)

{
  echo "monitor_start_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "code_sha=$CODE_SHA"
  echo "NODE_OPTIONS=${NODE_OPTIONS:-}"
  echo "log=$LOG"
  echo "pid_monitor=$$"
} | tee "$STATUS"

# Keep machine awake while this monitor (and therefore the producer) lives (macOS).
# IMPORTANT: do not `wait` on this job — caffeinate -w $$ blocks until the monitor
# exits, so a bare `wait` deadlocks with it (attempt-3 hang).
CAFFEINE_PID=""
if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -dims -w $$ >/tmp/pilot-caffeinate-monitor.log 2>&1 &
  CAFFEINE_PID=$!
fi

cleanup() {
  if [[ -n "$CAFFEINE_PID" ]]; then
    kill "$CAFFEINE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Live tee without process-substitution + bare-wait deadlock:
# pipe stdout/stderr through tee; capture producer via PIPESTATUS[0].
set +e
set -o pipefail
npm run research:external-btc-delayed-repricing-pilot -- "$@" 2>&1 | tee -a "$LOG"
# Capture PIPESTATUS immediately (before any other command). Under \`set -u\`,
# index into a copy so missing tee slots do not abort.
pipe_statuses=("${PIPESTATUS[@]}")
# Fail closed if PIPESTATUS is somehow empty (do not default producer to 0).
producer_status="${pipe_statuses[0]:-1}"
tee_status="${pipe_statuses[1]:-0}"
pipeline_status="$producer_status"
if [[ "$tee_status" -ne 0 && "$pipeline_status" -eq 0 ]]; then
  pipeline_status="$tee_status"
fi
set +o pipefail
set -e
sync

{
  echo "producer_exit=$producer_status"
  echo "tee_exit=$tee_status"
  echo "pipeline_exit=$pipeline_status"
  echo "monitor_end_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} | tee -a "$STATUS"

fail=0
if [[ "$producer_status" -ne 0 ]]; then
  echo "failure_class=node_nonzero_exit" | tee -a "$STATUS"
  fail=1
fi
if grep -q 'heap out of memory' "$LOG" 2>/dev/null; then
  echo "failure_class=oom" | tee -a "$STATUS"
  fail=1
fi
if grep -qE 'FATAL ERROR|Allocation failed' "$LOG" 2>/dev/null; then
  echo "failure_class=fatal" | tee -a "$STATUS"
  fail=1
fi
# Signal: bash leaves status > 128 when killed by signal
if [[ "$producer_status" -gt 128 ]]; then
  echo "failure_class=signal_termination signal=$((producer_status - 128))" | tee -a "$STATUS"
  fail=1
fi

for f in "${EXPECTED_ARTIFACTS[@]}"; do
  if [[ ! -f "$OUT/$f" ]]; then
    echo "missing_artifact=$f" | tee -a "$STATUS"
    fail=1
  else
    echo "present_artifact=$f size=$(wc -c < "$OUT/$f" | tr -d ' ')" | tee -a "$STATUS"
  fi
done

if [[ ! -f "$OUT/pilot-report.json" ]]; then
  echo "monitor_result=FAILURE" | tee -a "$STATUS"
  echo "empirical_valid=0" | tee -a "$STATUS"
  exit 1
fi

# Validate report JSON + five days + identity fields
if ! NODE_OPTIONS='' node --input-type=module -e '
import fs from "node:fs";
const out = process.argv[1];
const expectedDays = process.argv.slice(2);
const report = JSON.parse(fs.readFileSync(out + "/pilot-report.json", "utf8"));
if (!report?.byDelay || !report?.daySummaries || !Array.isArray(report.trades)) {
  console.error("artifact_validation=structure_failed");
  process.exit(2);
}
const days = report.daySummaries.map((d) => d.utcDay).sort();
const want = [...expectedDays].sort();
if (JSON.stringify(days) !== JSON.stringify(want)) {
  console.error("artifact_validation=day_mismatch got=" + days.join(","));
  process.exit(3);
}
if (report.fridayOnly !== true) {
  console.error("artifact_validation=fridayOnly");
  process.exit(4);
}
if (!report.codeVersions?.memoryArchitecture) {
  console.error("artifact_validation=missing_memory_architecture");
  process.exit(5);
}
if (!report.codeVersions?.contractMetadataVersion) {
  console.error("artifact_validation=missing_contract_metadata_version");
  process.exit(6);
}
console.log("artifact_validation=ok days=" + days.length);
' "$OUT" "${EXPECTED_DAYS[@]}"; then
  echo "monitor_result=FAILURE" | tee -a "$STATUS"
  echo "empirical_valid=0" | tee -a "$STATUS"
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo "monitor_result=FAILURE" | tee -a "$STATUS"
  echo "empirical_valid=0" | tee -a "$STATUS"
  exit 1
fi

echo "monitor_result=SUCCESS" | tee -a "$STATUS"
echo "empirical_valid=1" | tee -a "$STATUS"
exit 0
