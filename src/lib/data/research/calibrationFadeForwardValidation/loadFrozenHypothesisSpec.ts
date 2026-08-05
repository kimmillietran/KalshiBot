import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import {
  CALIBRATION_FADE_PROVENANCE_ACCEPTED_CONCLUSIONS,
  CALIBRATION_FADE_PROVENANCE_MANIFEST_SCHEMA,
  CALIBRATION_FADE_PROVENANCE_MANIFEST_VERSION,
  CalibrationFadeForwardValidationError,
  DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
  type CalibrationFadeForwardValidationIo,
  type CalibrationFadeInterpretationClassification,
  type CalibrationFadeProvenanceConclusion,
  type CalibrationFadeProvenanceReport,
  type CalibrationFadeProvenanceStatus,
  type FrozenHypothesisSpec,
  type HistoricalHypothesisBenchmark,
} from "./calibrationFadeForwardValidationTypes";
import { isRecord, readNumber, readString } from "./calibrationFadeForwardValidationUtils";

function hashFileContent(content: string): string {
  return fnv1a32(content.replace(/^\uFEFF/, ""));
}

/** Derives adjacent provenance path: hypotheses/X.json → hypotheses/provenance/X.json */
export function deriveProvenanceManifestPath(configPath: string): string {
  const normalized = configPath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const fileName = segments.pop();
  if (!fileName) {
    throw new CalibrationFadeForwardValidationError(`Invalid hypothesis config path: ${configPath}`);
  }
  return [...segments, "provenance", fileName].join("/");
}

function parseFreezeDocument(parsed: Record<string, unknown>): Omit<FrozenHypothesisSpec, "configurationHash"> {
  const hypothesisId = readString(parsed.hypothesisId);
  const hypothesisVersion = readString(parsed.hypothesisVersion);
  const description = readString(parsed.description);
  const sourceCandidateId = readString(parsed.sourceCandidateId);
  if (!hypothesisId || !hypothesisVersion || !description || !sourceCandidateId) {
    throw new CalibrationFadeForwardValidationError("Hypothesis freeze spec is missing required identity fields.");
  }

  const canonicalSourceArtifacts = Array.isArray(parsed.canonicalSourceArtifacts)
    ? parsed.canonicalSourceArtifacts.filter((entry): entry is string => typeof entry === "string")
    : [];

  const eligibilityRules = parsed.eligibilityRules;
  const probabilityMeasure = parsed.probabilityMeasure;
  const volatilityDefinition = parsed.volatilityDefinition;
  const minimumEvidenceRequirements = parsed.minimumEvidenceRequirements;
  if (
    !isRecord(eligibilityRules)
    || !isRecord(probabilityMeasure)
    || !isRecord(volatilityDefinition)
    || !isRecord(minimumEvidenceRequirements)
  ) {
    throw new CalibrationFadeForwardValidationError("Hypothesis freeze spec is missing required rule sections.");
  }

  return {
    hypothesisId,
    hypothesisVersion,
    description,
    canonicalSourceArtifacts,
    sourceCandidateId,
    axisGroupId: readString(parsed.axisGroupId) ?? "",
    bucketId: readString(parsed.bucketId) ?? "",
    calibrationDirection: parsed.calibrationDirection === "under" ? "under" : "over",
    targetOutcomeSide: parsed.targetOutcomeSide === "yes" ? "yes" : "no",
    suggestedStrategyFamily: readString(parsed.suggestedStrategyFamily) ?? "calibration-no-fade",
    eligibilityRules: {
      volatility: {
        bucketId: readString((eligibilityRules.volatility as Record<string, unknown>)?.bucketId) ?? "vol-high",
        minInclusive: readNumber((eligibilityRules.volatility as Record<string, unknown>)?.minInclusive) ?? 0.6,
        maxExclusive: readNumber((eligibilityRules.volatility as Record<string, unknown>)?.maxExclusive),
      },
      probability: {
        bucketId: readString((eligibilityRules.probability as Record<string, unknown>)?.bucketId) ?? "coarse-prob-1",
        minInclusive: readNumber((eligibilityRules.probability as Record<string, unknown>)?.minInclusive) ?? 1 / 3,
        maxExclusive: readNumber((eligibilityRules.probability as Record<string, unknown>)?.maxExclusive) ?? 2 / 3,
      },
      timeRemainingMs: {
        bucketId: readString((eligibilityRules.timeRemainingMs as Record<string, unknown>)?.bucketId) ?? "coarse-time-early",
        minInclusive: readNumber((eligibilityRules.timeRemainingMs as Record<string, unknown>)?.minInclusive) ?? 0,
        maxExclusive: readNumber((eligibilityRules.timeRemainingMs as Record<string, unknown>)?.maxExclusive) ?? 900_000,
      },
    },
    probabilityMeasure: {
      id: readString(probabilityMeasure.id) ?? "yes-bid-ask-midpoint",
      definition: readString(probabilityMeasure.definition) ?? "",
      formula: readString(probabilityMeasure.formula) ?? "",
    },
    volatilityDefinition: {
      sourceInstrument: readString(volatilityDefinition.sourceInstrument) ?? "BTC",
      returnIntervalMs: readNumber(volatilityDefinition.returnIntervalMs) ?? 60_000,
      lookbackBars: readNumber(volatilityDefinition.lookbackBars) ?? 10,
      method: readString(volatilityDefinition.method) ?? "realized-log-return-annualized",
      causalOnly: volatilityDefinition.causalOnly !== false,
      maximumSourceGapMs: readNumber(volatilityDefinition.maximumSourceGapMs) ?? 5_000,
    },
    marketEligibilityRules: {
      requireValidBook: (parsed.marketEligibilityRules as Record<string, unknown> | undefined)?.requireValidBook !== false,
      requireSynchronizedBook:
        (parsed.marketEligibilityRules as Record<string, unknown> | undefined)?.requireSynchronizedBook !== false,
      requireOpenMarket:
        (parsed.marketEligibilityRules as Record<string, unknown> | undefined)?.requireOpenMarket !== false,
      requireBtcJoin:
        (parsed.marketEligibilityRules as Record<string, unknown> | undefined)?.requireBtcJoin !== false,
    },
    deduplicationPolicy: {
      episodeBreakOnDisqualification: true,
      entryRule: readString((parsed.deduplicationPolicy as Record<string, unknown> | undefined)?.entryRule)
        ?? "first-crossing-into-eligibility",
      primaryValidationUnit: readString(
        (parsed.deduplicationPolicy as Record<string, unknown> | undefined)?.primaryValidationUnit,
      ) ?? "one-first-entry-per-market",
      suppressRepeatedQualifyingSnapshots:
        (parsed.deduplicationPolicy as Record<string, unknown> | undefined)?.suppressRepeatedQualifyingSnapshots
        !== false,
    },
    entryPriceMeasures: {
      calibrationLayer: readString((parsed.entryPriceMeasures as Record<string, unknown> | undefined)?.calibrationLayer)
        ?? "yes-bid-ask-midpoint",
      executableLayer: readString((parsed.entryPriceMeasures as Record<string, unknown> | undefined)?.executableLayer)
        ?? "no-ask-cross-spread",
      diagnosticLayer: readString((parsed.entryPriceMeasures as Record<string, unknown> | undefined)?.diagnosticLayer)
        ?? "yes-bid-ask-midpoint",
    },
    settlementMapping: isRecord(parsed.settlementMapping)
      ? (parsed.settlementMapping as Record<string, string | number>)
      : {},
    minimumEvidenceRequirements: {
      minimumIndependentCandidateMarkets:
        readNumber(minimumEvidenceRequirements.minimumIndependentCandidateMarkets) ?? 5,
      minimumSettlementCoverageShare:
        readNumber(minimumEvidenceRequirements.minimumSettlementCoverageShare) ?? 0.8,
      minimumValidBookShare: readNumber(minimumEvidenceRequirements.minimumValidBookShare) ?? 0.9,
      minimumBtcJoinCoverageShare:
        readNumber(minimumEvidenceRequirements.minimumBtcJoinCoverageShare) ?? 0.9,
      materialRejectionCalibrationGap:
        readNumber(minimumEvidenceRequirements.materialRejectionCalibrationGap) ?? 0.05,
      materialSupportCalibrationGap:
        readNumber(minimumEvidenceRequirements.materialSupportCalibrationGap) ?? 0.03,
      materialExecutableNetReturnCents:
        readNumber(minimumEvidenceRequirements.materialExecutableNetReturnCents) ?? 1,
    },
    classificationRules: {
      precedence: Array.isArray((parsed.classificationRules as Record<string, unknown> | undefined)?.precedence)
        ? ((parsed.classificationRules as Record<string, unknown>).precedence as CalibrationFadeInterpretationClassification[])
        : ["insufficient-forward-events"],
    },
  };
}

function findCandidate(
  parsed: Record<string, unknown>,
  candidateId: string,
): HypothesisCandidate | null {
  const candidates = parsed.candidates;
  if (!Array.isArray(candidates)) {
    return null;
  }

  for (const entry of candidates) {
    if (!isRecord(entry)) {
      continue;
    }
    if (readString(entry.candidateId) === candidateId) {
      return entry as unknown as HypothesisCandidate;
    }
  }

  return null;
}

function emptyProvenance(status: CalibrationFadeProvenanceStatus, path: string | null): CalibrationFadeProvenanceReport {
  return {
    provenanceAvailable: false,
    provenanceStatus: status,
    provenanceManifestPath: path,
    provenanceManifestHash: null,
    provenanceConclusion: null,
    ruleFreezeEvidence: null,
    historicalBenchmarkAvailability: null,
    missingArtifacts: [],
    limitations: [],
    integrityCorrections: [],
    originalFreezeCommitSha: null,
    originalFreezeCommitTimestamp: null,
    originalConfigHash: null,
    resolvedConfigHash: null,
    firstForwardEvaluationBoundary: null,
  };
}

function validateProvenanceManifest(input: {
  io: CalibrationFadeForwardValidationIo;
  configPath: string;
  spec: FrozenHypothesisSpec;
}): { provenance: CalibrationFadeProvenanceReport; warnings: string[] } {
  const manifestPath = deriveProvenanceManifestPath(input.configPath);
  const warnings: string[] = [];

  if (!input.io.fileExists(manifestPath)) {
    warnings.push(`Missing provenance manifest: ${manifestPath}`);
    return { provenance: emptyProvenance("missing-manifest", manifestPath), warnings };
  }

  let rawContent: string;
  let parsed: unknown;
  try {
    rawContent = input.io.readFile(manifestPath).replace(/^\uFEFF/, "");
    parsed = JSON.parse(rawContent);
  } catch {
    warnings.push(`Malformed provenance manifest: ${manifestPath}`);
    return { provenance: emptyProvenance("malformed-manifest", manifestPath), warnings };
  }

  if (!isRecord(parsed)) {
    warnings.push(`Provenance manifest root must be an object: ${manifestPath}`);
    return { provenance: emptyProvenance("malformed-manifest", manifestPath), warnings };
  }

  const schema = readString(parsed.schema);
  const version = readNumber(parsed.version);
  if (schema !== CALIBRATION_FADE_PROVENANCE_MANIFEST_SCHEMA || version !== CALIBRATION_FADE_PROVENANCE_MANIFEST_VERSION) {
    warnings.push(
      `Unsupported provenance manifest version/schema at ${manifestPath} `
        + `(schema=${schema ?? "missing"}, version=${version ?? "missing"}).`,
    );
    return { provenance: emptyProvenance("unsupported-manifest-version", manifestPath), warnings };
  }

  const hypothesisId = readString(parsed.hypothesisId);
  const sourceCandidateId = readString(parsed.sourceCandidateId);
  const configPath = readString(parsed.configPath);
  const resolvedConfigHash = readString(parsed.resolvedConfigHash);
  const originalFreezeCommitSha = readString(parsed.originalFreezeCommitSha);
  const originalFreezeCommitTimestamp = readString(parsed.originalFreezeCommitTimestamp);
  const originalConfigHash = readString(parsed.originalConfigHash);
  const conclusion = readString(parsed.conclusion);
  const firstForwardEvaluationBoundary = readString(parsed.firstForwardEvaluationBoundary);

  if (
    hypothesisId !== input.spec.hypothesisId
    || sourceCandidateId !== input.spec.sourceCandidateId
    || configPath !== input.configPath.replace(/\\/g, "/")
  ) {
    warnings.push(
      `Provenance manifest identity mismatch at ${manifestPath} `
        + `(hypothesisId/sourceCandidateId/configPath must match the loaded freeze spec).`,
    );
    return { provenance: emptyProvenance("mismatched-manifest", manifestPath), warnings };
  }

  if (!originalFreezeCommitSha || !originalFreezeCommitTimestamp || !originalConfigHash || !resolvedConfigHash) {
    warnings.push(`Provenance manifest missing freeze identity fields: ${manifestPath}`);
    return { provenance: emptyProvenance("mismatched-manifest", manifestPath), warnings };
  }

  if (resolvedConfigHash !== input.spec.configurationHash) {
    warnings.push(
      `Provenance manifest resolvedConfigHash ${resolvedConfigHash} does not match `
        + `current configuration hash ${input.spec.configurationHash}.`,
    );
    return { provenance: emptyProvenance("mismatched-manifest", manifestPath), warnings };
  }

  if (
    !conclusion
    || !(CALIBRATION_FADE_PROVENANCE_ACCEPTED_CONCLUSIONS as readonly string[]).includes(conclusion)
  ) {
    warnings.push(`Unacceptable provenance conclusion at ${manifestPath}: ${conclusion ?? "missing"}`);
    return { provenance: emptyProvenance("unacceptable-conclusion", manifestPath), warnings };
  }

  const missingArtifacts = Array.isArray(parsed.missingArtifacts)
    ? parsed.missingArtifacts.filter((entry): entry is string => typeof entry === "string")
    : [];
  const limitations = Array.isArray(parsed.limitations)
    ? parsed.limitations.filter((entry): entry is string => typeof entry === "string")
    : [];
  const integrityCorrections = Array.isArray(parsed.integrityCorrections)
    ? parsed.integrityCorrections.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  const historicalBenchmarkAvailability =
    parsed.historicalBenchmarkAvailability === "available" ? "available" as const : "unavailable" as const;
  const ruleFreezeEvidence = isRecord(parsed.ruleFreezeEvidence) ? parsed.ruleFreezeEvidence : null;

  return {
    provenance: {
      provenanceAvailable: true,
      provenanceStatus: "valid-manifest",
      provenanceManifestPath: manifestPath,
      provenanceManifestHash: hashFileContent(rawContent),
      provenanceConclusion: conclusion as CalibrationFadeProvenanceConclusion,
      ruleFreezeEvidence,
      historicalBenchmarkAvailability,
      missingArtifacts,
      limitations,
      integrityCorrections,
      originalFreezeCommitSha,
      originalFreezeCommitTimestamp,
      originalConfigHash,
      resolvedConfigHash,
      firstForwardEvaluationBoundary,
    },
    warnings,
  };
}

/** Loads and hashes the frozen hypothesis specification with rule-freeze provenance. */
export function loadFrozenHypothesisSpec(input: {
  io: CalibrationFadeForwardValidationIo;
  hypothesisConfigPath?: string;
  hypothesisId?: string;
}): {
  spec: FrozenHypothesisSpec;
  historicalBenchmark: HistoricalHypothesisBenchmark;
  provenanceAvailable: boolean;
  provenance: CalibrationFadeProvenanceReport;
  warnings: string[];
} {
  const configPath = (input.hypothesisConfigPath ?? DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH).replace(
    /\\/g,
    "/",
  );
  if (!input.io.fileExists(configPath)) {
    throw new CalibrationFadeForwardValidationError(`Hypothesis freeze spec not found: ${configPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.io.readFile(configPath).replace(/^\uFEFF/, ""));
  } catch {
    throw new CalibrationFadeForwardValidationError(`Malformed hypothesis freeze spec: ${configPath}`);
  }

  if (!isRecord(parsed)) {
    throw new CalibrationFadeForwardValidationError(`Hypothesis freeze spec root must be an object: ${configPath}`);
  }

  const withoutHash = parseFreezeDocument(parsed);
  if (input.hypothesisId && withoutHash.hypothesisId !== input.hypothesisId) {
    throw new CalibrationFadeForwardValidationError(
      `Unknown hypothesis ID ${input.hypothesisId}; expected ${withoutHash.hypothesisId}.`,
    );
  }

  const configurationHash = fnv1a32(stableStringify(withoutHash));
  const spec: FrozenHypothesisSpec = { ...withoutHash, configurationHash };

  const { provenance, warnings: provenanceWarnings } = validateProvenanceManifest({
    io: input.io,
    configPath,
    spec,
  });

  const sourceArtifactHashes: Record<string, string> = {};
  const warnings: string[] = [...provenanceWarnings];
  let candidate: HypothesisCandidate | null = null;
  let validationRecord: Record<string, unknown> | null = null;

  for (const artifactPath of spec.canonicalSourceArtifacts) {
    if (!input.io.fileExists(artifactPath)) {
      warnings.push(`Missing canonical source artifact: ${artifactPath}`);
      continue;
    }
    const content = input.io.readFile(artifactPath);
    sourceArtifactHashes[artifactPath] = hashFileContent(content);
    const artifactParsed = JSON.parse(content.replace(/^\uFEFF/, "")) as Record<string, unknown>;
    if (artifactPath.includes("hypothesis-candidates")) {
      candidate = findCandidate(artifactParsed, spec.sourceCandidateId);
      if (!candidate) {
        warnings.push(`Canonical candidate ${spec.sourceCandidateId} not found in ${artifactPath}.`);
      }
    }
    if (artifactPath.includes("hypothesis-validation") && Array.isArray(artifactParsed.validations)) {
      validationRecord =
        artifactParsed.validations.find(
          (entry) => isRecord(entry) && readString(entry.hypothesisId) === spec.sourceCandidateId,
        ) as Record<string, unknown> | undefined ?? null;
    }
  }

  // Rule-freeze provenance comes from the validated manifest (even when candidate JSON is absent).
  // Historical benchmark statistics remain null when discovery artifacts are missing.
  const provenanceAvailable = provenance.provenanceAvailable;
  const bucketMetadata = candidate?.bucketMetadata;
  const historicalBenchmark: HistoricalHypothesisBenchmark = {
    discoveryObservationCount: readNumber(bucketMetadata?.observations) ?? null,
    discoveryUniqueTradingDays: readNumber(bucketMetadata?.uniqueTradingDays) ?? null,
    discoveryCalibrationError: readNumber(bucketMetadata?.calibrationError) ?? null,
    discoveryAverageImpliedProbability: null,
    discoveryRealizedFrequency: null,
    discoveryRobustnessScore: readNumber(validationRecord?.robustnessScore) ?? null,
    discoveryPassesValidation: typeof validationRecord?.passes === "boolean" ? validationRecord.passes : null,
    sourceArtifactPaths: spec.canonicalSourceArtifacts,
    sourceArtifactHashes,
    caveats: candidate?.warnings ?? [],
  };

  if (candidate?.rationale) {
    const impliedMatch = candidate.rationale.match(/implied ([0-9.]+%)/i);
    const realizedMatch = candidate.rationale.match(/realized ([0-9.]+%)/i);
    if (impliedMatch?.[1]) {
      historicalBenchmark.discoveryAverageImpliedProbability =
        Number.parseFloat(impliedMatch[1].replace("%", "")) / 100;
    }
    if (realizedMatch?.[1]) {
      historicalBenchmark.discoveryRealizedFrequency =
        Number.parseFloat(realizedMatch[1].replace("%", "")) / 100;
    }
  }

  return { spec, historicalBenchmark, provenanceAvailable, provenance, warnings };
}
