/**
 * Offline pilot runner core — works on in-memory series (fixtures or loaded ticks).
 */

import { buildDiagnosticControls, detectExternalBtcEvents } from "./detectExternalEvents";
import { FROZEN_PILOT_SPEC } from "./pilotSpec";
import { simulateDayTrades } from "./simulateTrades";
import { delayClaimSupport } from "./timingQuality";
import type {
  DaySummary,
  ExecutableQuote,
  ExternalBtcEvent,
  PilotDelayMs,
  PilotRunReport,
  SimulatedTrade,
} from "./types";
import {
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_DISCLAIMER,
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_STUDY_ID,
  PILOT_DELAY_MS,
} from "./types";
import { summarizePrimaryUncertainty } from "./uncertainty";
import type { BboPoint } from "./bookReplay";

export type DaySeriesInput = {
  utcDay: string;
  externalBbo: readonly BboPoint[];
  kalshiQuotes: readonly ExecutableQuote[];
};

function daySummary(utcDay: string, trades: readonly SimulatedTrade[]): DaySummary {
  const dayTrades = trades.filter((t) => t.utcDay === utcDay && t.controlKind === "primary");
  const included = dayTrades.filter((t) => !t.excluded);
  return {
    utcDay,
    eventCount: dayTrades.length,
    tradeCount: included.length,
    excludedCount: dayTrades.length - included.length,
    meanNetPnlCents:
      included.length === 0
        ? null
        : included.reduce((sum, t) => sum + t.netPnlCents, 0) / included.length,
  };
}

export function runExternalBtcDelayedRepricingPilot(input: {
  days: readonly DaySeriesInput[];
  inputHashes?: Record<string, string>;
  delaysMs?: readonly PilotDelayMs[];
}): PilotRunReport {
  const delays = input.delaysMs ?? PILOT_DELAY_MS.SENSITIVITY;
  const allEvents: ExternalBtcEvent[] = [];
  const allTrades: SimulatedTrade[] = [];
  const timingExclusions: PilotRunReport["timingExclusions"] = [];

  for (const day of input.days) {
    const detected = detectExternalBtcEvents({
      utcDay: day.utcDay,
      points: day.externalBbo,
      lookbackMs: FROZEN_PILOT_SPEC.eventDefinition.lookbackMs,
      boundaryBps: FROZEN_PILOT_SPEC.eventDefinition.boundaryBps,
      cooldownMs: FROZEN_PILOT_SPEC.positionPolicy.cooldownMs,
    });

    const primary = detected.events;
    const controls = buildDiagnosticControls(
      primary,
      FROZEN_PILOT_SPEC.execution.holdMs,
      PILOT_DELAY_MS.PRIMARY,
    );
    const dayEvents = [...primary, ...controls];
    allEvents.push(...dayEvents);

    for (const delayMs of delays) {
      for (const event of dayEvents) {
        const support = delayClaimSupport({
          delayMs,
          externalSource: event.timestampSource === "exchange" ? "exchange" : "adapter",
          kalshiSource: "exchange",
        });
        if (support === "blocked" && event.controlKind === "primary") {
          timingExclusions.push({
            eventId: `${event.eventId}@${delayMs}`,
            reason: "timing-quality-block",
          });
        }
      }

      const trades = simulateDayTrades({
        events: dayEvents.filter((e) => e.controlKind === "primary"),
        delayMs,
        holdMs: FROZEN_PILOT_SPEC.execution.holdMs,
        quotes: day.kalshiQuotes,
        minDisplayedSize: FROZEN_PILOT_SPEC.execution.minDisplayedSize,
        staleMaxAgeMs: FROZEN_PILOT_SPEC.execution.staleMaxAgeMs,
        cooldownMs: FROZEN_PILOT_SPEC.positionPolicy.cooldownMs,
      });
      allTrades.push(...trades);

      // Diagnostic controls simulated separately (no position interaction with primary).
      for (const control of dayEvents.filter((e) => e.controlKind !== "primary")) {
        const controlTrades = simulateDayTrades({
          events: [control],
          delayMs,
          holdMs: FROZEN_PILOT_SPEC.execution.holdMs,
          quotes: day.kalshiQuotes,
          minDisplayedSize: FROZEN_PILOT_SPEC.execution.minDisplayedSize,
          staleMaxAgeMs: FROZEN_PILOT_SPEC.execution.staleMaxAgeMs,
          cooldownMs: FROZEN_PILOT_SPEC.positionPolicy.cooldownMs,
        });
        allTrades.push(...controlTrades);
      }
    }
  }

  const byDelay: PilotRunReport["byDelay"] = {};
  for (const delayMs of delays) {
    const delayTrades = allTrades.filter(
      (t) => t.delayMs === delayMs && t.controlKind === "primary",
    );
    byDelay[String(delayMs)] = {
      opportunityCount: delayTrades.filter((t) => !t.excluded).length,
      excludedCount: delayTrades.filter((t) => t.excluded).length,
      uncertainty: summarizePrimaryUncertainty(delayTrades),
    };
  }

  const daySummaries = input.days.map((d) =>
    daySummary(
      d.utcDay,
      allTrades.filter((t) => t.delayMs === PILOT_DELAY_MS.PRIMARY),
    ),
  );

  return {
    studyId: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_STUDY_ID,
    analysisVersion: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
    disclaimer: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_DISCLAIMER,
    parameters: {
      ...FROZEN_PILOT_SPEC.eventDefinition,
      ...FROZEN_PILOT_SPEC.execution,
      delaysMs: [...delays],
      primaryDelayMs: PILOT_DELAY_MS.PRIMARY,
    },
    inputHashes: input.inputHashes ?? {},
    events: allEvents,
    trades: allTrades,
    daySummaries,
    byDelay,
    timingExclusions,
    priorResearchNote: JSON.stringify(FROZEN_PILOT_SPEC.priorResearchAlreadyAnswered),
  };
}
