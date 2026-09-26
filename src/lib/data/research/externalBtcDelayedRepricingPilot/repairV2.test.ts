/**
 * Repair-v2 regressions: ticker expiry recovery, payout envelopes, monitor status,
 * and bounded historical-data replay parity.
 */

import { writeFileSync, chmodSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { parseCloseTimeMsFromTicker } from "@/lib/data/research/m17RetainedInputRecoveryAudit/offlineDerivers";

import {
  applyTickToBook,
  applyTickToBookFullScan,
  bboFromBook,
  bboFromBookFullScan,
  createEmptyBook,
  hashBookState,
  kalshiExecutableFromYesBbo,
  parseTickLine,
  shouldEmitBbo,
} from "./bookReplay";
import {
  CONTRACT_METADATA_VERSION,
  isCurrentContractSidecar,
  resolveContractWindow,
} from "./contractMetadata";
import { simulateEventTrade } from "./simulateTrades";
import type { ExecutableQuote, ExternalBtcEvent, SelectedContract } from "./types";

function quote(
  timestampMs: number,
  yesBid: number,
  yesAsk: number,
  sizes = { bid: 5, ask: 5 },
): ExecutableQuote {
  return {
    timestampMs,
    clockDomain: "adapter",
    timestampSource: "adapter",
    adapterTimestampMs: timestampMs,
    exchangeTimestampMs: timestampMs,
    yesBidCents: yesBid,
    yesAskCents: yesAsk,
    yesBidSize: sizes.bid,
    yesAskSize: sizes.ask,
    noBidCents: 100 - yesAsk,
    noAskCents: 100 - yesBid,
    noBidSize: sizes.ask,
    noAskSize: sizes.bid,
    stale: false,
    chainBreak: false,
    failClosed: false,
  };
}

function primaryEvent(
  partial: Partial<ExternalBtcEvent>
    & Pick<ExternalBtcEvent, "eventId" | "eventTimestampMs" | "direction">,
): ExternalBtcEvent {
  return {
    utcDay: "2026-08-14",
    timestampSource: "adapter",
    clockDomain: "adapter",
    returnBps: partial.direction === "up" ? 8 : -8,
    absoluteReturnBps: 8,
    lookbackMs: 5_000,
    btcPriceUsd: 100_000,
    controlKind: "primary",
    controlNote: null,
    ...partial,
  };
}

const CONTRACT: SelectedContract = {
  ticker: "KXBTC15M-TEST",
  startMs: 0,
  expiryMs: 1_000_000,
};

describe("contract metadata expiry recovery", () => {
  it("exports a version distinct from quote-cache schema", () => {
    expect(CONTRACT_METADATA_VERSION).toBe("ticker-hhmm-america-new-york-close-v1");
  });

  it("uses ticker HHMM America/New_York when header expiry is null", () => {
    const ticker = "KXBTC15M-26AUG141945-45";
    const derived = parseCloseTimeMsFromTicker(ticker);
    expect(derived).not.toBeNull();
    const resolved = resolveContractWindow({
      ticker,
      headerStart: "2026-08-14 23:30:00",
      headerExpiry: null,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.source).toBe("header-start+ticker-hhmm-ny-close");
    expect(resolved.contract.expiryMs).toBe(derived);
    expect(resolved.contract.startMs).toBe(Date.parse("2026-08-14T23:30:00.000Z"));
  });

  it("cross-checks ticker close against known header expiry (exact match)", () => {
    const ticker = "KXBTC15M-26AUG271945-45";
    const resolved = resolveContractWindow({
      ticker,
      headerStart: "2026-08-27 23:30:00",
      headerExpiry: "2026-08-27 23:45:00",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.source).toBe("header-start+header-expiry");
    expect(resolved.headerExpiryMs).toBe(resolved.tickerDerivedExpiryMs);
  });

  it("rejects header↔ticker expiry conflicts explicitly", () => {
    const resolved = resolveContractWindow({
      ticker: "KXBTC15M-26AUG271945-45",
      headerStart: "2026-08-27 23:30:00",
      headerExpiry: "2026-08-27 23:50:00",
    });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.source).toBe("rejected-header-expiry-ticker-mismatch");
  });

  it("rejects missing start without guessing", () => {
    const resolved = resolveContractWindow({
      ticker: "KXBTC15M-26AUG141945-45",
      headerStart: null,
      headerExpiry: null,
    });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.source).toBe("rejected-missing-start");
  });

  it("rejects pre-repair / incomplete contract sidecars", () => {
    expect(
      isCurrentContractSidecar({
        zipSha256: "a".repeat(64),
        contracts: [],
        keys: {},
      }),
    ).toBe(false);
    expect(
      isCurrentContractSidecar({
        zipSha256: "a".repeat(64),
        contractMetadataVersion: CONTRACT_METADATA_VERSION,
        contracts: [],
        keys: {},
        // missing derivationStats
      }),
    ).toBe(false);
    expect(
      isCurrentContractSidecar({
        zipSha256: "a".repeat(64),
        contractMetadataVersion: CONTRACT_METADATA_VERSION,
        contracts: [],
        keys: {},
        derivationStats: {
          headerExpiryUsed: 0,
          tickerCloseUsed: 0,
          rejected: 0,
          rejectReasons: {},
        },
      }),
    ).toBe(true);
  });
});

describe("unresolved payout envelopes", () => {
  it("uses 0−cost / 100−cost envelopes and keeps last-bid as MTM only", () => {
    const event = primaryEvent({ eventId: "e1", eventTimestampMs: 10_000, direction: "up" });
    const quotes = [
      quote(10_000, 48, 50),
      quote(11_000, 48, 50),
      quote(25_000, 55, 57),
      quote(26_000, 55, 57, { bid: 0, ask: 0 }),
    ];
    const trade = simulateEventTrade({
      event,
      delayMs: 1_000,
      holdMs: 15_000,
      contract: CONTRACT,
      quotes,
      minDisplayedSize: 1,
      staleMaxAgeMs: 2_000,
      openUntilMs: null,
      cooldownUntilMs: null,
      decisionClockDomain: "adapter",
    });
    expect(trade.entryStatus).toBe("entered");
    expect(trade.exitStatus).toBe("unresolved");
    expect(trade.entryPriceCents).toBe(50);
    expect(trade.entryFeeCents).toBeGreaterThan(0);
    const cost = trade.entryPriceCents! + trade.entryFeeCents;
    expect(trade.allEntryLowerBoundNetCents).toBe(0 - cost);
    expect(trade.allEntryUpperBoundNetCents).toBe(100 - cost);
    expect(trade.unresolvedMarkToMarketNetCents).toBe(55 - cost);
    expect(trade.allEntryUpperBoundNetCents!).toBeGreaterThan(
      trade.unresolvedMarkToMarketNetCents!,
    );
  });
});

describe("monitor producer-status capture", () => {
  it("keeps monitor status stamp colon-free for Windows paths", () => {
    const src = readFileSync(
      join(process.cwd(), "scripts/research/monitorExternalBtcDelayedRepricingPilot.sh"),
      "utf8",
    );
    expect(src).toMatch(/STAMP="\$\(date -u \+%Y%m%dT%H%M%SZ\)"/);
    expect(src).not.toMatch(/STAMP="\$\(date -u \+%Y%m%dT%H:%M:%SZ\)"/);
    expect(src).toMatch(/producer_status="\$\{pipe_statuses\[0\]:-1\}"/);
  });

  function writeMonitor(dir: string): string {
    const monitor = join(dir, "monitor.sh");
    // Replica of the fixed pipefail + PIPESTATUS pattern (no bare wait / no caffeinate deadlock).
    writeFileSync(
      monitor,
      `#!/usr/bin/env bash
set -euo pipefail
OUT="$1"
PRODUCER="$2"
LOG="$OUT/log.txt"
STATUS="$OUT/status.txt"
mkdir -p "$OUT"
# Background job that must NOT be waited on with bare \`wait\` (attempt-3 hang class).
(sleep 30) &
BG_PID=$!
cleanup() { kill "$BG_PID" 2>/dev/null || true; }
trap cleanup EXIT
set +e
set -o pipefail
bash "$PRODUCER" 2>&1 | tee -a "$LOG"
pipe_statuses=("\${PIPESTATUS[@]}")
producer_status="\${pipe_statuses[0]:-1}"
tee_status="\${pipe_statuses[1]:-0}"
pipeline_status="\$producer_status"
if [[ "\$tee_status" -ne 0 && "\$pipeline_status" -eq 0 ]]; then
  pipeline_status="\$tee_status"
fi
set +o pipefail
set -e
{
  echo "producer_exit=\$producer_status"
  echo "tee_exit=\$tee_status"
  echo "pipeline_exit=\$pipeline_status"
} | tee -a "$STATUS"
if [[ "\$producer_status" -gt 128 ]]; then
  echo "failure_class=signal_termination" | tee -a "$STATUS"
  echo "monitor_result=FAILURE" | tee -a "$STATUS"
  exit 1
fi
if [[ "\$producer_status" -ne 0 ]]; then
  echo "monitor_result=FAILURE" | tee -a "$STATUS"
  exit 1
fi
if [[ ! -f "$OUT/pilot-report.json" ]]; then
  echo "monitor_result=FAILURE" | tee -a "$STATUS"
  echo "missing_artifact=pilot-report.json" | tee -a "$STATUS"
  exit 1
fi
echo "monitor_result=SUCCESS" | tee -a "$STATUS"
exit 0
`,
      { mode: 0o755 },
    );
    chmodSync(monitor, 0o755);
    return monitor;
  }

  it("captures zero producer exit on success without hanging on background job", () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-mon-ok-"));
    writeFileSync(
      join(dir, "producer.sh"),
      `#!/usr/bin/env bash
echo "ok"
mkdir -p "${dir}/out"
echo '{"ok":true}' > "${dir}/out/pilot-report.json"
exit 0
`,
      { mode: 0o755 },
    );
    const r = spawnSync(
      "bash",
      [writeMonitor(dir), `${dir}/out`, join(dir, "producer.sh")],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/producer_exit=0/);
    expect(r.stdout).toMatch(/monitor_result=SUCCESS/);
  });

  it("captures nonzero producer exit", () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-mon-fail-"));
    writeFileSync(
      join(dir, "producer.sh"),
      `#!/usr/bin/env bash
echo "boom" >&2
exit 7
`,
      { mode: 0o755 },
    );
    const r = spawnSync(
      "bash",
      [writeMonitor(dir), `${dir}/out`, join(dir, "producer.sh")],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/producer_exit=7/);
  });

  it("fails when output artifacts are missing even if producer exits 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-mon-miss-"));
    writeFileSync(
      join(dir, "producer.sh"),
      `#!/usr/bin/env bash
echo "no artifact"
exit 0
`,
      { mode: 0o755 },
    );
    const r = spawnSync(
      "bash",
      [writeMonitor(dir), `${dir}/out`, join(dir, "producer.sh")],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/missing_artifact=pilot-report.json/);
  });

  it("captures signal-class exit status (>128) as failure", () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-mon-sig-"));
    // Simulate bash's 128+SIGTERM encoding without relying on self-signal delivery in a pipe.
    writeFileSync(
      join(dir, "producer.sh"),
      `#!/usr/bin/env bash
echo "terminated"
exit 143
`,
      { mode: 0o755 },
    );
    const r = spawnSync(
      "bash",
      [writeMonitor(dir), `${dir}/out`, join(dir, "producer.sh")],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(r.status).not.toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/producer_exit=143/);
    expect(out).toMatch(/failure_class=signal_termination|monitor_result=FAILURE/);
  });
});

describe("historical-data replay parity (bounded sample)", () => {
  const coinbasePath =
    "/Users/builder/Developer/kalshi-builder2/data/external-samples/cryptostruct/"
    + "coinbase-btc-usd/raw/coinbase-BTC-USD-2026-08-28.txt.zst";
  const kalshiZip =
    "/Users/builder/Developer/kalshi-builder2/data/external-samples/cryptostruct/m16-er/raw/"
    + "kalshi-btc-15m_2026-08-28.zip";

  it("matches incremental vs full-scan on a snapshot-initialized retained Coinbase sample", () => {
    if (!existsSync(coinbasePath)) {
      expect(existsSync(coinbasePath)).toBe(false);
      return;
    }

    const sample = spawnSync(
      "bash",
      ["-lc", `zstd -dc ${JSON.stringify(coinbasePath)} | head -n 400`],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    expect(sample.status === 0 || sample.status === 141).toBe(true);
    const lines = sample.stdout.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(20);

    const inc = createEmptyBook();
    const full = createEmptyBook();
    let prevInc: ReturnType<typeof bboFromBook> = null;
    let prevFull: ReturnType<typeof bboFromBook> = null;
    const quotesInc: unknown[] = [];
    const quotesFull: unknown[] = [];
    let applied = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed[0] === "{") continue;
      const tick = parseTickLine(trimmed);
      if (!tick || (tick.msgType !== 0 && tick.msgType !== 1)) continue;
      applied += 1;
      const a = applyTickToBook(inc, tick);
      const b = applyTickToBookFullScan(full, tick);
      expect(a.chainBreak).toBe(b.chainBreak);
      const qi = bboFromBook(inc, tick, a.chainBreak);
      const qf = bboFromBookFullScan(full, tick, b.chainBreak);
      if (qi && shouldEmitBbo(prevInc, qi)) {
        quotesInc.push({
          t: qi.timestampMs,
          bid: qi.bid,
          ask: qi.ask,
          bs: qi.bidSize,
          as: qi.askSize,
          fc: qi.failClosed,
          cb: qi.chainBreak,
        });
        prevInc = qi;
      }
      if (qf && shouldEmitBbo(prevFull, qf)) {
        quotesFull.push({
          t: qf.timestampMs,
          bid: qf.bid,
          ask: qf.ask,
          bs: qf.bidSize,
          as: qf.askSize,
          fc: qf.failClosed,
          cb: qf.chainBreak,
        });
        prevFull = qf;
      }
      if (applied >= 120) break;
    }

    expect(applied).toBeGreaterThan(50);
    expect(quotesInc).toEqual(quotesFull);
    expect(hashBookState(inc)).toBe(hashBookState(full));
  });

  it("matches incremental vs full-scan on a retained Kalshi member sample", () => {
    if (!existsSync(kalshiZip)) {
      expect(existsSync(kalshiZip)).toBe(false);
      return;
    }

    const members = spawnSync("unzip", ["-Z1", kalshiZip], { encoding: "utf8" });
    const candidates = members.stdout
      .split("\n")
      .filter((m) => m.includes("KXBTC15M") && m.endsWith(".txt.zst"));
    // Prefer a member with enough L2 messages (some early windows are nearly empty).
    let member: string | null = null;
    for (const cand of candidates.slice(0, 12)) {
      const probe = spawnSync(
        "bash",
        [
          "-lc",
          `unzip -p ${JSON.stringify(kalshiZip)} ${JSON.stringify(cand)} | zstd -dc | head -n 80 | wc -l`,
        ],
        { encoding: "utf8" },
      );
      const n = Number((probe.stdout || "").trim());
      if (Number.isFinite(n) && n >= 50) {
        member = cand;
        break;
      }
    }
    expect(member).not.toBeNull();

    const sample = spawnSync(
      "bash",
      [
        "-lc",
        `unzip -p ${JSON.stringify(kalshiZip)} ${JSON.stringify(member)} | zstd -dc | head -n 250`,
      ],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    expect(sample.status === 0 || sample.status === 141).toBe(true);
    const lines = sample.stdout.split("\n").filter(Boolean);

    const inc = createEmptyBook();
    const full = createEmptyBook();
    let prevInc: ReturnType<typeof bboFromBook> = null;
    let prevFull: ReturnType<typeof bboFromBook> = null;
    const quotesInc: unknown[] = [];
    const quotesFull: unknown[] = [];
    let applied = 0;
    let headerDone = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (!headerDone) {
        headerDone = true;
        continue;
      }
      const tick = parseTickLine(trimmed);
      if (!tick || (tick.msgType !== 0 && tick.msgType !== 1)) continue;
      applied += 1;
      const a = applyTickToBook(inc, tick);
      const b = applyTickToBookFullScan(full, tick);
      expect(a.chainBreak).toBe(b.chainBreak);
      const qi = bboFromBook(inc, tick, a.chainBreak);
      const qf = bboFromBookFullScan(full, tick, b.chainBreak);
      if (qi && shouldEmitBbo(prevInc, qi)) {
        quotesInc.push(kalshiExecutableFromYesBbo(qi));
        prevInc = qi;
      }
      if (qf && shouldEmitBbo(prevFull, qf)) {
        quotesFull.push(kalshiExecutableFromYesBbo(qf));
        prevFull = qf;
      }
      if (applied >= 100) break;
    }

    expect(applied).toBeGreaterThan(40);
    expect(quotesInc).toEqual(quotesFull);
    expect(hashBookState(inc)).toBe(hashBookState(full));
  });
});
