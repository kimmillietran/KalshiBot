import type { StaticParityCandidateSample } from "@/lib/data/research/staticParityScan/staticParityScanTypes";

import {
  CONFIRMATION_REQUIRED_DATA_FIELDS,
  DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_CONFIG,
  type ConfirmationRecommendedNextFix,
  type ConfirmationRequiredDataField,
  type ConfirmationSource,
  type ConfirmationStatus,
  type ExecutableConfirmationDataAssessment,
  type ExecutableConfirmationDesignConfig,
  type ExecutableConfirmationDesignSummary,
  type ExecutableConfirmationRecord,
} from "./executableConfirmationDesignTypes";

const BID_ONLY_CANDIDATE_CLASSIFICATIONS = new Set([
  "bid-only-gross-candidate",
  "bid-only-buffer-adjusted-candidate",
  "bid-only-watch",
]);

export type AssessedConfirmationCandidate = {
  candidateId: string;
  timestamp: string;
  marketTicker: string;
  sourceArtifact: "static-parity-scan" | "bid-only-candidate-lifecycle";
  yesBidCents: number | null;
  noBidCents: number | null;
  yesBidSize: number | null;
  noBidSize: number | null;
  bidSumCents: number | null;
  bidOnlyEdgeCents: number | null;
  minBidSizeContracts: number | null;
  feeBufferCents: number | null;
  receivedAtMs: number | null;
  requiresExecutableConfirmation: boolean;
};

import type { ArtifactValidationResult } from "../downstreamAnalysisScope/downstreamAnalysisScopeTypes";

export type LoadedExecutableConfirmationArtifacts = {
  staticParityCandidates: AssessedConfirmationCandidate[];
  lifecycleCandidates: AssessedConfirmationCandidate[];
  lifecycleEpisodeCount: number;
  forwardCaptureReadinessPresent: boolean;
  artifactValidation: ArtifactValidationResult | null;
};

function parseTimestampMs(timestamp: string | null | undefined): number | null {
  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

function fieldAvailable(
  field: ConfirmationRequiredDataField,
  candidate: AssessedConfirmationCandidate,
  config: ExecutableConfirmationDesignConfig,
  nowMs: number,
): boolean {
  switch (field) {
    case "yesBidCents":
      return candidate.yesBidCents !== null;
    case "noBidCents":
      return candidate.noBidCents !== null;
    case "yesBidSize":
      return candidate.yesBidSize !== null && candidate.yesBidSize > 0;
    case "noBidSize":
      return candidate.noBidSize !== null && candidate.noBidSize > 0;
    case "bidLadderDepth":
      return false;
    case "feeModel":
      return candidate.feeBufferCents !== null && candidate.feeBufferCents >= 0;
    case "stalenessBoundMs":
      return (
        candidate.receivedAtMs !== null
        && nowMs - candidate.receivedAtMs <= config.stalenessBoundMs
      );
    case "marketStatusOpen":
      return false;
    case "minSizeContracts":
      return (
        candidate.minBidSizeContracts !== null
        && candidate.minBidSizeContracts >= config.minSizeContracts
      );
    case "confirmationSource":
      return false;
    case "timestampAlignment":
      return candidate.receivedAtMs !== null;
    case "settlementOutcomeContext":
      return false;
    default:
      return false;
  }
}

const INFRASTRUCTURE_ONLY_FIELDS = new Set<ConfirmationRequiredDataField>([
  "bidLadderDepth",
  "marketStatusOpen",
  "confirmationSource",
  "settlementOutcomeContext",
]);

function resolveCandidateStatus(input: {
  candidate: AssessedConfirmationCandidate;
  availableFields: ConfirmationRequiredDataField[];
  missingFields: ConfirmationRequiredDataField[];
  config: ExecutableConfirmationDesignConfig;
  nowMs: number;
}): ConfirmationStatus {
  const { candidate, missingFields, config, nowMs } = input;

  if (missingFields.includes("yesBidSize") || missingFields.includes("noBidSize")) {
    return "insufficient-depth";
  }

  if (
    candidate.minBidSizeContracts !== null
    && candidate.minBidSizeContracts < config.minSizeContracts
  ) {
    return "insufficient-depth";
  }

  if (missingFields.includes("feeModel")) {
    return "missing-fee-model";
  }

  const receivedAtMs = candidate.receivedAtMs;
  if (
    receivedAtMs === null
    || nowMs - receivedAtMs > config.stalenessBoundMs
  ) {
    return "stale-book";
  }

  const infrastructureMissing = missingFields.filter((field) =>
    INFRASTRUCTURE_ONLY_FIELDS.has(field),
  );
  const captureMissing = missingFields.filter(
    (field) => !INFRASTRUCTURE_ONLY_FIELDS.has(field),
  );

  if (captureMissing.length === 0 && infrastructureMissing.length > 0) {
    return "confirmed-executable-looking";
  }

  if (missingFields.includes("bidLadderDepth")) {
    return "missing-orderbook-depth";
  }

  if (missingFields.length === 0) {
    return "confirmed-executable-looking";
  }

  return "confirmed-not-executable";
}

function buildConfirmationRecord(input: {
  candidate: AssessedConfirmationCandidate;
  config: ExecutableConfirmationDesignConfig;
  nowMs: number;
}): ExecutableConfirmationRecord {
  const availableDataFields = CONFIRMATION_REQUIRED_DATA_FIELDS.filter((field) =>
    fieldAvailable(field, input.candidate, input.config, input.nowMs),
  );
  const missingDataFields = CONFIRMATION_REQUIRED_DATA_FIELDS.filter(
    (field) => !availableDataFields.includes(field),
  );
  const confirmationStatus = resolveCandidateStatus({
    candidate: input.candidate,
    availableFields: availableDataFields,
    missingFields: missingDataFields,
    config: input.config,
    nowMs: input.nowMs,
  });

  return {
    timestamp: input.candidate.timestamp,
    marketTicker: input.candidate.marketTicker,
    candidateId: input.candidate.candidateId,
    pricingModel: "bid-only",
    yesBidCents: input.candidate.yesBidCents,
    noBidCents: input.candidate.noBidCents,
    yesBidSize: input.candidate.yesBidSize,
    noBidSize: input.candidate.noBidSize,
    bidSumCents: input.candidate.bidSumCents,
    bidOnlyEdgeCents: input.candidate.bidOnlyEdgeCents,
    feeBufferCents: input.candidate.feeBufferCents ?? input.config.feeBufferCents,
    minSizeContracts: input.config.minSizeContracts,
    confirmationSource: "unknown" satisfies ConfirmationSource,
    confirmationStatus,
    reason: buildRecordReason(confirmationStatus, missingDataFields),
    availableDataFields,
    missingDataFields,
  };
}

function buildRecordReason(
  status: ConfirmationStatus,
  missingFields: readonly ConfirmationRequiredDataField[],
): string {
  if (status === "confirmed-executable-looking") {
    return "All design-schema confirmation fields present in capture sample (research-only; not live confirmation).";
  }

  if (missingFields.length > 0) {
    return `Missing confirmation fields: ${missingFields.join(", ")}.`;
  }

  return `Confirmation status: ${status}.`;
}

function buildExampleRecord(
  config: ExecutableConfirmationDesignConfig,
): ExecutableConfirmationRecord {
  return {
    timestamp: "2026-07-10T12:00:00.000Z",
    marketTicker: "KXBTC15M-EXAMPLE-15",
    candidateId: "example-candidate",
    pricingModel: "bid-only",
    yesBidCents: 52,
    noBidCents: 51,
    yesBidSize: 10,
    noBidSize: 8,
    bidSumCents: 103,
    bidOnlyEdgeCents: 3,
    feeBufferCents: config.feeBufferCents,
    minSizeContracts: config.minSizeContracts,
    confirmationSource: "forward-ws",
    confirmationStatus: "unsupported",
    reason:
      "Example schema record only. Live executable confirmation workflow is not implemented.",
    availableDataFields: ["yesBidCents", "noBidCents", "yesBidSize", "noBidSize"],
    missingDataFields: [
      "bidLadderDepth",
      "feeModel",
      "stalenessBoundMs",
      "marketStatusOpen",
      "confirmationSource",
      "timestampAlignment",
      "settlementOutcomeContext",
    ],
  };
}

function resolveRecommendedNextFix(input: {
  summaryStatus: ConfirmationStatus | "no-candidates";
  missingFields: readonly ConfirmationRequiredDataField[];
  candidateCount: number;
}): ConfirmationRecommendedNextFix {
  if (input.candidateCount === 0) {
    return "collect-more-candidates";
  }

  if (input.missingFields.includes("settlementOutcomeContext")) {
    return "join-settlements-first";
  }

  if (
    input.missingFields.includes("bidLadderDepth")
    || input.missingFields.includes("yesBidSize")
    || input.missingFields.includes("noBidSize")
  ) {
    return "build-forward-ws-depth-confirmation";
  }

  if (input.missingFields.includes("feeModel")) {
    return "add-fee-model";
  }

  if (
    input.missingFields.includes("confirmationSource")
    || input.summaryStatus === "unsupported"
  ) {
    return "build-rest-orderbook-confirmation-spike";
  }

  return "build-forward-ws-depth-confirmation";
}

export function mapStaticParityCandidate(
  sample: StaticParityCandidateSample,
  index: number,
  feeBufferCents: number,
): AssessedConfirmationCandidate | null {
  if (!BID_ONLY_CANDIDATE_CLASSIFICATIONS.has(sample.classification)) {
    return null;
  }

  if (
    sample.classification === "bid-only-watch"
    && !sample.requiresExecutableConfirmation
  ) {
    return null;
  }

  return {
    candidateId: `${sample.runId}:${sample.marketTicker}:${index}`,
    timestamp: sample.timestamp,
    marketTicker: sample.marketTicker,
    sourceArtifact: "static-parity-scan",
    yesBidCents: sample.yesBidCents,
    noBidCents: sample.noBidCents,
    yesBidSize: sample.minBidSizeContracts,
    noBidSize: sample.minBidSizeContracts,
    bidSumCents: sample.bidSumCents,
    bidOnlyEdgeCents: sample.bidOnlyEdgeCents,
    minBidSizeContracts: sample.minBidSizeContracts,
    feeBufferCents,
    receivedAtMs: parseTimestampMs(sample.timestamp),
    requiresExecutableConfirmation: sample.requiresExecutableConfirmation,
  };
}

export function buildDataAssessment(input: {
  artifacts: LoadedExecutableConfirmationArtifacts;
  records: readonly ExecutableConfirmationRecord[];
  staticParityScanPresent: boolean;
  bidOnlyCandidateLifecyclePresent: boolean;
}): ExecutableConfirmationDataAssessment {
  const missingFieldCounts = new Map<string, number>();

  for (const record of input.records) {
    for (const field of record.missingDataFields) {
      missingFieldCounts.set(field, (missingFieldCounts.get(field) ?? 0) + 1);
    }
  }

  const missingFieldsSummary = [...missingFieldCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([field, count]) => `${field} (${count})`);

  return {
    staticParityScanPresent: input.staticParityScanPresent,
    bidOnlyCandidateLifecyclePresent: input.bidOnlyCandidateLifecyclePresent,
    forwardCaptureReadinessPresent: input.artifacts.forwardCaptureReadinessPresent,
    candidateCountFromStaticScan: input.artifacts.staticParityCandidates.length,
    candidateCountFromLifecycle: input.artifacts.lifecycleCandidates.length,
    candidatesWithBidSizes: input.records.filter(
      (record) => record.yesBidSize !== null && record.noBidSize !== null,
    ).length,
    candidatesWithConfirmationSource: input.records.filter(
      (record) => record.confirmationSource !== "unknown",
    ).length,
    candidatesWithFeeModel: input.records.filter((record) =>
      record.availableDataFields.includes("feeModel"),
    ).length,
    missingFieldsSummary,
  };
}

/** Evaluates executable confirmation readiness for assessed bid-only candidates. */
export function evaluateExecutableConfirmationReadiness(input: {
  artifacts: LoadedExecutableConfirmationArtifacts;
  config?: ExecutableConfirmationDesignConfig;
  generatedAt?: string;
}): {
  summary: ExecutableConfirmationDesignSummary;
  confirmationRecords: ExecutableConfirmationRecord[];
  exampleConfirmationRecord: ExecutableConfirmationRecord;
} {
  const config = input.config ?? DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_CONFIG;
  const nowMs = input.generatedAt ? Date.parse(input.generatedAt) : Date.now();
  const parityCandidates = input.artifacts.staticParityCandidates;
  const lifecycleCandidates = input.artifacts.lifecycleCandidates;
  const candidates = [...parityCandidates, ...lifecycleCandidates];

  const confirmationRecords = candidates.map((candidate) =>
    buildConfirmationRecord({ candidate, config, nowMs }),
  );

  const unionAvailable = new Set<ConfirmationRequiredDataField>();
  const unionMissing = new Set<ConfirmationRequiredDataField>();

  for (const record of confirmationRecords) {
    for (const field of record.availableDataFields) {
      unionAvailable.add(field);
    }

    for (const field of record.missingDataFields) {
      unionMissing.add(field);
    }
  }

  for (const field of unionAvailable) {
    unionMissing.delete(field);
  }

  const confirmedExecutableCandidateCount = confirmationRecords.filter(
    (record) => record.confirmationStatus === "confirmed-executable-looking",
  ).length;
  const unsupportedCandidateCount = confirmationRecords.filter(
    (record) => record.confirmationStatus === "unsupported",
  ).length;

  const summaryStatus: ConfirmationStatus | "no-candidates" =
    candidates.length === 0
      ? "no-candidates"
      : confirmedExecutableCandidateCount > 0
        ? "confirmed-executable-looking"
        : "unsupported";

  const actionabilityBlockers = [
    "No live executable confirmation workflow is implemented.",
    "No order placement or trade recommendation path exists.",
    "Full YES/NO bid ladders are not present in current forward captures.",
    "Market tradeability status is not joined in offline artifacts.",
    "Settlement/outcome context is not joined for offline confirmation eval.",
  ];

  const summary: ExecutableConfirmationDesignSummary = {
    confirmationSupported: false,
    confirmationStatus: summaryStatus,
    requiredDataFields: CONFIRMATION_REQUIRED_DATA_FIELDS,
    availableDataFields: [...unionAvailable],
    missingDataFields: [...unionMissing],
    episodesAssessed: input.artifacts.lifecycleEpisodeCount,
    candidateEpisodesAssessed: lifecycleCandidates.length,
    candidateCountAssessed: parityCandidates.length + lifecycleCandidates.length,
    confirmedExecutableCandidateCount,
    unsupportedCandidateCount,
    recommendedNextFix: resolveRecommendedNextFix({
      summaryStatus,
      missingFields: [...unionMissing],
      candidateCount: candidates.length,
    }),
    actionabilityBlockers,
  };

  return {
    summary,
    confirmationRecords,
    exampleConfirmationRecord: buildExampleRecord(config),
  };
}
