/**
 * Process a single UTC day: ingest → detect → simulate → persist day result.
 * Designed to run in a child process so heap is reclaimed between days.
 */

import type { BboPoint } from "./bookReplay";
import { REPLAY_IMPLEMENTATION_VERSION } from "./bookReplay";
import {
  DAY_RESULT_SCHEMA_VERSION,
  dayResultIdentityKey,
  dayResultPath,
  defaultCacheRoot,
  QUOTE_CACHE_SCHEMA_VERSION,
  readCompleteDayResult,
  simulationSpecHash,
  writeDayResult,
  type DayResultIdentity,
} from "./checkpoint";
import { buildDiagnosticControls } from "./detectExternalEvents";
import {
  ingestCoinbaseSparseBbo,
  ingestKalshiDayQuotes,
  loadQuotesArray,
  readJsonlRecords,
} from "./ingestBounded";
import { FROZEN_PILOT_SPEC } from "./pilotSpec";
import { createProgressReporter } from "./progress";
import { simulateDayTrades } from "./simulateTrades";
import { CLOCK_POLICY, delayClaimSupport } from "./timingQuality";
import {
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
  PILOT_DELAY_MS,
  type ExecutableQuote,
  type ExternalBtcEvent,
  type SimulatedTrade,
} from "./types";

function summarizeDayPrimary(utcDay: string, trades: readonly SimulatedTrade[]) {
  const primary = trades.filter((t) => t.controlKind === "primary");
  const entered = primary.filter((t) => t.entryStatus === "entered");
  const completed = entered.filter((t) => t.exitStatus === "completed");
  const unresolved = entered.filter((t) => t.exitStatus === "unresolved");
  const completedNets = completed
    .map((t) => t.completedNetPnlCents)
    .filter((v): v is number => v !== null);
  return {
    utcDay,
    weekday: "Friday" as const,
    primaryEventCount: primary.length,
    preEntryRejectCount: primary.filter((t) => t.entryStatus === "rejected-pre-entry").length,
    enteredCount: entered.length,
    completedExitCount: completed.length,
    unresolvedExitCount: unresolved.length,
    completedMeanNetPnlCents:
      completedNets.length === 0
        ? null
        : completedNets.reduce((a, b) => a + b, 0) / completedNets.length,
  };
}

function basisPointsChange(start: number, end: number): number {
  if (!(start > 0) || !(end > 0)) return 0;
  return ((end - start) / start) * 10_000;
}

/** Stream Coinbase sparse BBO JSONL and emit primary events (rolling lookback). */
async function detectEventsFromCoinbaseJsonl(input: {
  utcDay: string;
  jsonlPath: string;
}): Promise<ExternalBtcEvent[]> {
  const lookbackMs = FROZEN_PILOT_SPEC.eventDefinition.lookbackMs;
  const boundaryBps = FROZEN_PILOT_SPEC.eventDefinition.boundaryBps;
  const cooldownMs = FROZEN_PILOT_SPEC.positionPolicy.cooldownMs;
  const events: ExternalBtcEvent[] = [];
  const window: BboPoint[] = [];
  let lookbackStartIdx = 0;
  let lastTriggerMs = Number.NEGATIVE_INFINITY;
  let previousAbsolute = 0;
  let counter = 0;

  for await (const point of readJsonlRecords<BboPoint>(input.jsonlPath)) {
    window.push(point);
    const lookbackTarget = point.timestampMs - lookbackMs;
    while (
      lookbackStartIdx + 1 < window.length - 1
      && window[lookbackStartIdx + 1]!.timestampMs <= lookbackTarget
    ) {
      lookbackStartIdx += 1;
    }
    if (lookbackStartIdx > 0) {
      window.splice(0, lookbackStartIdx);
      lookbackStartIdx = 0;
    }
    if (point.failClosed || point.chainBreak) continue;
    if (point.clockDomain !== CLOCK_POLICY.decisionClockDomain) continue;
    if (!(window.length >= 2 && window[0]!.timestampMs <= lookbackTarget)) continue;
    let lookbackPoint = window[0]!;
    for (let i = 0; i < window.length - 1; i += 1) {
      const candidate = window[i]!;
      if (candidate.timestampMs <= lookbackTarget) lookbackPoint = candidate;
      else break;
    }
    if (lookbackPoint.timestampMs >= point.timestampMs) continue;
    const returnBps = basisPointsChange(lookbackPoint.mid, point.mid);
    const absolute = Math.abs(returnBps);
    const crossed = previousAbsolute < boundaryBps && absolute >= boundaryBps;
    previousAbsolute = absolute;
    if (!crossed || returnBps === 0) continue;
    if (point.timestampMs - lastTriggerMs < cooldownMs) continue;
    lastTriggerMs = point.timestampMs;
    counter += 1;
    events.push({
      eventId: `${input.utcDay}-btc-${counter}`,
      utcDay: input.utcDay,
      eventTimestampMs: point.timestampMs,
      timestampSource: point.timestampSource,
      clockDomain: point.clockDomain,
      direction: returnBps > 0 ? "up" : "down",
      returnBps,
      absoluteReturnBps: absolute,
      lookbackMs,
      btcPriceUsd: point.mid,
      controlKind: "primary",
      controlNote: null,
    });
  }
  return events;
}

export async function processOnePilotDay(input: {
  utcDay: string;
  coinbaseTickPath: string;
  kalshiZipPath: string;
  outDir: string;
  progressIntervalMs?: number;
}): Promise<{ dayResultKey: string; reused: boolean; path: string }> {
  const started = Date.now();
  let peakRss = process.memoryUsage().rss;
  const progress = createProgressReporter({
    intervalMs: input.progressIntervalMs ?? 5_000,
  });
  progress.setDay(input.utcDay);

  try {
    const cacheRoot = defaultCacheRoot(input.outDir);

    progress.setStage("hash-inputs");
    const coinbase = await ingestCoinbaseSparseBbo({
      utcDay: input.utcDay,
      coinbaseTickPath: input.coinbaseTickPath,
      cacheRoot,
      progress,
    });
    peakRss = Math.max(peakRss, process.memoryUsage().rss);

    const kalshi = await ingestKalshiDayQuotes({
      utcDay: input.utcDay,
      kalshiZipPath: input.kalshiZipPath,
      cacheRoot,
      progress,
    });
    peakRss = Math.max(peakRss, process.memoryUsage().rss);

    const identity: DayResultIdentity = {
      kind: "day-result",
      schemaVersion: DAY_RESULT_SCHEMA_VERSION,
      analysisVersion: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
      simulationSpecSha256: simulationSpecHash(),
      replayImplementation: REPLAY_IMPLEMENTATION_VERSION,
      quoteCacheSchemaVersion: QUOTE_CACHE_SCHEMA_VERSION,
      coinbaseRawSha256: coinbase.rawSha256,
      kalshiZipSha256: kalshi.zipSha256,
      utcDay: input.utcDay,
    };
    const dayKey = dayResultIdentityKey(identity);
    const resultPath = dayResultPath(cacheRoot, dayKey);
    const existing = readCompleteDayResult(resultPath, identity);
    if (existing) {
      progress.note(`reuse day result ${dayKey.slice(0, 12)}`);
      return { dayResultKey: dayKey, reused: true, path: resultPath };
    }

    progress.setStage("detect-events", coinbase.jsonlPath);
    const events = await detectEventsFromCoinbaseJsonl({
      utcDay: input.utcDay,
      jsonlPath: coinbase.jsonlPath,
    });
    peakRss = Math.max(peakRss, process.memoryUsage().rss);

    const controls = buildDiagnosticControls(
      events,
      FROZEN_PILOT_SPEC.execution.holdMs,
      PILOT_DELAY_MS.PRIMARY,
    );
    const allEvents: ExternalBtcEvent[] = [...events, ...controls];

    progress.setStage("simulate");
    const quotesByTicker = new Map<string, ExecutableQuote[]>();
    for (const [ticker, meta] of kalshi.quotesByTickerPaths) {
      quotesByTicker.set(ticker, await loadQuotesArray(meta.jsonlPath));
    }
    peakRss = Math.max(peakRss, process.memoryUsage().rss);

    const allTrades: SimulatedTrade[] = [];
    const timingNotes: Array<{ eventId: string; delayMs: number; status: string }> = [];

    for (const delayMs of PILOT_DELAY_MS.SENSITIVITY) {
      const runnablePrimary: ExternalBtcEvent[] = [];
      for (const event of events) {
        const status = delayClaimSupport({
          delayMs,
          decisionClockDomain: CLOCK_POLICY.decisionClockDomain,
          eventClockDomain: event.clockDomain,
          quoteClockDomain: CLOCK_POLICY.decisionClockDomain,
          eventHasDomainTimestamp: true,
          quoteHasDomainTimestamp: true,
        });
        timingNotes.push({ eventId: event.eventId, delayMs, status });
        if (status === "blocked-domain-mix" || status === "blocked-missing-timestamps") {
          allTrades.push({
            eventId: event.eventId,
            utcDay: event.utcDay,
            delayMs,
            controlKind: event.controlKind,
            side: event.direction === "up" ? "YES" : "NO",
            contract: null,
            entryStatus: "rejected-pre-entry",
            exitStatus: "not-applicable",
            entryTimestampMs: event.eventTimestampMs + delayMs,
            intendedExitTimestampMs:
              event.eventTimestampMs + delayMs + FROZEN_PILOT_SPEC.execution.holdMs,
            exitTimestampMs: null,
            entryPriceCents: null,
            exitPriceCents: null,
            entryFeeCents: 0,
            exitFeeCents: 0,
            grossPnlCents: null,
            completedNetPnlCents: null,
            allEntryLowerBoundNetCents: null,
            allEntryUpperBoundNetCents: null,
            preEntryRejectReason: "timing-quality-block",
            exitFailureReason: null,
            excluded: true,
            exclusionReason: "timing-quality-block",
          });
        } else {
          runnablePrimary.push(event);
        }
      }

      allTrades.push(
        ...simulateDayTrades({
          events: runnablePrimary,
          delayMs,
          holdMs: FROZEN_PILOT_SPEC.execution.holdMs,
          contracts: kalshi.contracts,
          quotesByTicker,
          minDisplayedSize: FROZEN_PILOT_SPEC.execution.minDisplayedSize,
          staleMaxAgeMs: FROZEN_PILOT_SPEC.execution.staleMaxAgeMs,
          cooldownMs: FROZEN_PILOT_SPEC.positionPolicy.cooldownMs,
          decisionClockDomain: CLOCK_POLICY.decisionClockDomain,
        }),
      );

      for (const control of controls) {
        const status = delayClaimSupport({
          delayMs,
          decisionClockDomain: CLOCK_POLICY.decisionClockDomain,
          eventClockDomain: control.clockDomain,
          quoteClockDomain: CLOCK_POLICY.decisionClockDomain,
          eventHasDomainTimestamp: true,
          quoteHasDomainTimestamp: true,
        });
        if (status === "blocked-domain-mix" || status === "blocked-missing-timestamps") {
          continue;
        }
        allTrades.push(
          ...simulateDayTrades({
            events: [control],
            delayMs,
            holdMs: FROZEN_PILOT_SPEC.execution.holdMs,
            contracts: kalshi.contracts,
            quotesByTicker,
            minDisplayedSize: FROZEN_PILOT_SPEC.execution.minDisplayedSize,
            staleMaxAgeMs: FROZEN_PILOT_SPEC.execution.staleMaxAgeMs,
            cooldownMs: FROZEN_PILOT_SPEC.positionPolicy.cooldownMs,
            decisionClockDomain: CLOCK_POLICY.decisionClockDomain,
          }),
        );
      }
    }

    progress.setStage("write-day-result");
    const kalshiQuoteCacheKeys: Record<string, string> = {};
    for (const [ticker, meta] of kalshi.quotesByTickerPaths) {
      kalshiQuoteCacheKeys[ticker] = meta.key;
    }

    writeDayResult(resultPath, {
      ...identity,
      complete: true,
      writtenAtIso: new Date().toISOString(),
      contracts: kalshi.contracts,
      events: allEvents,
      trades: allTrades,
      daySummary: summarizeDayPrimary(
        input.utcDay,
        allTrades.filter(
          (t) => t.delayMs === PILOT_DELAY_MS.PRIMARY && t.controlKind === "primary",
        ),
      ),
      timingNotes,
      coinbaseQuoteCacheKey: coinbase.key,
      kalshiQuoteCacheKeys,
      peakRssBytes: Math.max(peakRss, process.memoryUsage().rss),
      elapsedMs: Date.now() - started,
    });

    quotesByTicker.clear();
    return { dayResultKey: dayKey, reused: false, path: resultPath };
  } finally {
    progress.close();
  }
}
