import type {
  FamilyReadiness,
  ResearchFamilyId,
  SelectionStatus,
} from "./nextFamilyReadinessTypes";

export type NextFamilySelection = {
  recommendedFamily: ResearchFamilyId | null;
  selectionStatus: SelectionStatus;
  recommendationRationale: readonly string[];
  rankedFamilyIds: readonly ResearchFamilyId[];
};

const INDEPENDENCE_RANK = {
  high: 0,
  medium: 1,
  low: 2,
  "not-established": 3,
} as const;

function dimensionStatus(
  family: FamilyReadiness,
  dimension: FamilyReadiness["dimensions"][number]["dimension"],
): string {
  return family.dimensions.find((entry) => entry.dimension === dimension)?.status
    ?? "not-established";
}

/**
 * Minimum bar for "recommended for discovery work" (not freeze/promotion).
 * Explicitly ignores exploratoryHistoricalReturnProxy.
 */
export function isEligibleForDiscoveryRecommendation(family: FamilyReadiness): boolean {
  if (
    family.independenceFromCalibrationFade === "low"
    || family.independenceFromCalibrationFade === "not-established"
  ) {
    return false;
  }
  if (!family.inventory.familyDefinitionAvailable) {
    return false;
  }
  const causal = dimensionStatus(family, "causalFeatureSemanticsEstablished");
  if (
    causal === "needs-definition"
    || causal === "not-established"
    || causal === "blocked"
  ) {
    return false;
  }
  const power = dimensionStatus(family, "powerFeasibility");
  if (power === "blocked") {
    return false;
  }
  if (family.maturity === "not-established") {
    return false;
  }
  return true;
}

function compareDiscoveryCandidates(left: FamilyReadiness, right: FamilyReadiness): number {
  // Preferred ordering from the milestone prompt — never historical return.
  const independence = INDEPENDENCE_RANK[left.independenceFromCalibrationFade]
    - INDEPENDENCE_RANK[right.independenceFromCalibrationFade];
  if (independence !== 0) {
    return independence;
  }

  const causalRank = (status: string): number => {
    if (status === "ready") return 0;
    if (status === "needs-work") return 1;
    return 2;
  };
  const causal =
    causalRank(dimensionStatus(left, "causalFeatureSemanticsEstablished"))
    - causalRank(dimensionStatus(right, "causalFeatureSemanticsEstablished"));
  if (causal !== 0) {
    return causal;
  }

  const def =
    Number(right.inventory.familyDefinitionAvailable)
    - Number(left.inventory.familyDefinitionAvailable);
  if (def !== 0) {
    return def;
  }

  const incidenceRank = (status: string): number => {
    if (status === "ready") return 0;
    if (status === "needs-work") return 1;
    if (status === "insufficient-evidence") return 2;
    return 3;
  };
  const incidence =
    incidenceRank(dimensionStatus(left, "prospectiveCandidateIncidence"))
    - incidenceRank(dimensionStatus(right, "prospectiveCandidateIncidence"));
  if (incidence !== 0) {
    return incidence;
  }

  const exec =
    incidenceRank(dimensionStatus(left, "executionObservability"))
    - incidenceRank(dimensionStatus(right, "executionObservability"));
  if (exec !== 0) {
    return exec;
  }

  const multi =
    incidenceRank(dimensionStatus(left, "multipleTestingBurden"))
    - incidenceRank(dimensionStatus(right, "multipleTestingBurden"));
  if (multi !== 0) {
    return multi;
  }

  const power =
    incidenceRank(dimensionStatus(left, "powerFeasibility"))
    - incidenceRank(dimensionStatus(right, "powerFeasibility"));
  if (power !== 0) {
    return power;
  }

  // Deterministic tie-break: familyId lexicographic (never filesystem order / return proxy).
  return left.familyId.localeCompare(right.familyId);
}

export function selectNextFamily(
  familyReadiness: readonly FamilyReadiness[],
): NextFamilySelection {
  // Sort a copy so callers' array order cannot affect ranking.
  const sortedInput = [...familyReadiness].sort((left, right) =>
    left.familyId.localeCompare(right.familyId)
  );
  const eligible = sortedInput.filter(isEligibleForDiscoveryRecommendation);

  if (eligible.length === 0) {
    return {
      recommendedFamily: null,
      selectionStatus: "no-family-ready",
      recommendationRationale: [
        "No evaluated family cleared the minimum discovery-recommendation bar "
          + "(independence, family definition, freezeable causal semantics, non-blocked power).",
        "Selection intentionally ignores exploratory historical return proxies.",
      ],
      rankedFamilyIds: sortedInput.map((family) => family.familyId),
    };
  }

  const ranked = [...eligible].sort(compareDiscoveryCandidates);
  const winner = ranked[0]!;
  const rationale = [
    `Selected ${winner.familyId} using ordered criteria: independence → causal freezeability `
      + "→ design data / family definition → incidence → execution → multiplicity → power.",
    `Independence from calibration-fade: ${winner.independenceFromCalibrationFade}.`,
    `Causal semantics: ${dimensionStatus(winner, "causalFeatureSemanticsEstablished")}.`,
    `Family definition available: ${String(winner.inventory.familyDefinitionAvailable)}.`,
    `Prospective incidence: ${dimensionStatus(winner, "prospectiveCandidateIncidence")}.`,
    `Multiple-testing burden: ${dimensionStatus(winner, "multipleTestingBurden")}.`,
    "Exploratory historical return proxies were not used for ranking.",
    "This recommendation is for next governed discovery work only — not freeze, promotion, or alpha.",
  ];

  return {
    recommendedFamily: winner.familyId,
    selectionStatus: "recommended-for-discovery",
    recommendationRationale: rationale,
    rankedFamilyIds: [
      ...ranked.map((family) => family.familyId),
      ...sortedInput
        .filter((family) => !eligible.some((entry) => entry.familyId === family.familyId))
        .map((family) => family.familyId),
    ],
  };
}
