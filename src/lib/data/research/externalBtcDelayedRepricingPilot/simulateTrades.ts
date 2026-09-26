/**
 * Simulated one-contract taker entry/exit after declared delay + hold.
 */

import {
  computeKalshiScheduleFeeCents,
  KALSHI_FEE_SCHEDULE_ROLE,
  KALSHI_FEE_SCHEDULE_VARIANT,
} from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";

import { joinAsOf } from "./causalAsOfJoin";
import type { ExecutableQuote, ExclusionReason, ExternalBtcEvent, PilotDelayMs, SimulatedTrade } from "./types";

export function directionalSide(event: ExternalBtcEvent): "YES" | "NO" {
  // BTC up → YES (above-strike KXBTC15M); BTC down → NO.
  // Sign-flip controls already invert `direction` in buildDiagnosticControls.
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

export function simulateEventTrade(input: {
  event: ExternalBtcEvent;
  delayMs: PilotDelayMs;
  holdMs: number;
  quotes: readonly ExecutableQuote[];
  minDisplayedSize: number;
  staleMaxAgeMs: number;
  openUntilMs: number | null;
  cooldownUntilMs: number | null;
}): SimulatedTrade {
  const side = directionalSide(input.event);
  const entryDecisionMs = input.event.eventTimestampMs + input.delayMs;
  const exitDecisionMs = entryDecisionMs + input.holdMs;

  const exclude = (
    reason: ExclusionReason,
  ): SimulatedTrade => ({
    eventId: input.event.eventId,
    utcDay: input.event.utcDay,
    delayMs: input.delayMs,
    controlKind: input.event.controlKind,
    side,
    entryTimestampMs: entryDecisionMs,
    exitTimestampMs: exitDecisionMs,
    entryPriceCents: 0,
    exitPriceCents: 0,
    entryFeeCents: 0,
    exitFeeCents: 0,
    grossPnlCents: 0,
    netPnlCents: 0,
    excluded: true,
    exclusionReason: reason,
  });

  if (
    input.openUntilMs !== null
    && input.event.eventTimestampMs < input.openUntilMs
  ) {
    return exclude("overlapping-position");
  }
  if (
    input.cooldownUntilMs !== null
    && input.event.eventTimestampMs < input.cooldownUntilMs
  ) {
    return exclude("cooldown");
  }

  const entryJoin = joinAsOf({
    series: input.quotes,
    decisionTimestampMs: entryDecisionMs,
    maxAgeMs: input.staleMaxAgeMs,
  });
  if (!entryJoin.joined || !entryJoin.sample) {
    return exclude(entryJoin.stale ? "stale-book" : "missing-quote");
  }
  if (entryJoin.sample.chainBreak) {
    return exclude("chain-break");
  }
  if (entryJoin.sample.stale) {
    return exclude("stale-book");
  }

  const entry = entryAsk(entryJoin.sample, side);
  if (entry.size < input.minDisplayedSize) {
    return exclude("insufficient-displayed-size");
  }

  const exitJoin = joinAsOf({
    series: input.quotes,
    decisionTimestampMs: exitDecisionMs,
    maxAgeMs: input.staleMaxAgeMs,
  });
  if (!exitJoin.joined || !exitJoin.sample) {
    return exclude(exitJoin.stale ? "stale-book" : "missing-quote");
  }
  if (exitJoin.sample.chainBreak) {
    return exclude("chain-break");
  }
  if (exitJoin.sample.stale) {
    return exclude("stale-book");
  }

  const exit = exitBid(exitJoin.sample, side);
  if (exit.size < input.minDisplayedSize) {
    return exclude("insufficient-displayed-size");
  }

  const entryFeeCents = computeKalshiScheduleFeeCents({
    quantity: 1,
    priceCents: entry.price,
    role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
    schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
  });
  const exitFeeCents = computeKalshiScheduleFeeCents({
    quantity: 1,
    priceCents: exit.price,
    role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
    schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
  });
  const grossPnlCents = exit.price - entry.price;
  const netPnlCents = grossPnlCents - entryFeeCents - exitFeeCents;

  return {
    eventId: input.event.eventId,
    utcDay: input.event.utcDay,
    delayMs: input.delayMs,
    controlKind: input.event.controlKind,
    side,
    entryTimestampMs: entryDecisionMs,
    exitTimestampMs: exitDecisionMs,
    entryPriceCents: entry.price,
    exitPriceCents: exit.price,
    entryFeeCents,
    exitFeeCents,
    grossPnlCents,
    netPnlCents,
    excluded: false,
    exclusionReason: null,
  };
}

export function simulateDayTrades(input: {
  events: readonly ExternalBtcEvent[];
  delayMs: PilotDelayMs;
  holdMs: number;
  quotes: readonly ExecutableQuote[];
  minDisplayedSize: number;
  staleMaxAgeMs: number;
  cooldownMs: number;
}): SimulatedTrade[] {
  const trades: SimulatedTrade[] = [];
  let openUntilMs: number | null = null;
  let cooldownUntilMs: number | null = null;

  const sorted = [...input.events].sort(
    (a, b) => a.eventTimestampMs - b.eventTimestampMs,
  );

  for (const event of sorted) {
    const trade = simulateEventTrade({
      event,
      delayMs: input.delayMs,
      holdMs: input.holdMs,
      quotes: input.quotes,
      minDisplayedSize: input.minDisplayedSize,
      staleMaxAgeMs: input.staleMaxAgeMs,
      openUntilMs,
      cooldownUntilMs,
    });
    trades.push(trade);
    if (!trade.excluded) {
      openUntilMs = trade.exitTimestampMs;
      cooldownUntilMs = trade.exitTimestampMs + input.cooldownMs;
    }
  }

  return trades;
}
