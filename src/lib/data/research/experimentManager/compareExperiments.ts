import type {
  ArtifactStatusChange,
  ExperimentPairComparison,
  PromotionDecisionChange,
  ResearchExperimentRecord,
} from "./experimentManagerTypes";

function buildPromotionMap(
  record: ResearchExperimentRecord,
): Map<string, string> {
  const map = new Map<string, string>();

  for (const promotion of record.promotionSnapshot) {
    map.set(promotion.strategyId, promotion.decision);
  }

  return map;
}

function buildCandidateIdSet(record: ResearchExperimentRecord): Set<string> {
  return new Set(record.promotionSnapshot.map((promotion) => promotion.strategyId));
}

function comparePromotionDecisions(
  baseline: ResearchExperimentRecord,
  compare: ResearchExperimentRecord,
): PromotionDecisionChange[] {
  const baselineMap = buildPromotionMap(baseline);
  const compareMap = buildPromotionMap(compare);
  const strategyIds = new Set([...baselineMap.keys(), ...compareMap.keys()]);
  const changes: PromotionDecisionChange[] = [];

  for (const strategyId of [...strategyIds].sort()) {
    const previousDecision = baselineMap.get(strategyId) ?? null;
    const currentDecision = compareMap.get(strategyId) ?? null;

    if (previousDecision !== currentDecision) {
      changes.push({
        strategyId,
        previousDecision,
        currentDecision,
      });
    }
  }

  return changes;
}

function compareCandidateIds(
  baseline: ResearchExperimentRecord,
  compare: ResearchExperimentRecord,
): ExperimentPairComparison["candidateChanges"] {
  const baselineIds = buildCandidateIdSet(baseline);
  const compareIds = buildCandidateIdSet(compare);
  const added: string[] = [];
  const removed: string[] = [];
  const unchanged: string[] = [];

  for (const strategyId of compareIds) {
    if (baselineIds.has(strategyId)) {
      unchanged.push(strategyId);
    } else {
      added.push(strategyId);
    }
  }

  for (const strategyId of baselineIds) {
    if (!compareIds.has(strategyId)) {
      removed.push(strategyId);
    }
  }

  return {
    added: added.sort(),
    removed: removed.sort(),
    unchanged: unchanged.sort(),
  };
}

function compareArtifactSnapshots(
  baseline: ResearchExperimentRecord,
  compare: ResearchExperimentRecord,
): ArtifactStatusChange[] {
  const baselineMap = new Map(
    baseline.artifactSnapshot.map((artifact) => [artifact.artifactId, artifact.status]),
  );
  const compareMap = new Map(
    compare.artifactSnapshot.map((artifact) => [artifact.artifactId, artifact.status]),
  );
  const artifactIds = new Set([...baselineMap.keys(), ...compareMap.keys()]);
  const changes: ArtifactStatusChange[] = [];

  for (const artifactId of [...artifactIds].sort()) {
    const previousStatus = baselineMap.get(artifactId) ?? null;
    const currentStatus = compareMap.get(artifactId) ?? null;

    if (previousStatus !== currentStatus) {
      changes.push({
        artifactId,
        previousStatus,
        currentStatus,
      });
    }
  }

  return changes;
}

function deltaOrNull(left: number | null, right: number | null): number | null {
  if (left === null || right === null) {
    return null;
  }

  return right - left;
}

export function compareExperimentPair(
  baseline: ResearchExperimentRecord,
  compare: ResearchExperimentRecord,
  options?: {
    baselinePresent?: boolean;
    comparePresent?: boolean;
  },
): ExperimentPairComparison {
  const baselineAverage = baseline.validationSummary?.averageRobustnessScore ?? null;
  const compareAverage = compare.validationSummary?.averageRobustnessScore ?? null;

  return {
    baselineExperimentId: baseline.experimentId,
    compareExperimentId: compare.experimentId,
    baselinePresent: options?.baselinePresent ?? true,
    comparePresent: options?.comparePresent ?? true,
    hypothesisCountDelta: deltaOrNull(
      baseline.hypothesisCount,
      compare.hypothesisCount,
    ),
    averageRobustnessDelta: deltaOrNull(baselineAverage, compareAverage),
    promotionChanges: comparePromotionDecisions(baseline, compare),
    candidateChanges: compareCandidateIds(baseline, compare),
    pipelineDurationDeltaMs: deltaOrNull(
      baseline.runtime.pipelineDurationMs,
      compare.runtime.pipelineDurationMs,
    ),
    fullResearchDurationDeltaMs: deltaOrNull(
      baseline.runtime.fullResearchDurationMs,
      compare.runtime.fullResearchDurationMs,
    ),
    artifactChanges: compareArtifactSnapshots(baseline, compare),
  };
}

export function parseExperimentRecord(json: string): ResearchExperimentRecord {
  return JSON.parse(json) as ResearchExperimentRecord;
}
