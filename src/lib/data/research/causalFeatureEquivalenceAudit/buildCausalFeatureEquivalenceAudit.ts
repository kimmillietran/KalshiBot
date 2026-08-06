import { createHash } from "node:crypto";

import type { BtcSpotPoint } from "../btcKalshiLeadLagAnalysis/causalBtcJoin";
import { preloadBtcSpotSeries } from "../btcKalshiLeadLagAnalysis/causalBtcJoin";
import {
  joinPath,
  parseIsoTimestampMs,
  readNumber,
  readString,
  resolveSelectedRunId,
  safeShare,
} from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";
import { loadFrozenHypothesisSpec } from "../calibrationFadeForwardValidation/loadFrozenHypothesisSpec";
import { validateSelectedRunDirectory } from "../calibrationFadeForwardValidation/loadSelectedRunCalibrationFadeContext";

import { attributeVolatilityWindowRejections } from "./attributeVolatilityWindowRejections";
import { buildBtcSourceDiagnostics } from "./buildBtcSourceDiagnostics";
import { buildQuoteJoinDiagnostics } from "./buildQuoteJoinDiagnostics";
import { classifyCausalFeatureEquivalence } from "./classifyCausalFeatureEquivalence";
import { compareVolatilityContracts } from "./compareVolatilityContracts";
import {
  CAUSAL_FEATURE_EQUIVALENCE_ANALYSIS_VERSION,
  CausalFeatureEquivalenceAuditError,
  DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_PATH,
  DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_HYPOTHESIS_CONFIG_PATH,
  type CausalFeatureEquivalenceAuditIo,
  type CausalFeatureEquivalenceAuditReport,
  type FutureCaptureRequirements,
  type ReconstructabilityAssessment,
  type ReferenceComparisonSummary,
} from "./causalFeatureEquivalenceAuditTypes";
import { describeCurrentForwardVolatilityContract } from "./describeCurrentForwardVolatilityContract";
import { hashVolatilityFeatureContract } from "./hashVolatilityFeatureContract";
import { loadCausalFeatureEquivalenceEvidence } from "./loadCausalFeatureEquivalenceEvidence";
import { reconstructHistoricalVolatilityContract } from "./reconstructHistoricalVolatilityContract";

function sha256(content: string): string {
  return createHash("sha256").update(content.replace(/^\uFEFF/, ""), "utf8").digest("hex");
}

function fingerprint(io: CausalFeatureEquivalenceAuditIo, path: string, role: string) {
  if (!io.fileExists(path)) {
    throw new CausalFeatureEquivalenceAuditError(`Required input missing: ${path}`);
  }
  const content = io.readFile(path);
  return {
    role,
    path,
    sha256: sha256(content),
    byteLength: Buffer.byteLength(content, "utf8"),
  };
}

type ParsedQuote = {
  marketTicker: string;
  timestampMs: number;
};

function parseTopOfBookLine(line: string): ParsedQuote | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const marketTicker = readString(record.marketTicker);
  const receivedAtLocal = readString(record.receivedAtLocal);
  if (!marketTicker || !receivedAtLocal) {
    return null;
  }
  const timestampMs =
    readNumber(record.exchangeTimestampMs) ?? parseIsoTimestampMs(receivedAtLocal);
  if (timestampMs === null) {
    return null;
  }
  return { marketTicker, timestampMs };
}

function emptyReferenceComparison(reason: string): ReferenceComparisonSummary {
  return {
    performed: false,
    reasonIfSkipped: reason,
    bothUnavailable: 0,
    historicalAvailableForwardUnavailable: 0,
    historicalUnavailableForwardAvailable: 0,
    bothAvailable: 0,
    bothAvailableEqual: 0,
    bothAvailableMaterialDifference: 0,
    maximumAbsoluteDifference: null,
    p50AbsoluteDifference: null,
    p90AbsoluteDifference: null,
    p99AbsoluteDifference: null,
    equalityTolerance: 0,
    equalityToleranceBasis:
      "Exact equality preferred when both paths share the same deterministic algorithm; no tolerance widening selected to maximize agreement.",
    firstMismatches: [],
  };
}

function assessReconstructability(
  volatilityWindowDiagnostics: CausalFeatureEquivalenceAuditReport["volatilityWindowDiagnostics"],
  contractEquivalent: boolean,
  historicalAmbiguous: boolean,
): ReconstructabilityAssessment {
  const available =
    volatilityWindowDiagnostics.classes.find((entry) => entry.class === "available")
      ?.observationCount ?? 0;
  const total = volatilityWindowDiagnostics.observationsAttempted;
  const continuityFailures = volatilityWindowDiagnostics.classes
    .filter((entry) =>
      entry.class === "start-boundary-gap-exceeded"
      || entry.class === "internal-source-gap-exceeded"
      || entry.class === "trailing-source-age-exceeded"
    )
    .reduce((sum, entry) => sum + entry.observationCount, 0);

  if (historicalAmbiguous) {
    return {
      reconstructable: false,
      reason:
        "Historical feature definition is ambiguous; reconstructability against a unique historical contract cannot be established.",
      continuityFailureShare: safeShare(continuityFailures, total),
      availableShare: safeShare(available, total),
    };
  }

  if (!contractEquivalent) {
    return {
      reconstructable: false,
      reason: "Forward contract is not semantically equivalent to the historical contract.",
      continuityFailureShare: safeShare(continuityFailures, total),
      availableShare: safeShare(available, total),
    };
  }

  const reconstructable = total > 0 && available > 0 && continuityFailures === 0;
  return {
    reconstructable,
    reason: reconstructable
      ? "Contracts are equivalent and the selected capture yields available volatility windows without continuity failures."
      : "Contracts are equivalent but the selected capture lacks required adjacent-source continuity or warm-up density.",
    continuityFailureShare: safeShare(continuityFailures, total),
    availableShare: safeShare(available, total),
  };
}

function buildFutureCaptureRequirements(input: {
  verdict: CausalFeatureEquivalenceAuditReport["verdict"];
  forward: CausalFeatureEquivalenceAuditReport["currentForwardContract"];
}): FutureCaptureRequirements {
  if (input.verdict !== "frozen-feature-not-reconstructable-from-current-capture") {
    return {
      emitted: false,
      requiredSourceRecordType: null,
      requiredTimestampField: null,
      requiredTimestampClockDomain: null,
      requiredMaximumSourceGapMs: null,
      requiredNominalCadenceMs: null,
      requiredSchedulingSafetyMarginMs: null,
      requiredCaptureFields: [],
      requiredDuplicateOrderGuarantees: null,
      requiredPreRollDurationMs: null,
      requiredMinimumBarWarmup: null,
      requiredRunStartBehavior: null,
      requiredMonitoringMetric: null,
      acceptanceTest: null,
      note: "Future capture requirements are emitted only when reconstructability fails under equivalent contracts.",
    };
  }

  const maxGap = input.forward.sourceGapThresholdMs;
  return {
    emitted: true,
    requiredSourceRecordType: input.forward.sourceRecordType,
    requiredTimestampField: input.forward.timestampField,
    requiredTimestampClockDomain: input.forward.timestampMeaning,
    requiredMaximumSourceGapMs: maxGap,
    requiredNominalCadenceMs: null,
    requiredSchedulingSafetyMarginMs: null,
    requiredCaptureFields: [
      "exchangeTimestampMs",
      "receivedAtLocal",
      "priceUsd",
    ],
    requiredDuplicateOrderGuarantees:
      "Ascending timestamps; exact timestamp+price duplicates collapsible; conflicting duplicates rejected.",
    requiredPreRollDurationMs:
      input.forward.returnIntervalMs !== null && input.forward.requiredCloseCount !== null
        ? input.forward.returnIntervalMs * input.forward.requiredCloseCount
        : null,
    requiredMinimumBarWarmup: input.forward.requiredCloseCount,
    requiredRunStartBehavior:
      "Provide sufficient pre-roll BTC samples before first quote evaluation so an 11-bar causal window can form.",
    requiredMonitoringMetric:
      "Share of adjacent BTC source intervals <= maximumSourceGapMs (exact threshold, no rounding).",
    acceptanceTest:
      "Synthetic and live captures must keep every evaluated-window adjacent gap (start/internal/trailing) <= maximumSourceGapMs and yield available volatility for in-band quotes.",
    note:
      "Do not set nominal cadence equal to maximumSourceGapMs. Exact operational cadence with jitter margin needs a separate capture-design milestone.",
  };
}

const NON_CLAIMS = [
  "No settlement or outcome data was used.",
  "No profitability conclusion is supported.",
  "No hypothesis threshold was changed.",
  "No forward data was used to choose historical semantics.",
  "Git history is not executed at runtime.",
  "The audit is selected-run scoped.",
] as const;

export async function buildCausalFeatureEquivalenceAudit(input: {
  captureRunDir: string;
  io: CausalFeatureEquivalenceAuditIo;
  generatedAt?: string;
  outputPath: string;
  htmlOutputPath: string;
  evidencePath?: string;
  hypothesisConfigPath?: string;
  maximumBtcJoinAgeMs?: number;
}): Promise<CausalFeatureEquivalenceAuditReport> {
  const evidencePath = input.evidencePath ?? DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_PATH;
  const hypothesisConfigPath =
    input.hypothesisConfigPath ?? DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_HYPOTHESIS_CONFIG_PATH;
  const maximumBtcJoinAgeMs = input.maximumBtcJoinAgeMs ?? 5_000;

  if (!input.io.fileExists(evidencePath)) {
    throw new CausalFeatureEquivalenceAuditError(`Missing evidence path: ${evidencePath}`);
  }

  const captureRunDir = validateSelectedRunDirectory(
    input.io,
    input.captureRunDir,
  );
  const selectedRunId = resolveSelectedRunId(captureRunDir);

  const evidenceRaw = input.io.readFile(evidencePath);
  const evidence = loadCausalFeatureEquivalenceEvidence({ rawContent: evidenceRaw });
  const auditEvidenceHash = sha256(evidenceRaw);

  const { spec } = loadFrozenHypothesisSpec({
    io: input.io,
    hypothesisConfigPath,
  });

  if (spec.hypothesisId !== evidence.hypothesisId) {
    throw new CausalFeatureEquivalenceAuditError(
      `Hypothesis ID mismatch between evidence (${evidence.hypothesisId}) and config (${spec.hypothesisId})`,
    );
  }
  if (spec.configurationHash !== evidence.hypothesisConfigurationHash) {
    throw new CausalFeatureEquivalenceAuditError(
      `Configuration hash mismatch between evidence (${evidence.hypothesisConfigurationHash}) and config (${spec.configurationHash})`,
    );
  }

  const historical = reconstructHistoricalVolatilityContract(evidence);
  const currentForwardContract = describeCurrentForwardVolatilityContract({
    spec,
    maximumBtcJoinAgeMs,
  });
  const contractComparison = compareVolatilityContracts({
    historical: historical.contract,
    forward: currentForwardContract,
    historicalEvidenceStatus: historical.historicalEvidenceStatus,
  });

  const topOfBookPath = joinPath(captureRunDir, "top-of-book.jsonl");
  const btcSpotPath = joinPath(captureRunDir, "btc-spot.jsonl");
  const marketMetadataPath = joinPath(captureRunDir, "market-metadata.jsonl");
  const provenancePath = hypothesisConfigPath.replace(
    /\/([^/]+)$/,
    "/provenance/$1",
  );

  const inputFingerprints = [
    fingerprint(input.io, topOfBookPath, "top-of-book"),
    fingerprint(input.io, btcSpotPath, "btc-spot"),
    fingerprint(input.io, marketMetadataPath, "market-metadata"),
    fingerprint(input.io, hypothesisConfigPath, "frozen-hypothesis-config"),
    fingerprint(input.io, provenancePath, "provenance-manifest"),
    fingerprint(input.io, evidencePath, "equivalence-evidence"),
  ];

  const { points: btcPoints } = await preloadBtcSpotSeries(
    input.io,
    captureRunDir,
  );

  // Raw diagnostic points preserve input order issues before relying on preload sort.
  const rawDiagnosticPoints: { timestampMs: number; priceUsd: number }[] = [];
  await input.io.iterateJsonl(btcSpotPath, {
    onLine: (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return "skip";
      }
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const receivedAtLocal = readString(parsed.receivedAtLocal);
        const receivedAtMs = receivedAtLocal ? parseIsoTimestampMs(receivedAtLocal) : null;
        const exchangeTimestampMs = readNumber(parsed.exchangeTimestampMs);
        const priceUsd = readNumber(parsed.priceUsd) ?? Number.NaN;
        const timestampMs = exchangeTimestampMs ?? receivedAtMs ?? Number.NaN;
        rawDiagnosticPoints.push({ timestampMs, priceUsd });
      } catch {
        return "skip";
      }
      return "continue";
    },
  });

  const btcSourceDiagnostics = buildBtcSourceDiagnostics(rawDiagnosticPoints);

  const quotes: ParsedQuote[] = [];
  await input.io.iterateJsonl(topOfBookPath, {
    onLine: (line) => {
      const quote = parseTopOfBookLine(line);
      if (!quote) {
        return "skip";
      }
      quotes.push(quote);
      return "continue";
    },
  });

  // Sort quotes for linear cursor join diagnostics; attribution uses the same order.
  quotes.sort((left, right) => left.timestampMs - right.timestampMs || left.marketTicker.localeCompare(right.marketTicker));

  const quoteJoinDiagnostics = buildQuoteJoinDiagnostics(quotes, btcPoints as BtcSpotPoint[]);

  const volatilityWindowDiagnostics = attributeVolatilityWindowRejections(quotes, btcPoints, {
    barIntervalMs: spec.volatilityDefinition.returnIntervalMs,
    lookbackBars: spec.volatilityDefinition.lookbackBars,
    maximumSourceGapMs: spec.volatilityDefinition.maximumSourceGapMs,
  });

  // Reference comparison only when historical semantics are uniquely proven.
  const referenceComparison =
    contractComparison.historicalEvidenceStatus === "proven" && contractComparison.equivalent
      ? emptyReferenceComparison(
          "Historical and forward contracts are equivalent; independent historicalReference path is not required for this selected-run diagnostic.",
        )
      : emptyReferenceComparison(
          "Historical contract is not uniquely reconstructable from evidence; historicalReference implementation was not fabricated.",
        );

  const reconstructability = assessReconstructability(
    volatilityWindowDiagnostics,
    contractComparison.equivalent,
    contractComparison.historicalEvidenceStatus === "ambiguous"
      || contractComparison.historicalEvidenceStatus === "insufficient"
      || contractComparison.hasAmbiguousMissingHistorical,
  );

  const classification = classifyCausalFeatureEquivalence({
    contractComparison,
    reconstructability,
    referenceComparison,
    candidateMarketCount: 0,
    highVolatilityCount: 0,
    settlementCoverageShare: null,
    volatilityAvailableCount:
      volatilityWindowDiagnostics.classes.find((entry) => entry.class === "available")
        ?.observationCount ?? 0,
  });

  const futureCaptureRequirements = buildFutureCaptureRequirements({
    verdict: classification.verdict,
    forward: currentForwardContract,
  });

  const warnings: string[] = [];
  if (btcSourceDiagnostics.outOfOrderCount > 0) {
    warnings.push(`BTC source series had ${btcSourceDiagnostics.outOfOrderCount} out-of-order adjacent pairs before sort.`);
  }
  if (contractComparison.hasAmbiguousMissingHistorical) {
    warnings.push(
      "Governed historical contract fields are missing or unavailable; verdict precedence selects historical-feature-definition-ambiguous.",
    );
  }

  return {
    analysisVersion: CAUSAL_FEATURE_EQUIVALENCE_ANALYSIS_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    analysisScope: "selected-run",
    selectedRunId,
    captureRunDir,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputFingerprints,
    hypothesisId: spec.hypothesisId,
    hypothesisConfigurationHash: spec.configurationHash,
    auditEvidencePath: evidencePath,
    auditEvidenceHash,
    historicalContractSemanticHash: hashVolatilityFeatureContract(historical.contract),
    currentForwardContractSemanticHash: hashVolatilityFeatureContract(currentForwardContract),
    historicalEvidenceStatus: contractComparison.historicalEvidenceStatus,
    historicalContract: historical.contract,
    currentForwardContract,
    contractComparison,
    btcSourceDiagnostics,
    quoteJoinDiagnostics,
    volatilityWindowDiagnostics,
    referenceComparison,
    reconstructability,
    futureCaptureRequirements,
    verdict: classification.verdict,
    recommendedNextAction: classification.recommendedNextAction,
    limitations: [
      ...evidence.limitations,
      ...historical.ambiguities,
      "Candidate counts, high-volatility counts, and settlements do not drive the equivalence verdict.",
    ],
    warnings,
    nonClaims: [...NON_CLAIMS],
  };
}
