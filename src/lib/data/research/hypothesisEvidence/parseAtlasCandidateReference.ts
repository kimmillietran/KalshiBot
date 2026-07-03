export const ATLAS_CANDIDATE_GROUP_IDS = [
  "probabilityOnly",
  "probabilityTime",
  "probabilityRegime",
  "volatility",
  "timeRemaining",
  "moneyness",
  "probability",
] as const;

export type AtlasCandidateGroupId = (typeof ATLAS_CANDIDATE_GROUP_IDS)[number];

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
} {
  const coarseTimeMatch = /^(coarse-prob-\d+)-(coarse-time-(?:early|late))$/.exec(
    bucketId,
  );
  if (coarseTimeMatch) {
    return {
      probabilityBucket: coarseTimeMatch[1] ?? null,
      timeBucket: coarseTimeMatch[2] ?? null,
      regimeBucket: null,
    };
  }

  const coarseRegimeMatch =
    /^(coarse-prob-\d+)-(coarse-regime-(?:low|medium|high))$/.exec(bucketId);
  if (coarseRegimeMatch) {
    return {
      probabilityBucket: coarseRegimeMatch[1] ?? null,
      timeBucket: null,
      regimeBucket: coarseRegimeMatch[2] ?? null,
    };
  }

  if (bucketId.startsWith("coarse-prob-")) {
    return {
      probabilityBucket: bucketId,
      timeBucket: null,
      regimeBucket: null,
    };
  }

  if (bucketId.startsWith("prob-")) {
    return {
      probabilityBucket: bucketId,
      timeBucket: null,
      regimeBucket: null,
    };
  }

  if (bucketId.startsWith("time-")) {
    return {
      probabilityBucket: null,
      timeBucket: bucketId,
      regimeBucket: null,
    };
  }

  if (bucketId.startsWith("vol-")) {
    return {
      probabilityBucket: null,
      timeBucket: null,
      regimeBucket: bucketId,
    };
  }

  return {
    probabilityBucket: null,
    timeBucket: null,
    regimeBucket: null,
  };
}
