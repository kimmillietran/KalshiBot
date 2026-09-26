/**
 * Aggregate completed per-day results into the pilot report (compact trades only).
 */

import { readFileSync } from "node:fs";

import type { DayResultArtifact } from "./checkpoint";
import { CONTRACT_METADATA_VERSION } from "./contractMetadata";
import { M128_RECONCILIATION } from "./m128Reconciliation";
import { FROZEN_PILOT_SPEC } from "./pilotSpec";
import { EXIT_FAILURE_POLICY } from "./simulateTrades";
import { CLOCK_POLICY, delayClaimSupport } from "./timingQuality";
import type {
  DelayEconomics,
  PilotDelayMs,
  PilotRunReport,
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
import { REPLAY_IMPLEMENTATION_VERSION } from "./bookReplay";

function meanOrNull(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sumOrNull(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0);
}

function economicsForDelay(
  delayMs: PilotDelayMs,
  trades: readonly SimulatedTrade[],
  dayResults: readonly DayResultArtifact[],
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

  const completedNets = completed
    .map((t) => t.completedNetPnlCents)
    .filter((v): v is number => v !== null);
  const lowerVals = entered
    .map((t) => t.allEntryLowerBoundNetCents)
    .filter((v): v is number => v !== null);
  const upperVals = entered
    .map((t) => t.allEntryUpperBoundNetCents)
    .filter((v): v is number => v !== null);
  const mtmVals = entered
    .map((t) => t.unresolvedMarkToMarketNetCents)
    .filter((v): v is number => v !== null);

  return {
    opportunityEnteredCount: entered.length,
    preEntryRejectCount: primary.filter((t) => t.entryStatus === "rejected-pre-entry").length,
    completedExitCount: completed.length,
    unresolvedExitCount: unresolved.length,
    economicResultStatus,
    completedTradeUncertainty: summarizeCompletedTradeUncertainty(completed),
    completedTotalNetPnlCents: sumOrNull(completedNets),
    completedMeanNetPnlCents: meanOrNull(completedNets),
    allEntryLowerBoundTotalCents: sumOrNull(lowerVals),
    allEntryUpperBoundTotalCents: sumOrNull(upperVals),
    allEntryLowerBoundMeanCents: meanOrNull(lowerVals),
    allEntryUpperBoundMeanCents: meanOrNull(upperVals),
    unresolvedMarkToMarketTotalCents: sumOrNull(mtmVals),
    unresolvedMarkToMarketMeanCents: meanOrNull(mtmVals),
    delayClaimStatus: delayClaimSupport({
      delayMs,
      decisionClockDomain: CLOCK_POLICY.decisionClockDomain,
      eventClockDomain: CLOCK_POLICY.decisionClockDomain,
      quoteClockDomain: CLOCK_POLICY.decisionClockDomain,
      eventHasDomainTimestamp: true,
      quoteHasDomainTimestamp: true,
    }),
    clockAlignmentStatus: "unknown",
    daily: dayResults.map((d) => {
      const dayPrimary = primary.filter((t) => t.utcDay === d.utcDay);
      // Prefer stored daySummary for primary delay; recompute for sensitivity delays.
      if (delayMs === PILOT_DELAY_MS.PRIMARY) {
        return d.daySummary;
      }
      const enteredD = dayPrimary.filter((t) => t.entryStatus === "entered");
      const completedD = enteredD.filter((t) => t.exitStatus === "completed");
      const unresolvedD = enteredD.filter((t) => t.exitStatus === "unresolved");
      const nets = completedD
        .map((t) => t.completedNetPnlCents)
        .filter((v): v is number => v !== null);
      return {
        utcDay: d.utcDay,
        weekday: "Friday" as const,
        primaryEventCount: dayPrimary.length,
        preEntryRejectCount: dayPrimary.filter((t) => t.entryStatus === "rejected-pre-entry")
          .length,
        enteredCount: enteredD.length,
        completedExitCount: completedD.length,
        unresolvedExitCount: unresolvedD.length,
        completedMeanNetPnlCents:
          nets.length === 0 ? null : nets.reduce((a, b) => a + b, 0) / nets.length,
      };
    }),
  };
}

export function aggregateDayResults(input: {
  dayResults: readonly DayResultArtifact[];
  inputHashes?: Record<string, string>;
}): PilotRunReport {
  const ordered = [...input.dayResults].sort((a, b) => a.utcDay.localeCompare(b.utcDay));
  const allTrades = ordered.flatMap((d) => d.trades);
  const allEvents = ordered.flatMap((d) => d.events);
  const timingNotes = ordered.flatMap((d) =>
    d.timingNotes.map((n) => ({
      eventId: n.eventId,
      delayMs: n.delayMs as PilotDelayMs,
      status: n.status as PilotRunReport["timingNotes"][number]["status"],
    })),
  );

  const byDelay: Record<string, DelayEconomics> = {};
  for (const delayMs of PILOT_DELAY_MS.SENSITIVITY) {
    byDelay[String(delayMs)] = economicsForDelay(delayMs, allTrades, ordered);
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
      delaysMs: [...PILOT_DELAY_MS.SENSITIVITY],
      primaryDelayMs: PILOT_DELAY_MS.PRIMARY,
      fridayOnly: true,
      daySelection: FROZEN_PILOT_SPEC.daySelection,
    },
    inputHashes: input.inputHashes ?? {},
    codeVersions: {
      analysisVersion: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
      studyId: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_STUDY_ID,
      replayImplementation: REPLAY_IMPLEMENTATION_VERSION,
      memoryArchitecture: "per-day-child-plus-disk-sparse-jsonl-v1",
      contractMetadataVersion: CONTRACT_METADATA_VERSION,
    },
    events: allEvents,
    trades: allTrades,
    daySummaries: ordered.map((d) => d.daySummary),
    byDelay,
    timingNotes,
    m128Reconciliation: { ...M128_RECONCILIATION },
    fridayOnly: true,
  };
}

export function loadDayResultFile(path: string): DayResultArtifact {
  return JSON.parse(readFileSync(path, "utf8")) as DayResultArtifact;
}
