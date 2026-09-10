import type {
  CandidateIncidenceAssessment,
  DimensionAssessment,
  FamilyInventory,
  FamilyReadiness,
  ReadinessStatus,
  ResearchFamilyId,
} from "./nextFamilyReadinessTypes";

const STATUS_RANK: Record<ReadinessStatus, number> = {
  ready: 0,
  "needs-work": 1,
  "needs-definition": 2,
  "insufficient-evidence": 3,
  "not-established": 4,
  blocked: 5,
};

export function worstStatus(statuses: readonly ReadinessStatus[]): ReadinessStatus {
  return [...statuses].sort((left, right) => STATUS_RANK[right] - STATUS_RANK[left])[0]
    ?? "not-established";
}

function emptyIncidence(
  status: ReadinessStatus,
  source: string,
  note: string,
  extras?: Partial<CandidateIncidenceAssessment>,
): CandidateIncidenceAssessment {
  return {
    status,
    source,
    exploratoryOnly: true,
    confirmatoryReuseForbidden: true,
    captureHoursObserved: extras?.captureHoursObserved ?? null,
    fadeIndependentMarketsPerEightHours: extras?.fadeIndependentMarketsPerEightHours ?? null,
    estimatedEligibleObservationsPerCaptureHour:
      extras?.estimatedEligibleObservationsPerCaptureHour ?? null,
    estimatedIndependentMarketsPerDay: extras?.estimatedIndependentMarketsPerDay ?? null,
    expectedCaptureHoursForPlausiblePower: extras?.expectedCaptureHoursForPlausiblePower ?? null,
    powerAssumptions: extras?.powerAssumptions ?? null,
    note,
  };
}

export function buildCandidateIncidenceAssessment(input: {
  familyId: ResearchFamilyId;
  fadeIndependentMarketsPerEightHours: number | null;
  exploratoryCaptureHours: number | null;
  estimatedEligibleObservationsPerCaptureHour?: number | null;
}): CandidateIncidenceAssessment {
  const fade = input.fadeIndependentMarketsPerEightHours;
  const obsPerHour = input.estimatedEligibleObservationsPerCaptureHour ?? null;

  if (input.familyId === "btc-kalshi-lead-lag") {
    const tinyIncidence =
      obsPerHour !== null && Number.isFinite(obsPerHour) && obsPerHour < 0.25;
    return emptyIncidence(
      tinyIncidence
        ? "blocked"
        : input.exploratoryCaptureHours !== null && input.exploratoryCaptureHours > 0
          ? "needs-work"
          : "insufficient-evidence",
      "code-inventory-plus-optional-exploratory-capture-health",
      "Lead-lag trigger incidence was not recomputed from multi-GB top-of-book in this audit. "
        + "Calibration-fade v2 yielded a low independent-market rate on sealed confirmatory runs — "
        + "a cautionary operational baseline. Prospective lead-lag powering requires explicit trigger "
        + "incidence measurement on exploratory design data (not confirmatory reuse)."
        + (tinyIncidence
          ? " Provided exploratory incidence estimate is too low for operational powering."
          : ""),
      {
        captureHoursObserved: input.exploratoryCaptureHours,
        fadeIndependentMarketsPerEightHours: fade,
        estimatedEligibleObservationsPerCaptureHour: obsPerHour,
        estimatedIndependentMarketsPerDay: null,
        expectedCaptureHoursForPlausiblePower:
          obsPerHour !== null && obsPerHour > 0
            ? Math.ceil(50 / obsPerHour)
            : fade !== null && fade > 0
              ? Math.ceil((50 / fade) * 8)
              : null,
        powerAssumptions:
          "Illustrative only: assumes ~50 independent market-level observations for a minimal "
          + "prospective design. Real N must come from an explicit power model before freeze.",
      },
    );
  }

  if (input.familyId === "spread-liquidity-microstructure") {
    return emptyIncidence(
      "needs-definition",
      "top-of-book-field-presence-only",
      "TOB fields are densely captured; a microstructure entry rule is undefined, so candidate "
        + "incidence cannot be estimated without fabricating a signal.",
      {
        captureHoursObserved: input.exploratoryCaptureHours,
        fadeIndependentMarketsPerEightHours: fade,
        estimatedEligibleObservationsPerCaptureHour: obsPerHour,
      },
    );
  }

  return emptyIncidence(
    "needs-definition",
    "atlas-dimension-only",
    "Momentum exists as atlas buckets, not a governed family incidence model. "
      + "Do not treat atlas hit rates as prospective candidate incidence.",
    {
      captureHoursObserved: input.exploratoryCaptureHours,
      fadeIndependentMarketsPerEightHours: fade,
      estimatedEligibleObservationsPerCaptureHour: obsPerHour,
    },
  );
}

export function scoreFamilyReadiness(input: {
  inventory: FamilyInventory;
  incidence: CandidateIncidenceAssessment;
  exploratoryFieldCoverage: readonly string[];
  exploratoryHistoricalReturnProxy?: number | null;
}): FamilyReadiness {
  const { inventory, incidence } = input;
  const dims: DimensionAssessment[] = [];

  dims.push({
    dimension: "familyDefinitionAvailable",
    status: inventory.familyDefinitionAvailable ? "ready" : "needs-definition",
    rationale: inventory.familyDefinitionAvailable
      ? "Family analysis module/CLI exists."
      : "No governed family definition/report module; mark needs-definition rather than fabricating one.",
  });

  const causalStatus: ReadinessStatus =
    inventory.familyId === "btc-kalshi-lead-lag"
      ? "ready"
      : inventory.familyId === "momentum"
        ? "needs-work"
        : "needs-definition";
  dims.push({
    dimension: "causalFeatureSemanticsEstablished",
    status: causalStatus,
    rationale: inventory.causalSemanticsNotes.join(" "),
  });

  const historicalCoverageStatus: ReadinessStatus =
    inventory.maturity === "empirically-investigated"
      ? "insufficient-evidence"
      : inventory.maturity === "mature"
        ? "needs-work"
        : inventory.maturity === "partial"
          ? "insufficient-evidence"
          : "not-established";
  dims.push({
    dimension: "historicalDataCoverage",
    status: historicalCoverageStatus,
    rationale:
      inventory.maturity === "empirically-investigated"
        ? "Lead-lag historical lineage completed: holdout underpowered (ESS below required evidence). "
          + "Historical runs are spent design/outcome-inspected data and cannot count as fresh confirmatory N."
        : "Historical coverage for a next-family design exists primarily as exploratory capture/atlas artifacts; "
          + "not sealed confirmatory evidence for this family.",
  });

  dims.push({
    dimension: "independentSampleAvailability",
    status:
      inventory.maturity === "empirically-investigated"
        ? "insufficient-evidence"
        : inventory.familyId === "btc-kalshi-lead-lag"
          ? "needs-work"
          : "insufficient-evidence",
    rationale:
      inventory.maturity === "empirically-investigated"
        ? "Independent historical sample for the locked candidate is exhausted for confirmatory reuse; "
          + "fresh prospective ESS would be required under the bound readiness contract."
        : "Independent market/day sample design is not yet frozen for a prospective contract.",
  });

  dims.push({
    dimension: "prospectiveCandidateIncidence",
    status: incidence.status,
    rationale: incidence.note,
  });

  const hasExecutableFields = input.exploratoryFieldCoverage.some((field) =>
    [
      "bestBid",
      "bestAsk",
      "bidSize",
      "askSize",
      "spread",
      "executableBuyYesCents",
      "topOfBook",
      "btcSpot",
    ].includes(field),
  );
  dims.push({
    dimension: "executionObservability",
    status:
      inventory.familyId === "btc-kalshi-lead-lag" || hasExecutableFields
        ? "needs-work"
        : inventory.maturity === "not-established"
          ? "not-established"
          : "insufficient-evidence",
    rationale: inventory.executableInputNotes.join(" "),
  });

  dims.push({
    dimension: "settlementDependency",
    status: inventory.familyId === "btc-kalshi-lead-lag" ? "needs-work" : "not-established",
    rationale:
      inventory.familyId === "btc-kalshi-lead-lag"
        ? "Characterization can proceed without settlements; an eventual economic claim would need settlement join."
        : "Settlement dependency for an undefined family is not established.",
  });

  dims.push({
    dimension: "multipleTestingBurden",
    status: inventory.multiplicity.status,
    rationale: inventory.multiplicity.note,
  });

  dims.push({
    dimension: "trueOosFeasibility",
    status: "needs-work",
    rationale:
      "Post-#66 / future M12.7c pipeline expects discovery → validation → clean holdout → promotion. "
      + "No family currently has a frozen OOS split for the next cycle.",
  });

  const tinyObs =
    incidence.estimatedEligibleObservationsPerCaptureHour !== null
    && incidence.estimatedEligibleObservationsPerCaptureHour < 0.25;
  const powerStatus: ReadinessStatus =
    inventory.maturity === "empirically-investigated"
      ? "insufficient-evidence"
      : tinyObs
        ? "blocked"
        : incidence.status === "needs-definition"
          ? "needs-definition"
          : incidence.status === "insufficient-evidence"
            ? "insufficient-evidence"
            : "needs-work";
  dims.push({
    dimension: "powerFeasibility",
    status: powerStatus,
    rationale:
      inventory.maturity === "empirically-investigated"
        ? "Prospective power model remains bound (required fresh ESS from readiness artifact), but collection "
          + "is operationally costly and unauthorized without capture-budget approval. "
          + "Do not retune MDE/alpha/power to reduce N."
        : incidence.powerAssumptions
          ?? "Power feasibility not established without incidence + explicit power assumptions.",
  });

  dims.push({
    dimension: "captureFeasibility",
    status:
      input.exploratoryFieldCoverage.length > 0
        ? "ready"
        : inventory.maturity === "mature"
          ? "needs-work"
          : "insufficient-evidence",
    rationale:
      input.exploratoryFieldCoverage.length > 0
        ? `Exploratory captures expose fields: ${input.exploratoryFieldCoverage.join(", ")}.`
        : "No exploratory capture identities supplied; capture feasibility inferred from code only.",
  });

  dims.push({
    dimension: "dataIntegrityDependencies",
    status: inventory.volatilityContiguityDependency,
    rationale: inventory.volatilityContiguityNote,
  });

  dims.push({
    dimension: "existingArtifactProvenance",
    status:
      inventory.maturity === "empirically-investigated"
        ? "ready"
        : inventory.maturity === "mature"
          ? "needs-work"
          : "not-established",
    rationale:
      inventory.maturity === "empirically-investigated"
        ? "Identity-addressed discovery/validation/holdout/readiness artifacts are bound; "
          + "historical underpowered verdict is preserved without relabeling."
        : "Existing family outputs (if any) are exploratory/diagnostic unless sealed under a future governed contract.",
  });

  dims.push({
    dimension: "implementationMaturity",
    status:
      inventory.maturity === "empirically-investigated"
        ? "ready"
        : inventory.maturity === "mature"
          ? "ready"
          : inventory.maturity === "partial"
            ? "needs-work"
            : inventory.maturity === "needs-definition"
              ? "needs-definition"
              : "not-established",
    rationale: `Inventory maturity=${inventory.maturity}.`,
  });

  const blockingRequirements: string[] = [];
  if (inventory.maturity === "empirically-investigated") {
    blockingRequirements.push(
      "Do not promote or freeze the locked lead-lag candidate; historical holdout remains underpowered.",
    );
    blockingRequirements.push(
      "Do not reopen other validation survivors against historical holdout (candidate shopping forbidden).",
    );
    blockingRequirements.push(
      "Prospective lead-lag replication remains available-but-not-authorized until capture-budget approval + M12.8e freeze.",
    );
  }
  if (!inventory.familyDefinitionAvailable) {
    blockingRequirements.push(
      "Define a governed family analysis contract/module before discovery freeze.",
    );
  }
  if (
    inventory.multiplicity.status === "needs-work"
    || inventory.multiplicity.status === "blocked"
  ) {
    blockingRequirements.push(
      "Freeze a small pre-registered parameter set; do not promote the best lag/horizon from full exploratory search.",
    );
  }
  if (
    inventory.volatilityContiguityDependency === "blocked"
    || inventory.volatilityContiguityDependency === "needs-work"
  ) {
    if (inventory.familyId === "momentum" || inventory.familyId === "btc-kalshi-lead-lag") {
      blockingRequirements.push(
        "If the frozen rule uses completed-candle returns/volatility, opt into requireContiguousWindow / expectedBarIntervalMs.",
      );
    }
  }
  if (tinyObs) {
    blockingRequirements.push(
      "Candidate incidence is too low for operationally feasible powered evidence; redesign eligibility or accept no-family-ready.",
    );
  }
  if (causalStatus === "needs-definition") {
    blockingRequirements.push(
      "Causal feature semantics are not established; freezeability is blocked until semantics exist.",
    );
  }
  if (
    dims.find((d) => d.dimension === "executionObservability")?.status
      === "not-established"
    || dims.find((d) => d.dimension === "executionObservability")?.status
      === "insufficient-evidence"
  ) {
    blockingRequirements.push(
      "Executable quote/size inputs are missing or insufficient for realistic entry observation.",
    );
  }
  blockingRequirements.push(
    "Route through discovery → validation → accepted promotion (#66) before any new freeze.",
  );
  blockingRequirements.push(
    "Declare stopping rule beyond a minimum floor before confirmatory collection.",
  );

  return {
    familyId: inventory.familyId,
    displayName: inventory.displayName,
    overallStatus: worstStatus(dims.map((dimension) => dimension.status)),
    maturity: inventory.maturity,
    independenceFromCalibrationFade: inventory.independenceFromCalibrationFade,
    dimensions: dims,
    multiplicity: inventory.multiplicity,
    candidateIncidence: incidence,
    blockingRequirements,
    inventory,
    exploratoryHistoricalReturnProxy: input.exploratoryHistoricalReturnProxy ?? null,
  };
}
