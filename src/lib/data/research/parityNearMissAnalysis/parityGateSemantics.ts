import type { ParityNearMissRejectionGate } from "./parityNearMissAnalysisTypes";

export const SEQUENTIAL_FUNNEL_STAGE_ORDER = [
  "loaded",
  "validBook",
  "synchronizedBook",
  "bothSidesPresent",
  "stalenessPass",
  "executableSize",
  "grossThreshold",
  "feeThreshold",
  "bufferThreshold",
  "finalCandidate",
] as const;

export type SequentialFunnelStage = (typeof SEQUENTIAL_FUNNEL_STAGE_ORDER)[number];

export type ObservationGateFlags = {
  bookValid: boolean;
  bookSynchronized: boolean;
  bothSidesPresent: boolean;
  stalenessPass: boolean | null;
  sizePass: boolean;
  grossParityPass: boolean;
  feePass: boolean;
  bufferPass: boolean;
};

export type IndependentGatePassCounts = {
  validBookPass: number;
  synchronizedBookPass: number;
  bothSidesPresentPass: number;
  executableSizePass: number;
  stalenessPass: number;
  stalenessUnknown: number;
  stalenessKnownFresh: number;
  stalenessKnownStale: number;
  negativeQuoteAge: number;
  grossThresholdPass: number;
  feeThresholdPass: number;
  bufferThresholdPass: number;
  persistencePass: number;
  finalCandidatePass: number;
};

export function createEmptyIndependentGatePassCounts(): IndependentGatePassCounts {
  return {
    validBookPass: 0,
    synchronizedBookPass: 0,
    bothSidesPresentPass: 0,
    executableSizePass: 0,
    stalenessPass: 0,
    stalenessUnknown: 0,
    stalenessKnownFresh: 0,
    stalenessKnownStale: 0,
    negativeQuoteAge: 0,
    grossThresholdPass: 0,
    feeThresholdPass: 0,
    bufferThresholdPass: 0,
    persistencePass: 0,
    finalCandidatePass: 0,
  };
}

export function createEmptySequentialFunnel(): Record<SequentialFunnelStage, number> {
  return Object.fromEntries(
    SEQUENTIAL_FUNNEL_STAGE_ORDER.map((stage) => [stage, 0]),
  ) as Record<SequentialFunnelStage, number>;
}

function stagePasses(stage: SequentialFunnelStage, flags: ObservationGateFlags): boolean {
  switch (stage) {
    case "loaded":
      return true;
    case "validBook":
      return flags.bookValid;
    case "synchronizedBook":
      return flags.bookSynchronized;
    case "bothSidesPresent":
      return flags.bothSidesPresent;
    case "stalenessPass":
      return flags.stalenessPass === true;
    case "executableSize":
      return flags.sizePass;
    case "grossThreshold":
      return flags.grossParityPass;
    case "feeThreshold":
      return flags.feePass;
    case "bufferThreshold":
      return flags.bufferPass;
    case "finalCandidate":
      return flags.bufferPass;
    default:
      return false;
  }
}

export function resolveSequentialFirstRejectingGate(
  flags: ObservationGateFlags,
): ParityNearMissRejectionGate | null {
  if (!flags.bookValid) {
    return "invalid-book";
  }
  if (!flags.bookSynchronized) {
    return "unsynchronized-book";
  }
  if (!flags.bothSidesPresent) {
    return "missing-executable-size";
  }
  if (flags.stalenessPass !== true) {
    return flags.stalenessPass === null ? "stale-quote" : "stale-quote";
  }
  if (!flags.sizePass) {
    return "missing-executable-size";
  }
  if (!flags.grossParityPass) {
    return "gross-parity-shortfall";
  }
  if (!flags.feePass) {
    return "buffer-adjusted-shortfall";
  }
  if (!flags.bufferPass) {
    return "buffer-adjusted-shortfall";
  }

  return null;
}

export function observationPassesSequentialQualification(flags: ObservationGateFlags): boolean {
  return resolveSequentialFirstRejectingGate(flags) === null;
}

export function resolveAllRejectingGates(input: {
  flags: ObservationGateFlags;
  includeMissingBtcJoin: boolean;
}): ParityNearMissRejectionGate[] {
  const gates: ParityNearMissRejectionGate[] = [];
  if (!input.flags.bookValid) {
    gates.push("invalid-book");
  }
  if (!input.flags.bookSynchronized) {
    gates.push("unsynchronized-book");
  }
  if (!input.flags.bothSidesPresent) {
    gates.push("missing-executable-size");
  }
  if (input.flags.stalenessPass === false || input.flags.stalenessPass === null) {
    gates.push("stale-quote");
  }
  if (input.flags.bothSidesPresent && !input.flags.sizePass) {
    gates.push("missing-executable-size");
  }
  if (input.flags.bothSidesPresent && !input.flags.grossParityPass) {
    gates.push("gross-parity-shortfall");
  }
  if (input.flags.grossParityPass && !input.flags.feePass) {
    gates.push("buffer-adjusted-shortfall");
  }
  if (input.flags.grossParityPass && input.flags.feePass && !input.flags.bufferPass) {
    gates.push("buffer-adjusted-shortfall");
  }
  if (input.includeMissingBtcJoin) {
    gates.push("missing-btc-join");
  }

  return gates;
}

export function updateSequentialFunnel(
  funnel: Record<SequentialFunnelStage, number>,
  flags: ObservationGateFlags,
): void {
  let priorPassed = true;
  for (const stage of SEQUENTIAL_FUNNEL_STAGE_ORDER) {
    if (!priorPassed) {
      break;
    }

    if (stagePasses(stage, flags)) {
      funnel[stage] += 1;
    } else {
      priorPassed = false;
    }
  }
}

export function updateIndependentGatePassCounts(
  counts: IndependentGatePassCounts,
  input: {
    flags: ObservationGateFlags;
    quoteAgeStatus: "known" | "unknown" | "negative";
    stalenessReject: boolean;
  },
): void {
  if (input.flags.bookValid) {
    counts.validBookPass += 1;
  }
  if (input.flags.bookSynchronized) {
    counts.synchronizedBookPass += 1;
  }
  if (input.flags.bothSidesPresent) {
    counts.bothSidesPresentPass += 1;
  }
  if (input.flags.sizePass) {
    counts.executableSizePass += 1;
  }
  if (input.flags.stalenessPass === true) {
    counts.stalenessPass += 1;
  }
  if (input.quoteAgeStatus === "unknown") {
    counts.stalenessUnknown += 1;
  }
  if (input.quoteAgeStatus === "known" && !input.stalenessReject) {
    counts.stalenessKnownFresh += 1;
  }
  if (input.quoteAgeStatus === "known" && input.stalenessReject) {
    counts.stalenessKnownStale += 1;
  }
  if (input.quoteAgeStatus === "negative") {
    counts.negativeQuoteAge += 1;
  }
  if (input.flags.grossParityPass) {
    counts.grossThresholdPass += 1;
  }
  if (input.flags.feePass) {
    counts.feeThresholdPass += 1;
  }
  if (input.flags.bufferPass) {
    counts.bufferThresholdPass += 1;
  }
  if (observationPassesSequentialQualification(input.flags)) {
    counts.finalCandidatePass += 1;
  }
}
