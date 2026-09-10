import type {
  FamilyReadiness,
  RecommendedNextAction,
  ResearchFamilyId,
  SelectionStatus,
} from "./nextFamilyReadinessTypes";

export type NextFamilySelection = {
  recommendedFamily: ResearchFamilyId | null;
  selectionStatus: SelectionStatus;
  recommendedNextAction: RecommendedNextAction;
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
 * Empirically-investigated families are excluded — discovery already occurred.
 */
export function isEligibleForDiscoveryRecommendation(family: FamilyReadiness): boolean {
  if (family.maturity === "empirically-investigated") {
    return false;
  }
  // Spent TOB-imbalance-v1 TRAIN shortlist: no candidate may advance; do not re-recommend discovery.
  if (family.inventory.tobImbalanceV1StoppedAfterTrain === true) {
    return false;
  }
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

/** Families that are the strongest next *definition* targets (not yet discovery-ready). */
export function isEligibleForDefinitionPreparation(family: FamilyReadiness): boolean {
  if (family.maturity === "empirically-investigated") {
    return false;
  }
  if (
    family.independenceFromCalibrationFade === "low"
    || family.independenceFromCalibrationFade === "not-established"
  ) {
    return false;
  }
  if (family.maturity === "not-established") {
    return false;
  }
  // Prefer partial families with TOB/data support but missing sealed definition.
  if (family.inventory.familyDefinitionAvailable) {
    return false;
  }
  const causal = dimensionStatus(family, "causalFeatureSemanticsEstablished");
  return causal === "needs-definition" || causal === "needs-work";
}

/**
 * Broad microstructure may host a *new* independent subfamily after v1 TRAIN stop.
 * Must not mine PR #80 outcomes; requires fresh outcome isolation.
 */
export function isEligibleForNewIndependentSubfamilyPreparation(
  family: FamilyReadiness,
): boolean {
  if (family.familyId !== "spread-liquidity-microstructure") {
    return false;
  }
  if (family.inventory.tobImbalanceV1StoppedAfterTrain !== true) {
    return false;
  }
  if (family.inventory.broadFamilyNotExhausted !== true) {
    return false;
  }
  if (
    family.independenceFromCalibrationFade === "low"
    || family.independenceFromCalibrationFade === "not-established"
  ) {
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

function compareDefinitionCandidates(left: FamilyReadiness, right: FamilyReadiness): number {
  const independence = INDEPENDENCE_RANK[left.independenceFromCalibrationFade]
    - INDEPENDENCE_RANK[right.independenceFromCalibrationFade];
  if (independence !== 0) {
    return independence;
  }
  const maturityRank = (maturity: FamilyReadiness["maturity"]): number => {
    if (maturity === "partial") return 0;
    if (maturity === "needs-definition") return 1;
    return 2;
  };
  const maturity = maturityRank(left.maturity) - maturityRank(right.maturity);
  if (maturity !== 0) {
    return maturity;
  }
  const supportCount = (family: FamilyReadiness): number =>
    (family.inventory.microstructureDataSupport ?? []).filter(
      (row) => row.status === "available" || row.status === "partial" || row.status === "derivable-not-frozen",
    ).length;
  const support = supportCount(right) - supportCount(left);
  if (support !== 0) {
    return support;
  }
  return left.familyId.localeCompare(right.familyId);
}

export function selectNextFamily(
  familyReadiness: readonly FamilyReadiness[],
  options?: { leadLagDeferred?: boolean },
): NextFamilySelection {
  // Sort a copy so callers' array order cannot affect ranking.
  const sortedInput = [...familyReadiness].sort((left, right) =>
    left.familyId.localeCompare(right.familyId)
  );
  const eligible = sortedInput.filter(isEligibleForDiscoveryRecommendation);

  if (eligible.length > 0) {
    const ranked = [...eligible].sort(compareDiscoveryCandidates);
    const winner = ranked[0]!;
    return {
      recommendedFamily: winner.familyId,
      selectionStatus: "recommended-for-discovery",
      recommendedNextAction: "start-new-family-discovery",
      recommendationRationale: [
        `Selected ${winner.familyId} using ordered criteria: independence → causal freezeability `
          + "→ design data / family definition → incidence → execution → multiplicity → power.",
        `Independence from calibration-fade: ${winner.independenceFromCalibrationFade}.`,
        `Causal semantics: ${dimensionStatus(winner, "causalFeatureSemanticsEstablished")}.`,
        `Family definition available: ${String(winner.inventory.familyDefinitionAvailable)}.`,
        `Prospective incidence: ${dimensionStatus(winner, "prospectiveCandidateIncidence")}.`,
        `Multiple-testing burden: ${dimensionStatus(winner, "multipleTestingBurden")}.`,
        "Exploratory historical return proxies were not used for ranking.",
        "This recommendation is for next governed discovery work only — not freeze, promotion, or alpha.",
      ],
      rankedFamilyIds: [
        ...ranked.map((family) => family.familyId),
        ...sortedInput
          .filter((family) => !eligible.some((entry) => entry.familyId === family.familyId))
          .map((family) => family.familyId),
      ],
    };
  }

  const definitionEligible = sortedInput.filter(isEligibleForDefinitionPreparation);
  if (definitionEligible.length > 0) {
    const ranked = [...definitionEligible].sort(compareDefinitionCandidates);
    const winner = ranked[0]!;
    const tobStopped = sortedInput.some(
      (family) => family.inventory.tobImbalanceV1StoppedAfterTrain === true,
    );
    return {
      recommendedFamily: winner.familyId,
      selectionStatus: "prepare-family-definition",
      recommendedNextAction: "prepare-family-definition",
      recommendationRationale: [
        `No family cleared the discovery-recommendation bar; strongest next independent direction is `
          + `${winner.familyId} for governed family-definition preparation.`,
        "Ranking uses independence → maturity/data-support → deterministic familyId; never historical return "
          + "and never PR #80 TOB-imbalance effect magnitudes or sign shopping.",
        `Independence: ${winner.independenceFromCalibrationFade}; maturity=${winner.maturity}.`,
        options?.leadLagDeferred
          ? "Completed lead-lag investigation is deferred (underpowered + costly prospective replication), "
            + "so it is not recommended-for-discovery."
          : "Lead-lag lineage disposition was not bound in this run.",
        tobStopped
          ? "TOB-imbalance-v1 TRAIN stopped with zero eligible candidates; reverse-direction resurrection "
            + "from that TRAIN table is forbidden. Broad microstructure may later host a new independent "
            + "subfamily only under fresh outcome isolation — not selected here over a cleaner definition target."
          : "TOB-imbalance TRAIN disposition was not bound in this run.",
        "This does not force a family to win discovery; it only recommends definition preparation.",
        "No capture, freeze, promotion, or live trading is authorized by this selection.",
      ],
      rankedFamilyIds: [
        ...ranked.map((family) => family.familyId),
        ...sortedInput
          .filter((family) => !definitionEligible.some((entry) => entry.familyId === family.familyId))
          .map((family) => family.familyId),
      ],
    };
  }

  const subfamilyEligible = sortedInput.filter(isEligibleForNewIndependentSubfamilyPreparation);
  if (subfamilyEligible.length > 0) {
    const winner = subfamilyEligible.sort((left, right) =>
      left.familyId.localeCompare(right.familyId)
    )[0]!;
    return {
      recommendedFamily: winner.familyId,
      selectionStatus: "prepare-new-independent-subfamily-definition",
      recommendedNextAction: "prepare-new-independent-subfamily-definition",
      recommendationRationale: [
        "No sealed family is ready for discovery or first-time family-definition preparation.",
        `${winner.familyId} remains broad-family-not-exhausted after tob-imbalance-v1 TRAIN stop.`,
        "Next step is prepare-new-independent-subfamily-definition with requiresFreshOutcomeIsolation=true.",
        "Do not mine PR #80 outcomes to choose reverse imbalance, neighboring thresholds, or horizons.",
        "Historical return proxies were not used.",
      ],
      rankedFamilyIds: sortedInput.map((family) => family.familyId),
    };
  }

  if (options?.leadLagDeferred) {
    return {
      recommendedFamily: "btc-kalshi-lead-lag",
      selectionStatus: "defer-and-collect-prospective-lead-lag",
      recommendedNextAction: "defer-and-collect-prospective-lead-lag",
      recommendationRationale: [
        "No other family is ready for discovery or definition preparation.",
        "Lead-lag remains deferred-for-prospective-replication (available-but-not-authorized).",
        "Historical return proxies were not used.",
      ],
      rankedFamilyIds: sortedInput.map((family) => family.familyId),
    };
  }

  return {
    recommendedFamily: null,
    selectionStatus: "no-family-ready",
    recommendedNextAction: "no-action-ready",
    recommendationRationale: [
      "No evaluated family cleared the minimum discovery-recommendation bar "
        + "(independence, family definition, freezeable causal semantics, non-blocked power).",
      "No family cleared the definition-preparation or new-independent-subfamily bars either.",
      "Selection intentionally ignores exploratory historical return proxies.",
    ],
    rankedFamilyIds: sortedInput.map((family) => family.familyId),
  };
}
