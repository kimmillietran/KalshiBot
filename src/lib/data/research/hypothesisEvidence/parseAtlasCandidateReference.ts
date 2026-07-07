import { HYPOTHESIS_ATLAS_GROUP_IDS } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

export const ATLAS_CANDIDATE_GROUP_IDS = [...HYPOTHESIS_ATLAS_GROUP_IDS].sort(
  (left, right) => right.length - left.length,
) as unknown as readonly (typeof HYPOTHESIS_ATLAS_GROUP_IDS)[number][];

export type AtlasCandidateGroupId = (typeof HYPOTHESIS_ATLAS_GROUP_IDS)[number];

export type AtlasCandidateReference = {
  groupId: AtlasCandidateGroupId;
  bucketId: string;
  direction: "over" | "under";
};

export type LeadLagCandidateReference = {
  lag: number;
};

export function parseAtlasCandidateReference(
  candidateId: string,
): AtlasCandidateReference | null {
  if (!candidateId.startsWith("atlas-")) {
    return null;
  }

  const direction = candidateId.endsWith("-over")
    ? "over"
    : candidateId.endsWith("-under")
      ? "under"
      : null;

  if (!direction) {
    return null;
  }

  const body = candidateId.slice("atlas-".length, -(direction.length + 1));

  for (const groupId of ATLAS_CANDIDATE_GROUP_IDS) {
    const prefix = `${groupId}-`;
    if (body.startsWith(prefix)) {
      return {
        groupId,
        bucketId: body.slice(prefix.length),
        direction,
      };
    }
  }

  return null;
}

export function parseLeadLagCandidateReference(
  candidateId: string,
): LeadLagCandidateReference | null {
  const match = /^lead-lag-aggregate-lag-(\d+)$/.exec(candidateId);
  if (!match) {
    return null;
  }

  return { lag: Number(match[1]) };
}

export function parseBucketAxisLabels(bucketId: string): {
  probabilityBucket: string | null;
  timeBucket: string | null;
  regimeBucket: string | null;
  moneynessBucket: string | null;
  volatilityBucket: string | null;
} {
  const coarseTimeMatch = /^(coarse-prob-\d+)-(coarse-time-(?:early|late))$/.exec(
    bucketId,
  );
  if (coarseTimeMatch) {
    return {
      probabilityBucket: coarseTimeMatch[1] ?? null,
      timeBucket: coarseTimeMatch[2] ?? null,
      regimeBucket: null,
      moneynessBucket: null,
      volatilityBucket: null,
    };
  }

  const coarseRegimeMatch =
    /^(coarse-prob-\d+)-(coarse-regime-(?:low|medium|high))$/.exec(bucketId);
  if (coarseRegimeMatch) {
    return {
      probabilityBucket: coarseRegimeMatch[1] ?? null,
      timeBucket: null,
      regimeBucket: coarseRegimeMatch[2] ?? null,
      moneynessBucket: null,
      volatilityBucket: null,
    };
  }

  const probabilityMoneynessMatch =
    /^(coarse-prob-\d+)-(moneyness-.+)$/.exec(bucketId);
  if (probabilityMoneynessMatch) {
    return {
      probabilityBucket: probabilityMoneynessMatch[1] ?? null,
      moneynessBucket: probabilityMoneynessMatch[2] ?? null,
      timeBucket: null,
      regimeBucket: null,
      volatilityBucket: null,
    };
  }

  const moneynessTimeMatch = /^(moneyness-.+)-(time-.+)$/.exec(bucketId);
  if (moneynessTimeMatch) {
    return {
      moneynessBucket: moneynessTimeMatch[1] ?? null,
      timeBucket: moneynessTimeMatch[2] ?? null,
      probabilityBucket: null,
      regimeBucket: null,
      volatilityBucket: null,
    };
  }

  const volatilityMoneynessMatch =
    /^(vol-(?:low|medium|high))-(moneyness-.+)$/.exec(bucketId);
  if (volatilityMoneynessMatch) {
    return {
      volatilityBucket: volatilityMoneynessMatch[1] ?? null,
      moneynessBucket: volatilityMoneynessMatch[2] ?? null,
      probabilityBucket: null,
      timeBucket: null,
      regimeBucket: null,
    };
  }

  const volatilityProbabilityTimeMatch =
    /^(vol-(?:low|medium|high))-(coarse-prob-\d+)-(coarse-time-(?:early|late))$/.exec(
      bucketId,
    );
  if (volatilityProbabilityTimeMatch) {
    return {
      volatilityBucket: volatilityProbabilityTimeMatch[1] ?? null,
      probabilityBucket: volatilityProbabilityTimeMatch[2] ?? null,
      timeBucket: volatilityProbabilityTimeMatch[3] ?? null,
      regimeBucket: null,
      moneynessBucket: null,
    };
  }

  if (bucketId.startsWith("coarse-prob-")) {
    return {
      probabilityBucket: bucketId,
      timeBucket: null,
      regimeBucket: null,
      moneynessBucket: null,
      volatilityBucket: null,
    };
  }

  if (bucketId.startsWith("prob-")) {
    return {
      probabilityBucket: bucketId,
      timeBucket: null,
      regimeBucket: null,
      moneynessBucket: null,
      volatilityBucket: null,
    };
  }

  if (bucketId.startsWith("time-")) {
    return {
      probabilityBucket: null,
      timeBucket: bucketId,
      regimeBucket: null,
      moneynessBucket: null,
      volatilityBucket: null,
    };
  }

  if (bucketId.startsWith("moneyness-")) {
    return {
      probabilityBucket: null,
      timeBucket: null,
      regimeBucket: null,
      moneynessBucket: bucketId,
      volatilityBucket: null,
    };
  }

  if (bucketId.startsWith("vol-")) {
    return {
      probabilityBucket: null,
      timeBucket: null,
      regimeBucket: bucketId,
      moneynessBucket: null,
      volatilityBucket: bucketId,
    };
  }

  return {
    probabilityBucket: null,
    timeBucket: null,
    regimeBucket: null,
    moneynessBucket: null,
    volatilityBucket: null,
  };
}
