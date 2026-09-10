import {
  COARSE_VOLATILITY_REGIME_DEFINITIONS,
  buildCompositeBucketTemplates,
  getResearchDimension,
  listResearchAxisGroups,
} from "../dimensions";
import { DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE } from "../hypothesisRobustness/hypothesisRobustnessTypes";
import {
  V2_CROSS_RUN_JSON_ROOT,
} from "../calibrationFadeV2CrossRunValidation/calibrationFadeV2CrossRunValidationTypes";

import {
  CalibrationFadeV2EvidenceStrengthError,
  type CalibrationFadeV2EvidenceStrengthIo,
  type DiscoveryMethodologyContext,
  type EvidenceLayerDistinction,
  type HistoricalLineageContext,
  type SourceArtifactAuthorityAssessment,
  type VolatilityWindowContiguityAssessment,
} from "./calibrationFadeV2EvidenceStrengthTypes";

/**
 * Designed atlas discovery scale from the research axis registry.
 * Independent audits often round this to ~254 template buckets / ~508 directional tests.
 */
export function computeDesignedAtlasDiscoveryScale(): {
  axisGroupCount: number;
  designedTemplateBucketCount: number;
  designedDirectionalTestCount: number;
} {
  let designedTemplateBucketCount = 0;
  const groups = listResearchAxisGroups();
  for (const group of groups) {
    if (group.requiresRegimeVolatility) {
      designedTemplateBucketCount +=
        getResearchDimension(group.dimensionIds[0]!).getBuckets().length
        * COARSE_VOLATILITY_REGIME_DEFINITIONS.length;
      continue;
    }
    if (group.dimensionIds.length === 1) {
      designedTemplateBucketCount += getResearchDimension(group.dimensionIds[0]!).getBuckets().length;
      continue;
    }
    designedTemplateBucketCount += buildCompositeBucketTemplates(group.dimensionIds).length;
  }
  return {
    axisGroupCount: groups.length,
    designedTemplateBucketCount,
    designedDirectionalTestCount: designedTemplateBucketCount * 2,
  };
}

export function buildDiscoveryMethodologyContext(): DiscoveryMethodologyContext {
  const scale = computeDesignedAtlasDiscoveryScale();
  return {
    role: "upstream-discovery-selection-quality-only",
    axisGroupCount: scale.axisGroupCount,
    designedTemplateBucketCount: scale.designedTemplateBucketCount,
    designedDirectionalTestCount: scale.designedDirectionalTestCount,
    auditApproximateTemplateBucketCount: 254,
    auditApproximateDirectionalTestCount: 508,
    directionalExpansion: "each-template-bucket-evaluated-as-over-and-under",
    hypothesesCorrelated: true,
    historicalRobustnessCharacter: "in-sample-not-held-out",
    fdrOosMachineryOnPromotionPath: false,
    notes: [
      `Designed registry Cartesian product yields ${scale.designedTemplateBucketCount} template `
        + `buckets × over/under = ${scale.designedDirectionalTestCount} directional tests `
        + `(independent audits often round to ~254 / ~508).`,
      "Atlas/hypothesis robustness re-scans the same research outputs used for discovery; "
        + "leave-one-month-out is within-corpus, not a reserved held-out validation.",
      "overfittingDiagnostics (Benjamini–Hochberg) and oosPowerCorrection (Benjamini–Yekutieli) "
        + "exist as analysis overlays but were not on the candidate-promotion input path for this lineage.",
      "Do not retroactively alter the frozen v2 classifier or sealed confirmatory result from this context.",
    ],
  };
}

export function buildEvidenceLayerDistinction(input: {
  governedInterpretationClassification: string;
  inferentialStrengthSummary: string;
  historicalPasses: boolean;
}): EvidenceLayerDistinction {
  return {
    preregisteredClassifierCorrectness: {
      status: "governed-artifact-authoritative",
      governedInterpretationClassification: input.governedInterpretationClassification,
      note:
        "Layer 1: the sealed confirmatory cross-run classification under the frozen preregistered "
        + "rules remains authoritative. This audit does not override or reinterpret it.",
    },
    inferentialEvidenceStrength: {
      status: "separately-quantified",
      summary: input.inferentialStrengthSummary,
      note:
        "Layer 2: how much statistical/inferential weight a researcher should attach to the "
        + "governed result given n, reachability, calibrated-null probabilities, and power assumptions.",
    },
    upstreamDiscoverySelectionQuality: {
      status: input.historicalPasses
        ? "historical-lineage-passed-available-gate"
        : "historical-lineage-failed-available-gate",
      note:
        "Layer 3: quality of the upstream discovery/selection process that nominated the candidate "
        + "before prospective confirmatory testing. Distinct from both classifier correctness and "
        + "prospective inferential strength.",
    },
  };
}

export function buildHistoricalLineageContext(input: {
  observationCount: number;
  uniqueTradingDays: number;
  passes: boolean;
  robustnessScore: number;
  role: string;
  notes: readonly string[];
  limitations: readonly string[];
}): HistoricalLineageContext {
  const failedAvailablePromotionGate = input.passes === false;
  return {
    observationCount: input.observationCount,
    uniqueTradingDays: input.uniqueTradingDays,
    passes: input.passes,
    robustnessScore: input.robustnessScore,
    role: input.role,
    failedAvailablePromotionGate,
    referencedPromotionPassScoreThreshold: DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE,
    historicalValidationCharacter: "in-sample-exploratory-not-held-out",
    limitations: [...input.notes, ...input.limitations],
    distinction:
      "historicalCandidateLineage is exploratory discovery context only. "
      + "It is not prospective confirmatory evidence and must not be pooled with "
      + "the sealed forward result when interpreting the governed verdict.",
    promotionGateNote: failedAvailablePromotionGate
      ? `Historical lineage records passes=false (robustnessScore=${input.robustnessScore}) `
        + `against the available validation/promotion gate `
        + `(default passScoreThreshold=${DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE}). `
        + "Do not treat this candidate as a historically validated winner; it failed its "
        + "available promotion/validation gate before prospective confirmatory testing."
      : `Historical lineage records passes=true under the available gate `
        + `(default passScoreThreshold=${DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE}); `
        + "this remains exploratory lineage context, not prospective confirmatory evidence.",
  };
}

export function assessVolatilityWindowContiguity(input: {
  missingMinuteBehavior: string | null;
  returnIntervalMs: number | null;
}): VolatilityWindowContiguityAssessment {
  const omitsMissing =
    input.missingMinuteBehavior === "omit-missing-exchange-candles-no-fill";
  const assumesSixtySecond =
    input.returnIntervalMs === 60_000 || input.returnIntervalMs === null;
  const warningApplicable = omitsMissing && assumesSixtySecond;
  return {
    missingMinuteBehavior: input.missingMinuteBehavior,
    contractedReturnIntervalMs: input.returnIntervalMs,
    annualizationIntervalSource:
      "estimateRealizedVolatility→inferBarIntervalMs uses only the last two selected candle timestamps "
      + `(default ${60_000}ms); earlier omitted gaps are not individually annualized.`,
    contiguityRiskFlag: warningApplicable,
    doesNotModifyFrozenVolatilitySemantics: true,
    warning: warningApplicable
      ? "Frozen v2 volatility semantics omit missing completed-minute candles "
        + "(missingMinuteBehavior=omit-missing-exchange-candles-no-fill) while the contract "
        + "and annualization path still center on a 60-second bar interval. "
        + "Non-contiguous selected minutes can therefore contribute log-returns whose wall-clock "
        + "span exceeds the assumed interval when earlier gaps are present but the last pair is 60s. "
        + "This is a methodology warning only; frozen v2 volatility semantics are not modified here."
      : null,
  };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function classifyCrossRunReportPathKind(
  crossRunReportPath: string,
  runSetHash: string,
): SourceArtifactAuthorityAssessment["pathKind"] {
  const normalized = normalizePath(crossRunReportPath);
  if (normalized.includes("/latest") || normalized.endsWith("/latest")) {
    return "latest-forbidden";
  }
  const snapshotMarker = `/cross-run/confirmatory/${runSetHash}/settlement-snapshots/`;
  if (normalized.includes(snapshotMarker)) {
    return "settlement-snapshot-scoped";
  }
  const legacyRoot =
    `${V2_CROSS_RUN_JSON_ROOT}/${runSetHash}/calibration-fade-v2-cross-run-validation.json`;
  if (
    normalized === legacyRoot
    || normalized.endsWith(`/${runSetHash}/calibration-fade-v2-cross-run-validation.json`)
  ) {
    return "legacy-runset-root";
  }
  return "other";
}

export function assessSourceArtifactAuthority(input: {
  io: CalibrationFadeV2EvidenceStrengthIo;
  crossRunReportPath: string;
  runSetHash: string;
  settlementSnapshotHash: string;
}): SourceArtifactAuthorityAssessment {
  const normalized = normalizePath(input.crossRunReportPath);
  const pathKind = classifyCrossRunReportPathKind(normalized, input.runSetHash);

  if (pathKind === "latest-forbidden") {
    throw new CalibrationFadeV2EvidenceStrengthError(
      "Evidence-strength audit rejects mutable latest cross-run paths; "
        + "supply an explicit settlement-snapshots/<settlementSnapshotHash>/ artifact.",
    );
  }

  const legacyRootRelative =
    `${V2_CROSS_RUN_JSON_ROOT}/${input.runSetHash}/calibration-fade-v2-cross-run-validation.json`;
  const legacyRootBesideSnapshot = (() => {
    const marker = `/cross-run/confirmatory/${input.runSetHash}/settlement-snapshots/`;
    const index = normalized.lastIndexOf(marker);
    if (index < 0) {
      return null;
    }
    const rootPrefix = normalized.slice(0, index + `/cross-run/confirmatory/${input.runSetHash}`.length);
    return `${rootPrefix}/calibration-fade-v2-cross-run-validation.json`;
  })();

  const legacyRootCandidates = [
    legacyRootRelative,
    ...(legacyRootBesideSnapshot ? [legacyRootBesideSnapshot] : []),
  ];
  const legacyRootPresent = legacyRootCandidates.some((candidate) => input.io.fileExists(candidate));

  if (pathKind === "legacy-runset-root") {
    const snapshotScopedRelative =
      `${V2_CROSS_RUN_JSON_ROOT}/${input.runSetHash}/settlement-snapshots/`
      + `${input.settlementSnapshotHash}/calibration-fade-v2-cross-run-validation.json`;
    const snapshotScopedBeside = (() => {
      const dir = normalized.replace(/\/calibration-fade-v2-cross-run-validation\.json$/, "");
      return (
        `${dir}/settlement-snapshots/${input.settlementSnapshotHash}/`
        + "calibration-fade-v2-cross-run-validation.json"
      );
    })();
    const snapshotScopedExists =
      input.io.fileExists(snapshotScopedRelative) || input.io.fileExists(snapshotScopedBeside);

    if (snapshotScopedExists) {
      throw new CalibrationFadeV2EvidenceStrengthError(
        "Cross-run report path points at the mutable/legacy runSet root. "
          + "When settlement-snapshot-scoped artifacts exist, evidence-strength requires the "
          + "explicit settlement-snapshots/<settlementSnapshotHash>/ report path. "
          + "Do not treat the legacy root as authoritative; do not use latest/mtime discovery.",
      );
    }

    return {
      pathKind,
      authoritativeForThisAudit: false,
      legacyRunSetRootAlsoPresent: true,
      settlementSnapshotHash: input.settlementSnapshotHash,
      warning:
        "Supplied path is the legacy runSet-root cross-run artifact. Prefer an explicit "
          + "settlement-snapshots/<settlementSnapshotHash>/ path; the legacy root is not "
          + "authoritative when snapshot-scoped artifacts exist.",
    };
  }

  if (pathKind === "settlement-snapshot-scoped") {
    return {
      pathKind,
      authoritativeForThisAudit: true,
      legacyRunSetRootAlsoPresent: legacyRootPresent,
      settlementSnapshotHash: input.settlementSnapshotHash,
      warning: legacyRootPresent
        ? "A legacy runSet-root cross-run artifact is also present. It is non-authoritative; "
          + "this audit uses only the explicitly supplied settlement-snapshot-scoped path."
        : null,
    };
  }

  return {
    pathKind,
    authoritativeForThisAudit: true,
    legacyRunSetRootAlsoPresent: legacyRootPresent,
    settlementSnapshotHash: input.settlementSnapshotHash,
    warning:
      "Cross-run report path is neither the documented settlement-snapshot namespace nor the "
        + "legacy runSet root; ensure the path is explicit and identity-addressed (no latest/mtime).",
  };
}
