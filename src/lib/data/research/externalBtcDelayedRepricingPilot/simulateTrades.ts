/**
 * Deterministic exit-failure + entry/exit separation.
 */

import {
  computeKalshiScheduleFeeCents,
  KALSHI_FEE_SCHEDULE_ROLE,
  KALSHI_FEE_SCHEDULE_VARIANT,
} from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";

import { joinAsOf } from "./causalAsOfJoin";
import type {
  ExecutableQuote,
  ExitFailureReason,
  ExternalBtcEvent,
  PilotDelayMs,
  PreEntryRejectReason,
  SelectedContract,
  SimulatedTrade,
} from "./types";

export const EXIT_FAILURE_POLICY = {
  id: "retain-entry-unresolved-v1",
  description:
    "After a successful entry, a failed exit marks the position unresolved but retains "
    + "overlap/cooldown through intendedExitTimestampMs. Completed-trade P&L excludes "
    + "unresolved rows. All-entry economics report terminal-payout envelopes "
    + "(0−entryCost / 100−entryCost). Last-observed bid is a separate mark-to-market "
    + "scenario, not an upper bound.",
  lowerBound:
    "Unresolved terminal-payout floor: exit value = 0¢; exitFee = 0; "
    + "net = 0 − entryPrice − entryFee. STANDARD taker fee at price 0 is 0, so a "
    + "modeled sell-at-0 cannot go below this floor under the frozen fee contract.",
  upperBound:
    "Unresolved terminal-payout ceiling: exit value = 100¢; exitFee = 0; "
    + "net = 100 − entryPrice − entryFee (settlement win / sell at 100 with fee 0).",
  markToMarketScenario:
    "Unresolved MTM (not a bound): if a last same-side bid exists at/before intended "
    + "exit, net = bid − entryPrice − entryFee (no exit fee); else null.",
  primaryIfAnyUnresolved: "incomplete-unresolved-exits",
} as const;

export function directionalSide(event: ExternalBtcEvent): "YES" | "NO" {
  return event.direction === "up" ? "YES" : "NO";
}

function entryAsk(quote: ExecutableQuote, side: "YES" | "NO"): { price: number; size: number } {
  return side === "YES"
    ? { price: quote.yesAskCents, size: quote.yesAskSize }
    : { price: quote.noAskCents, size: quote.noAskSize };
}

function exitBid(quote: ExecutableQuote, side: "YES" | "NO"): { price: number; size: number } {
  return side === "YES"
    ? { price: quote.yesBidCents, size: quote.yesBidSize }
    : { price: quote.noBidCents, size: quote.noBidSize };
}

function takerFee(priceCents: number): number {
  return computeKalshiScheduleFeeCents({
    quantity: 1,
    priceCents,
    role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
    schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
  });
}

function makeReject(input: {
  event: ExternalBtcEvent;
  delayMs: PilotDelayMs;
  side: "YES" | "NO";
  contract: SelectedContract | null;
  entryTimestampMs: number;
  intendedExitTimestampMs: number;
  reason: PreEntryRejectReason;
}): SimulatedTrade {
  return {
    eventId: input.event.eventId,
    utcDay: input.event.utcDay,
    delayMs: input.delayMs,
    controlKind: input.event.controlKind,
    side: input.side,
    contract: input.contract,
    entryStatus: "rejected-pre-entry",
    exitStatus: "not-applicable",
    entryTimestampMs: input.entryTimestampMs,
    intendedExitTimestampMs: input.intendedExitTimestampMs,
    exitTimestampMs: null,
    entryPriceCents: null,
    exitPriceCents: null,
    entryFeeCents: 0,
    exitFeeCents: 0,
    grossPnlCents: null,
    completedNetPnlCents: null,
    allEntryLowerBoundNetCents: null,
    allEntryUpperBoundNetCents: null,
    unresolvedMarkToMarketNetCents: null,
    preEntryRejectReason: input.reason,
    exitFailureReason: null,
    excluded: true,
    exclusionReason: input.reason,
  };
}

export function selectContractAtEventTime(input: {
  contracts: readonly SelectedContract[];
  eventTimestampMs: number;
  holdMs: number;
  delayMs: number;
  quotesByTicker: ReadonlyMap<string, readonly ExecutableQuote[]>;
}): {
  contract: SelectedContract | null;
  reject: PreEntryRejectReason | null;
} {
  const needUntil = input.eventTimestampMs + input.delayMs + input.holdMs;
  const live = input.contracts.filter(
    (c) =>
      c.startMs <= input.eventTimestampMs
      && input.eventTimestampMs < c.expiryMs
      && input.quotesByTicker.has(c.ticker),
  );
  if (live.length === 0) {
    return { contract: null, reject: "no-active-contract" };
  }
  const withTime = live.filter((c) => needUntil < c.expiryMs);
  if (withTime.length === 0) {
    return { contract: null, reject: "insufficient-time-to-expiry" };
  }

  let best: SelectedContract | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const contract of withTime) {
    const quotes = input.quotesByTicker.get(contract.ticker) ?? [];
    const asOf = joinAsOf({
      series: quotes,
      decisionTimestampMs: input.eventTimestampMs,
      maxAgeMs: Number.POSITIVE_INFINITY,
    });
    if (!asOf.sample) continue;
    const mid = (asOf.sample.yesBidCents + asOf.sample.yesAskCents) / 2;
    const dist = Math.abs(mid - 50);
    if (
      dist < bestDist
      || (dist === bestDist && best !== null && contract.expiryMs < best.expiryMs)
    ) {
      best = contract;
      bestDist = dist;
    }
  }
  if (!best) {
    return { contract: null, reject: "missing-quote" };
  }
  return { contract: best, reject: null };
}

export function simulateEventTrade(input: {
  event: ExternalBtcEvent;
  delayMs: PilotDelayMs;
  holdMs: number;
  contract: SelectedContract | null;
  quotes: readonly ExecutableQuote[];
  minDisplayedSize: number;
  staleMaxAgeMs: number;
  openUntilMs: number | null;
  cooldownUntilMs: number | null;
  decisionClockDomain: "adapter" | "exchange";
}): SimulatedTrade {
  const side = directionalSide(input.event);
  const entryTimestampMs = input.event.eventTimestampMs + input.delayMs;
  const intendedExitTimestampMs = entryTimestampMs + input.holdMs;
  const reject = (reason: PreEntryRejectReason) =>
    makeReject({
      event: input.event,
      delayMs: input.delayMs,
      side,
      contract: input.contract,
      entryTimestampMs,
      intendedExitTimestampMs,
      reason,
    });

  if (input.event.clockDomain !== input.decisionClockDomain) {
    return reject("timestamp-domain-mix");
  }
  if (input.openUntilMs !== null && input.event.eventTimestampMs < input.openUntilMs) {
    return reject("overlapping-position");
  }
  if (input.cooldownUntilMs !== null && input.event.eventTimestampMs < input.cooldownUntilMs) {
    return reject("cooldown");
  }
  if (!input.contract) {
    return reject("no-active-contract");
  }
  if (intendedExitTimestampMs >= input.contract.expiryMs) {
    return reject("insufficient-time-to-expiry");
  }

  const entryJoin = joinAsOf({
    series: input.quotes,
    decisionTimestampMs: entryTimestampMs,
    maxAgeMs: input.staleMaxAgeMs,
  });
  if (!entryJoin.joined || !entryJoin.sample) {
    return reject(entryJoin.stale ? "stale-book" : "missing-quote");
  }
  if (entryJoin.sample.clockDomain !== input.decisionClockDomain) {
    return reject("timestamp-domain-mix");
  }
  if (entryJoin.sample.chainBreak || entryJoin.sample.failClosed) {
    return reject("chain-break");
  }

  const entry = entryAsk(entryJoin.sample, side);
  if (entry.size < input.minDisplayedSize) {
    return reject("insufficient-displayed-size");
  }

  const entryFeeCents = takerFee(entry.price);
  const entryCostCents = entry.price + entryFeeCents;
  // Terminal-payout envelopes (not frozen-15s exit executions).
  const payoutFloorNetCents = 0 - entryCostCents;
  const payoutCeilingNetCents = 100 - entryCostCents;
  const lastBeforeExit = joinAsOf({
    series: input.quotes,
    decisionTimestampMs: intendedExitTimestampMs,
    maxAgeMs: Number.POSITIVE_INFINITY,
  });
  const lastBid = lastBeforeExit.sample
    ? exitBid(lastBeforeExit.sample, side).price
    : null;
  const markToMarketNetCents =
    lastBid !== null ? lastBid - entry.price - entryFeeCents : null;

  const unresolved = (reason: ExitFailureReason): SimulatedTrade => ({
    eventId: input.event.eventId,
    utcDay: input.event.utcDay,
    delayMs: input.delayMs,
    controlKind: input.event.controlKind,
    side,
    contract: input.contract,
    entryStatus: "entered",
    exitStatus: "unresolved",
    entryTimestampMs,
    intendedExitTimestampMs,
    exitTimestampMs: null,
    entryPriceCents: entry.price,
    exitPriceCents: null,
    entryFeeCents,
    exitFeeCents: 0,
    grossPnlCents: null,
    completedNetPnlCents: null,
    allEntryLowerBoundNetCents: payoutFloorNetCents,
    allEntryUpperBoundNetCents: payoutCeilingNetCents,
    unresolvedMarkToMarketNetCents: markToMarketNetCents,
    preEntryRejectReason: null,
    exitFailureReason: reason,
    excluded: false,
    exclusionReason: null,
  });

  const exitJoin = joinAsOf({
    series: input.quotes,
    decisionTimestampMs: intendedExitTimestampMs,
    maxAgeMs: input.staleMaxAgeMs,
  });
  if (!exitJoin.joined || !exitJoin.sample) {
    return unresolved(exitJoin.stale ? "stale-book" : "missing-quote");
  }
  if (exitJoin.sample.clockDomain !== input.decisionClockDomain) {
    return unresolved("contract-mismatch");
  }
  if (exitJoin.sample.chainBreak || exitJoin.sample.failClosed) {
    return unresolved("chain-break");
  }
  const exit = exitBid(exitJoin.sample, side);
  if (exit.size < input.minDisplayedSize) {
    return unresolved("insufficient-displayed-size");
  }

  const exitFeeCents = takerFee(exit.price);
  const grossPnlCents = exit.price - entry.price;
  const completedNetPnlCents = grossPnlCents - entryFeeCents - exitFeeCents;

  return {
    eventId: input.event.eventId,
    utcDay: input.event.utcDay,
    delayMs: input.delayMs,
    controlKind: input.event.controlKind,
    side,
    contract: input.contract,
    entryStatus: "entered",
    exitStatus: "completed",
    entryTimestampMs,
    intendedExitTimestampMs,
    exitTimestampMs: intendedExitTimestampMs,
    entryPriceCents: entry.price,
    exitPriceCents: exit.price,
    entryFeeCents,
    exitFeeCents,
    grossPnlCents,
    completedNetPnlCents,
    allEntryLowerBoundNetCents: completedNetPnlCents,
    allEntryUpperBoundNetCents: completedNetPnlCents,
    unresolvedMarkToMarketNetCents: null,
    preEntryRejectReason: null,
    exitFailureReason: null,
    excluded: false,
    exclusionReason: null,
  };
}

export function simulateDayTrades(input: {
  events: readonly ExternalBtcEvent[];
  delayMs: PilotDelayMs;
  holdMs: number;
  contracts: readonly SelectedContract[];
  quotesByTicker: ReadonlyMap<string, readonly ExecutableQuote[]>;
  minDisplayedSize: number;
  staleMaxAgeMs: number;
  cooldownMs: number;
  decisionClockDomain: "adapter" | "exchange";
}): SimulatedTrade[] {
  const trades: SimulatedTrade[] = [];
  let openUntilMs: number | null = null;
  let cooldownUntilMs: number | null = null;

  const sorted = [...input.events].sort(
    (a, b) => a.eventTimestampMs - b.eventTimestampMs,
  );

  for (const event of sorted) {
    const selected = selectContractAtEventTime({
      contracts: input.contracts,
      eventTimestampMs: event.eventTimestampMs,
      holdMs: input.holdMs,
      delayMs: input.delayMs,
      quotesByTicker: input.quotesByTicker,
    });
    const quotes = selected.contract
      ? (input.quotesByTicker.get(selected.contract.ticker) ?? [])
      : [];

    let trade = simulateEventTrade({
      event,
      delayMs: input.delayMs,
      holdMs: input.holdMs,
      contract: selected.contract,
      quotes,
      minDisplayedSize: input.minDisplayedSize,
      staleMaxAgeMs: input.staleMaxAgeMs,
      openUntilMs,
      cooldownUntilMs,
      decisionClockDomain: input.decisionClockDomain,
    });

    if (
      trade.entryStatus === "rejected-pre-entry"
      && selected.reject
      && (trade.preEntryRejectReason === "no-active-contract"
        || trade.preEntryRejectReason === "missing-quote"
        || trade.preEntryRejectReason === "insufficient-time-to-expiry")
    ) {
      trade = {
        ...trade,
        preEntryRejectReason: selected.reject,
        exclusionReason: selected.reject,
      };
    }

    trades.push(trade);

    if (trade.entryStatus === "entered") {
      openUntilMs = trade.intendedExitTimestampMs;
      cooldownUntilMs = trade.intendedExitTimestampMs + input.cooldownMs;
    }
  }

  return trades;
}
