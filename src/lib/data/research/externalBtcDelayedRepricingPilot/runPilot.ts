/**
 * Offline pilot runner — in-memory or loaded streaming days.
 */

import type { BboPoint } from "./bookReplay";
import { buildDiagnosticControls, detectExternalBtcEvents } from "./detectExternalEvents";
import { M128_RECONCILIATION } from "./m128Reconciliation";
import { FROZEN_PILOT_SPEC } from "./pilotSpec";
import { EXIT_FAILURE_POLICY, simulateDayTrades } from "./simulateTrades";
import { CLOCK_POLICY, delayClaimSupport } from "./timingQuality";
import type {
  DaySummary,
  DelayEconomics,
  ExecutableQuote,
  ExternalBtcEvent,
  PilotDelayMs,
  PilotRunReport,
  SelectedContract,
  SimulatedTrade,
} from "./types";
import {
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_DISCLAIMER,
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_PRIOR_ANALYSIS_VERSION,
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_STUDY_ID,
  PILOT_DELAY_MS,
} from "./types";
import { summarizeCompletedTradeUncertainty } from "./uncertainty";

export type DaySeriesInput = {
  utcDay: string;
  externalBbo: readonly BboPoint[];
  contracts: readonly SelectedContract[];
  quotesByTicker: ReadonlyMap<string, readonly ExecutableQuote[]>;
};

function weekdayFriday(utcDay: string): "Friday" {
  // Spec-fixed Friday-only set; label without claiming calendar generality.
  void utcDay;
  return "Friday";
}

function summarizeDay(
  utcDay: string,
  trades: readonly SimulatedTrade[],
): DaySummary {
  const primary = trades.filter((t) => t.controlKind === "primary");
  const entered = primary.filter((t) => t.entryStatus === "entered");
  const completed = entered.filter((t) => t.exitStatus === "completed");
  const unresolved = entered.filter((t) => t.exitStatus === "unresolved");
  const completedNets = completed
    .map((t) => t.completedNetPnlCents)
    .filter((v): v is number => v !== null);
  return {
    utcDay,
    weekday: weekdayFriday(utcDay),
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

function meanOrNull(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function economicsForDelay(
  delayMs: PilotDelayMs,
  trades: readonly SimulatedTrade[],
  days: readonly string[],
): DelayEconomics {
  const primary = trades.filter(
    (t) => t.delayMs === delayMs && t.controlKind === "primary",
  );
  const entered = primary.filter((t) => t.entryStatus === "entered");
  const completed = entered.filter((t) => t.exitStatus === "completed");
  const unresolved = entered.filter((t) => t.exitStatus === "unresolved");
  const economicResultStatus =
    entered.length === 0
      ? "no-entries"
      : unresolved.length > 0
        ? "incomplete-unresolved-exits"
        : "complete";

  const claim = delayClaimSupport({
    delayMs,
    decisionClockDomain: CLOCK_POLICY.decisionClockDomain,
    eventClockDomain: CLOCK_POLICY.decisionClockDomain,
    quoteClockDomain: CLOCK_POLICY.decisionClockDomain,
    eventHasDomainTimestamp: true,
    quoteHasDomainTimestamp: true,
  });

  return {
    opportunityEnteredCount: entered.length,
    preEntryRejectCount: primary.filter((t) => t.entryStatus === "rejected-pre-entry").length,
    completedExitCount: completed.length,
    unresolvedExitCount: unresolved.length,
    economicResultStatus,
    completedTradeUncertainty: summarizeCompletedTradeUncertainty(completed),
    allEntryLowerBoundMeanCents: meanOrNull(
      entered
        .map((t) => t.allEntryLowerBoundNetCents)
        .filter((v): v is number => v !== null),
    ),
    allEntryUpperBoundMeanCents: meanOrNull(
      entered
        .map((t) => t.allEntryUpperBoundNetCents)
        .filter((v): v is number => v !== null),
    ),
    delayClaimStatus: claim,
    clockAlignmentStatus: "unknown",
    daily: days.map((d) => summarizeDay(d, primary.filter((t) => t.utcDay === d))),
  };
}

export function runExternalBtcDelayedRepricingPilot(input: {
  days: readonly DaySeriesInput[];
  inputHashes?: Record<string, string>;
  codeVersions?: Record<string, string>;
  delaysMs?: readonly PilotDelayMs[];
}): PilotRunReport {
  const delays = input.delaysMs ?? PILOT_DELAY_MS.SENSITIVITY;
  const allEvents: ExternalBtcEvent[] = [];
  const allTrades: SimulatedTrade[] = [];
  const timingNotes: PilotRunReport["timingNotes"] = [];
  const dayIds = input.days.map((d) => d.utcDay);

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
    allEvents.push(...primary, ...controls);

    for (const delayMs of delays) {
      const runnablePrimary: ExternalBtcEvent[] = [];
      for (const event of primary) {
        const status = delayClaimSupport({
          delayMs,
          decisionClockDomain: CLOCK_POLICY.decisionClockDomain,
          eventClockDomain: event.clockDomain,
          quoteClockDomain: CLOCK_POLICY.decisionClockDomain,
          eventHasDomainTimestamp: true,
          quoteHasDomainTimestamp: true,
        });
        timingNotes.push({
          eventId: event.eventId,
          delayMs,
          status,
        });
        if (status === "blocked-domain-mix" || status === "blocked-missing-timestamps") {
          // Fail closed: do not enter P&L for blocked timing claims.
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

      // Primary strategy position state — controls never share this.
      const primaryTrades = simulateDayTrades({
        events: runnablePrimary,
        delayMs,
        holdMs: FROZEN_PILOT_SPEC.execution.holdMs,
        contracts: day.contracts,
        quotesByTicker: day.quotesByTicker,
        minDisplayedSize: FROZEN_PILOT_SPEC.execution.minDisplayedSize,
        staleMaxAgeMs: FROZEN_PILOT_SPEC.execution.staleMaxAgeMs,
        cooldownMs: FROZEN_PILOT_SPEC.positionPolicy.cooldownMs,
        decisionClockDomain: CLOCK_POLICY.decisionClockDomain,
      });
      allTrades.push(...primaryTrades);

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
        const controlTrades = simulateDayTrades({
          events: [control],
          delayMs,
          holdMs: FROZEN_PILOT_SPEC.execution.holdMs,
          contracts: day.contracts,
          quotesByTicker: day.quotesByTicker,
          minDisplayedSize: FROZEN_PILOT_SPEC.execution.minDisplayedSize,
          staleMaxAgeMs: FROZEN_PILOT_SPEC.execution.staleMaxAgeMs,
          cooldownMs: FROZEN_PILOT_SPEC.positionPolicy.cooldownMs,
          decisionClockDomain: CLOCK_POLICY.decisionClockDomain,
        });
        allTrades.push(...controlTrades);
      }
    }
  }

  const byDelay: Record<string, DelayEconomics> = {};
  for (const delayMs of delays) {
    byDelay[String(delayMs)] = economicsForDelay(delayMs, allTrades, dayIds);
  }

  return {
    studyId: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_STUDY_ID,
    analysisVersion: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
    priorAnalysisVersion: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_PRIOR_ANALYSIS_VERSION,
    disclaimer: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_DISCLAIMER,
    parameters: {
      eventDefinition: FROZEN_PILOT_SPEC.eventDefinition,
      execution: FROZEN_PILOT_SPEC.execution,
      exitFailurePolicy: EXIT_FAILURE_POLICY,
      clockPolicy: CLOCK_POLICY,
      delaysMs: [...delays],
      primaryDelayMs: PILOT_DELAY_MS.PRIMARY,
      fridayOnly: true,
      daySelection: FROZEN_PILOT_SPEC.daySelection,
    },
    inputHashes: input.inputHashes ?? {},
    codeVersions: input.codeVersions ?? {
      analysisVersion: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
      studyId: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_STUDY_ID,
    },
    events: allEvents,
    trades: allTrades,
    daySummaries: dayIds.map((d) =>
      summarizeDay(
        d,
        allTrades.filter(
          (t) => t.utcDay === d && t.delayMs === PILOT_DELAY_MS.PRIMARY && t.controlKind === "primary",
        ),
      ),
    ),
    byDelay,
    timingNotes,
    m128Reconciliation: { ...M128_RECONCILIATION },
    fridayOnly: true,
  };
}
