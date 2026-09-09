import {
  type CalibrationDirectionVerdict,
  type ExactCalibratedNullDistribution,
  type EvaluatedMarketInput,
  type FrozenCalibrationThresholds,
  type ReachableSignedGapState,
  type UncertaintySummary,
  type VerdictReachability,
} from "./calibrationFadeV2EvidenceStrengthTypes";

export function roundProbability(value: number, decimals = 12): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function meanOrNull(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeMarketLevelSignedCalibrationGap(input: {
  impliedYesProbabilities: readonly number[];
  yesOutcomes: readonly boolean[];
}): number | null {
  if (
    input.impliedYesProbabilities.length === 0
    || input.impliedYesProbabilities.length !== input.yesOutcomes.length
  ) {
    return null;
  }
  const meanImplied = meanOrNull(input.impliedYesProbabilities);
  if (meanImplied === null) {
    return null;
  }
  const yesCount = input.yesOutcomes.filter(Boolean).length;
  const yesRate = yesCount / input.yesOutcomes.length;
  return meanImplied - yesRate;
}

/**
 * Calibration-direction verdict under frozen over/under thresholds.
 * Does not model executable fee-adjusted returns.
 */
export function classifyCalibrationDirectionVerdict(input: {
  signedCalibrationGap: number | null;
  thresholds: FrozenCalibrationThresholds;
}): CalibrationDirectionVerdict {
  const gap = input.signedCalibrationGap;
  if (gap === null || !Number.isFinite(gap)) {
    return "other";
  }
  const { calibrationDirection, materialRejectionCalibrationGap, materialSupportCalibrationGap } =
    input.thresholds;

  if (calibrationDirection === "over") {
    if (gap <= -materialRejectionCalibrationGap) {
      return "reject";
    }
    if (gap >= materialSupportCalibrationGap) {
      return "support-calibration";
    }
    return "inconclusive";
  }

  // under: material rejection when gap is largely positive opposite direction
  if (gap >= materialRejectionCalibrationGap) {
    return "reject";
  }
  if (gap <= -materialSupportCalibrationGap) {
    return "support-calibration";
  }
  return "inconclusive";
}

export type EnumeratedCalibratedNull = {
  distribution: ExactCalibratedNullDistribution;
  reachability: VerdictReachability;
  uncertainty: UncertaintySummary;
};

/**
 * Exact enumeration of 2^n independent Bernoulli(p_i) settlement vectors.
 * Signed gap = mean(p) − yesRate. Suitable for small prospective n.
 */
export function enumerateExactCalibratedNull(input: {
  markets: readonly EvaluatedMarketInput[];
  thresholds: FrozenCalibrationThresholds;
  governedInterpretationClassification: string;
}): EnumeratedCalibratedNull {
  const probabilities = input.markets.map((market) => market.impliedYesProbability);
  const n = probabilities.length;
  const meanImplied = meanOrNull(probabilities) ?? 0;

  if (n === 0) {
    const emptyDistribution: ExactCalibratedNullDistribution = {
      method: "exact-poisson-binomial-enumeration",
      candidateMarketCount: 0,
      meanImpliedYesProbability: 0,
      probabilityOfReject: 0,
      probabilityOfSupportCalibration: 0,
      probabilityOfInconclusive: 0,
      probabilityOfSupportExecutable: null,
      probabilityOfOtherClassification: 0,
      probabilitiesSum: 1,
      observedYesCount: 0,
      observedSignedCalibrationGap: 0,
      observedCalibrationDirectionVerdict: "other",
      governedInterpretationClassification: input.governedInterpretationClassification,
    };
    return {
      distribution: emptyDistribution,
      reachability: {
        inconclusiveBandReachable: false,
        rejectBandReachable: false,
        supportCalibrationBandReachable: false,
        reachableSignedGapValues: [],
        adjacentAttainableMeanGapDistance: null,
        note: "No evaluated markets; calibrated-null enumeration is empty.",
      },
      uncertainty: {
        observedSignedCalibrationGap: null,
        calibratedNullStandardError: null,
        calibratedNullVarianceOfMeanYesRate: null,
        calibratedNullExactCentralInterval95: null,
        intervalLabel: "exact-calibrated-null-central-95",
        normalApproximationWarning:
          "Normal approximation is not used for the primary interval at empty n.",
      },
    };
  }

  if (n > 24) {
    throw new Error(
      `Exact calibrated-null enumeration refuses n=${n}; implement a different method for large n.`,
    );
  }

  const byYesCount = new Map<
    number,
    { probability: number; gap: number; verdict: CalibrationDirectionVerdict }
  >();

  let probabilityOfReject = 0;
  let probabilityOfSupportCalibration = 0;
  let probabilityOfInconclusive = 0;
  let probabilityOfOtherClassification = 0;

  const totalStates = 1 << n;
  for (let mask = 0; mask < totalStates; mask += 1) {
    let probability = 1;
    let yesCount = 0;
    for (let index = 0; index < n; index += 1) {
      const p = probabilities[index]!;
      const yes = ((mask >> index) & 1) === 1;
      if (yes) {
        yesCount += 1;
        probability *= p;
      } else {
        probability *= 1 - p;
      }
    }
    const yesRate = yesCount / n;
    const gap = meanImplied - yesRate;
    const verdict = classifyCalibrationDirectionVerdict({
      signedCalibrationGap: gap,
      thresholds: input.thresholds,
    });

    const existing = byYesCount.get(yesCount);
    if (existing) {
      existing.probability += probability;
    } else {
      byYesCount.set(yesCount, { probability, gap, verdict });
    }

    if (verdict === "reject") {
      probabilityOfReject += probability;
    } else if (verdict === "support-calibration") {
      probabilityOfSupportCalibration += probability;
    } else if (verdict === "inconclusive") {
      probabilityOfInconclusive += probability;
    } else {
      probabilityOfOtherClassification += probability;
    }
  }

  const reachableSignedGapValues: ReachableSignedGapState[] = [...byYesCount.entries()]
    .map(([yesCount, entry]) => ({
      yesCount,
      signedCalibrationGap: roundProbability(entry.gap, 12),
      calibrationDirectionVerdict: entry.verdict,
      probabilityUnderCalibratedNull: roundProbability(entry.probability, 12),
    }))
    .sort((left, right) => left.signedCalibrationGap - right.signedCalibrationGap);

  const gaps = reachableSignedGapValues.map((entry) => entry.signedCalibrationGap);
  let adjacentAttainableMeanGapDistance: number | null = null;
  for (let index = 1; index < gaps.length; index += 1) {
    const distance = roundProbability(gaps[index]! - gaps[index - 1]!, 12);
    if (adjacentAttainableMeanGapDistance === null || distance < adjacentAttainableMeanGapDistance) {
      adjacentAttainableMeanGapDistance = distance;
    }
  }

  const observedYesOutcomes = input.markets.map((market) => market.settledOutcome === "yes");
  const observedYesCount = observedYesOutcomes.filter(Boolean).length;
  const observedSignedCalibrationGap =
    computeMarketLevelSignedCalibrationGap({
      impliedYesProbabilities: probabilities,
      yesOutcomes: observedYesOutcomes,
    }) ?? 0;
  const observedCalibrationDirectionVerdict = classifyCalibrationDirectionVerdict({
    signedCalibrationGap: observedSignedCalibrationGap,
    thresholds: input.thresholds,
  });

  const varianceOfMeanYesRate =
    probabilities.reduce((sum, p) => sum + p * (1 - p), 0) / (n * n);
  const calibratedNullStandardError = Math.sqrt(varianceOfMeanYesRate);

  // Exact central 95% interval for signed gap = meanImplied - yesRate under null.
  // Build CDF over attainable gaps (sorted ascending).
  const sortedForCdf = [...reachableSignedGapValues].sort(
    (left, right) => left.signedCalibrationGap - right.signedCalibrationGap,
  );
  let cumulative = 0;
  let lower: number | null = null;
  let upper: number | null = null;
  for (const state of sortedForCdf) {
    const previous = cumulative;
    cumulative += state.probabilityUnderCalibratedNull;
    if (lower === null && cumulative >= 0.025) {
      lower = state.signedCalibrationGap;
    }
    if (previous < 0.975) {
      upper = state.signedCalibrationGap;
    }
  }

  const probabilitiesSum = roundProbability(
    probabilityOfReject
      + probabilityOfSupportCalibration
      + probabilityOfInconclusive
      + probabilityOfOtherClassification,
    12,
  );

  return {
    distribution: {
      method: "exact-poisson-binomial-enumeration",
      candidateMarketCount: n,
      meanImpliedYesProbability: roundProbability(meanImplied, 12),
      probabilityOfReject: roundProbability(probabilityOfReject, 12),
      probabilityOfSupportCalibration: roundProbability(probabilityOfSupportCalibration, 12),
      probabilityOfInconclusive: roundProbability(probabilityOfInconclusive, 12),
      probabilityOfSupportExecutable: null,
      probabilityOfOtherClassification: roundProbability(probabilityOfOtherClassification, 12),
      probabilitiesSum,
      observedYesCount,
      observedSignedCalibrationGap: roundProbability(observedSignedCalibrationGap, 12),
      observedCalibrationDirectionVerdict,
      governedInterpretationClassification: input.governedInterpretationClassification,
    },
    reachability: {
      inconclusiveBandReachable: probabilityOfInconclusive > 0,
      rejectBandReachable: probabilityOfReject > 0,
      supportCalibrationBandReachable: probabilityOfSupportCalibration > 0,
      reachableSignedGapValues,
      adjacentAttainableMeanGapDistance,
      note:
        "Attainable signed gaps equal meanImplied − k/n for integer yes-count k. "
        + "At small n the frozen inconclusive band may be unreachable.",
    },
    uncertainty: {
      observedSignedCalibrationGap: roundProbability(observedSignedCalibrationGap, 12),
      calibratedNullStandardError: roundProbability(calibratedNullStandardError, 12),
      calibratedNullVarianceOfMeanYesRate: roundProbability(varianceOfMeanYesRate, 12),
      calibratedNullExactCentralInterval95:
        lower === null || upper === null
          ? null
          : { lower: roundProbability(lower, 12), upper: roundProbability(upper, 12) },
      intervalLabel: "exact-calibrated-null-central-95",
      normalApproximationWarning:
        "A normal/t confidence interval around the observed gap is not primary at tiny n; "
        + "the exact calibrated-null central interval is reported instead.",
    },
  };
}
