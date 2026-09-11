import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_FORWARD_QUOTES_CAPTURE_ROOT,
  MOMENTUM_RESEARCH_SPLIT_VERSION,
  PRIOR_LEAD_LAG_HOLDOUT_RUN_ID,
  PRIOR_LEAD_LAG_TRAIN_RUN_ID,
  PRIOR_LEAD_LAG_VALIDATION_RUN_ID,
  PRIOR_MICROSTRUCTURE_TRAIN_RUN_ID,
  MomentumEvidenceContractError,
  type MomentumContaminationClassification,
  type MomentumSplitRole,
} from "./momentumEvidenceContractTypes";

export type MomentumCaptureInventoryRow = {
  runId: string;
  captureRunDir: string;
  durationHours: number | null;
  captureHealthVerdict: string | null;
  topOfBookPresent: boolean;
  priorResearchRoles: readonly string[];
  contaminationClassification: MomentumContaminationClassification;
  eligibleRoles: readonly MomentumSplitRole[];
  rationale: string;
};

/**
 * Sealed prior-lineage classifications (metadata/lineage only).
 * Conservative: related short-horizon TOB price-response exposure contaminates
 * clean momentum VALIDATION/HOLDOUT reuse.
 */
export const SEALED_PRIOR_LINEAGE_CLASSIFICATIONS: ReadonlyArray<{
  runId: string;
  priorResearchRoles: readonly string[];
  contaminationClassification: MomentumContaminationClassification;
  eligibleRoles: readonly MomentumSplitRole[];
  rationale: string;
}> = [
  {
    runId: PRIOR_MICROSTRUCTURE_TRAIN_RUN_ID,
    priorResearchRoles: [
      "btc-kalshi-lead-lag TRAIN",
      "spread-liquidity-microstructure M13.0b TRAIN (tob-size-imbalance short-horizon response)",
    ],
    contaminationClassification: "outcome-consumed-related-tob-price-response",
    eligibleRoles: ["train"],
    rationale:
      "M13.0b TRAIN already scored short-horizon TOB executable responses on this capture. "
      + "May be used for schema/quality diagnostics or explicitly contaminated exploratory TRAIN "
      + "only. Cannot be pristine/untouched momentum VALIDATION or HOLDOUT.",
  },
  {
    runId: PRIOR_LEAD_LAG_VALIDATION_RUN_ID,
    priorResearchRoles: [
      "btc-kalshi-lead-lag VALIDATION",
      "microstructure designated VALIDATION capture role",
    ],
    contaminationClassification: "ineligible-validation",
    eligibleRoles: [],
    rationale:
      "Prior validation-role capture with short-horizon Kalshi response examination in lead-lag "
      + "lineage. Conservative: ineligible as clean momentum VALIDATION or untouched HOLDOUT.",
  },
  {
    runId: PRIOR_LEAD_LAG_HOLDOUT_RUN_ID,
    priorResearchRoles: [
      "btc-kalshi-lead-lag HOLDOUT (short-horizon Kalshi response outcomes examined)",
      "microstructure designated HOLDOUT capture role",
    ],
    contaminationClassification: "ineligible-holdout",
    eligibleRoles: [],
    rationale:
      "Lead-lag HOLDOUT already examined short-horizon Kalshi response outcomes. "
      + "Cannot be declared untouched momentum HOLDOUT.",
  },
];

export function buildMomentumDataIsolationPolicy(): {
  schemaOrFieldAvailabilityReuse: "permitted";
  m13TrainAsUntouchedMomentumValidation: "forbidden";
  m13TrainAsUntouchedMomentumHoldout: "forbidden";
  leadLagHoldoutAsUntouchedMomentumHoldout: "forbidden";
  leadLagValidationAsCleanMomentumValidation: "forbidden";
  m13TrainAsContaminatedExploratoryTrain: "allowed-if-no-cleaner-run-and-explicitly-declared";
  failConservativeWhenAmbiguous: true;
  historicalUntouchedHoldoutDistinctFromProspectiveConfirmation: true;
  antiShoppingNote: string;
} {
  return {
    schemaOrFieldAvailabilityReuse: "permitted",
    m13TrainAsUntouchedMomentumValidation: "forbidden",
    m13TrainAsUntouchedMomentumHoldout: "forbidden",
    leadLagHoldoutAsUntouchedMomentumHoldout: "forbidden",
    leadLagValidationAsCleanMomentumValidation: "forbidden",
    m13TrainAsContaminatedExploratoryTrain:
      "allowed-if-no-cleaner-run-and-explicitly-declared",
    failConservativeWhenAmbiguous: true,
    historicalUntouchedHoldoutDistinctFromProspectiveConfirmation: true,
    antiShoppingNote:
      "Do not mine prior family outcome tables to select momentum cells, signs, thresholds, "
      + "or horizons. Contaminated runs remain labeled; cleaner isolation requires fresh capture "
      + "when no untouched historical HOLDOUT exists.",
  };
}

function readCaptureHealthMeta(captureRunDir: string): {
  durationHours: number | null;
  captureHealthVerdict: string | null;
} {
  const healthPath = join(captureRunDir, "capture-health.json");
  if (!existsSync(healthPath)) {
    return { durationHours: null, captureHealthVerdict: null };
  }
  try {
    const raw = JSON.parse(readFileSync(healthPath, "utf8")) as Record<string, unknown>;
    const verdict = typeof raw.verdict === "string" ? raw.verdict : null;
    const config = raw.config;
    let durationHours: number | null = null;
    if (config && typeof config === "object" && !Array.isArray(config)) {
      const durationSeconds = (config as Record<string, unknown>).durationSeconds;
      if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds)) {
        durationHours = durationSeconds / 3600;
      }
    }
    return { durationHours, captureHealthVerdict: verdict };
  } catch {
    return { durationHours: null, captureHealthVerdict: null };
  }
}

/**
 * Metadata-only inventory. Reads capture-health / path presence only.
 * MUST NOT compute momentum returns, continuation, or P&L.
 */
export function buildMetadataOnlyMomentumCaptureInventory(input?: {
  captureRoot?: string;
  /** Test hook: skip filesystem scan. */
  sealedOnly?: boolean;
}): {
  inventoryMode: "metadata-only-no-outcome-computation";
  returnsComputed: false;
  continuationComputed: false;
  pnlComputed: false;
  rows: MomentumCaptureInventoryRow[];
  cleanTrainCandidates: readonly string[];
  cleanValidationCandidates: readonly string[];
  untouchedHoldoutCandidates: readonly string[];
  contaminatedExploratoryTrainCandidates: readonly string[];
  freshCaptureRequiredBeforeValidation: boolean;
  freshCaptureRequiredBeforeUntouchedHoldout: boolean;
} {
  const captureRoot = input?.captureRoot ?? DEFAULT_FORWARD_QUOTES_CAPTURE_ROOT;
  const sealedById = new Map(
    SEALED_PRIOR_LINEAGE_CLASSIFICATIONS.map((row) => [row.runId, row] as const),
  );

  const runIds = new Set<string>([...sealedById.keys()]);
  if (!input?.sealedOnly && existsSync(captureRoot)) {
    for (const entry of readdirSync(captureRoot)) {
      const full = join(captureRoot, entry);
      try {
        if (statSync(full).isDirectory()) {
          runIds.add(entry);
        }
      } catch {
        // ignore unreadable entries
      }
    }
  }

  const rows: MomentumCaptureInventoryRow[] = [...runIds].sort().map((runId) => {
    const captureRunDir = join(captureRoot, runId);
    const sealed = sealedById.get(runId);
    const meta = existsSync(captureRunDir)
      ? readCaptureHealthMeta(captureRunDir)
      : { durationHours: null, captureHealthVerdict: null };
    const topOfBookPresent = existsSync(join(captureRunDir, "top-of-book.jsonl"));

    if (sealed) {
      return {
        runId,
        captureRunDir,
        durationHours: meta.durationHours,
        captureHealthVerdict: meta.captureHealthVerdict,
        topOfBookPresent,
        priorResearchRoles: sealed.priorResearchRoles,
        contaminationClassification: sealed.contaminationClassification,
        eligibleRoles: sealed.eligibleRoles,
        rationale: sealed.rationale,
      };
    }

    // Unknown historical runs: fail conservative — field/schema inspection only until audited.
    return {
      runId,
      captureRunDir,
      durationHours: meta.durationHours,
      captureHealthVerdict: meta.captureHealthVerdict,
      topOfBookPresent,
      priorResearchRoles: [],
      contaminationClassification: topOfBookPresent
        ? "field-only-inspected"
        : "not-established",
      eligibleRoles: [] as MomentumSplitRole[],
      rationale:
        "No sealed prior-lineage clearance for short-horizon price-response isolation. "
        + "Conservative: not eligible for clean momentum VALIDATION/HOLDOUT without an "
        + "explicit untouched audit (metadata-only inventory does not compute returns).",
    };
  });

  const cleanTrainCandidates = rows
    .filter((row) =>
      row.contaminationClassification === "untouched-for-short-horizon-price-response"
      && row.eligibleRoles.includes("train")
    )
    .map((row) => row.runId);
  const cleanValidationCandidates = rows
    .filter((row) =>
      row.contaminationClassification === "untouched-for-short-horizon-price-response"
      && row.eligibleRoles.includes("validation")
    )
    .map((row) => row.runId);
  const untouchedHoldoutCandidates = rows
    .filter((row) =>
      row.contaminationClassification === "untouched-for-short-horizon-price-response"
      && row.eligibleRoles.includes("holdout")
    )
    .map((row) => row.runId);
  const contaminatedExploratoryTrainCandidates = rows
    .filter((row) =>
      row.runId === PRIOR_LEAD_LAG_TRAIN_RUN_ID
      || row.contaminationClassification === "outcome-consumed-related-tob-price-response"
      || row.contaminationClassification === "contaminated-train-only"
    )
    .map((row) => row.runId);

  return {
    inventoryMode: "metadata-only-no-outcome-computation",
    returnsComputed: false,
    continuationComputed: false,
    pnlComputed: false,
    rows,
    cleanTrainCandidates,
    cleanValidationCandidates,
    untouchedHoldoutCandidates,
    contaminatedExploratoryTrainCandidates,
    freshCaptureRequiredBeforeValidation: cleanValidationCandidates.length === 0,
    freshCaptureRequiredBeforeUntouchedHoldout: untouchedHoldoutCandidates.length === 0,
  };
}

export function buildMomentumSplitRequirements(): {
  splitVersion: typeof MOMENTUM_RESEARCH_SPLIT_VERSION;
  confirmatoryReuseForbidden: true;
  requiresFamilyDefinitionIdentity: true;
  requiresEvidenceContractIdentity: true;
  failClosedIfCleanValidationUnavailable: "fresh-capture-required-before-validation";
  failClosedIfUntouchedHoldoutUnavailable: "fresh-capture-required-before-holdout";
  historicalUntouchedHoldoutNotProspectiveConfirmation: true;
  binds: readonly string[];
} {
  return {
    splitVersion: MOMENTUM_RESEARCH_SPLIT_VERSION,
    confirmatoryReuseForbidden: true,
    requiresFamilyDefinitionIdentity: true,
    requiresEvidenceContractIdentity: true,
    failClosedIfCleanValidationUnavailable: "fresh-capture-required-before-validation",
    failClosedIfUntouchedHoldoutUnavailable: "fresh-capture-required-before-holdout",
    historicalUntouchedHoldoutNotProspectiveConfirmation: true,
    binds: [
      "family-definition identity",
      "evidence-contract identity",
      "TRAIN/VALIDATION/HOLDOUT run ids",
      "contamination classifications",
      "role rationale",
      "capture identities/content hashes",
      "confirmatoryReuseForbidden=true",
      "creation/version identity",
    ],
  };
}

export type MomentumSplitSealInput = {
  familyDefinitionIdentity: string;
  evidenceContractIdentity: string;
  trainRunId: string;
  validationRunId: string;
  holdoutRunId: string;
  inventory: ReturnType<typeof buildMetadataOnlyMomentumCaptureInventory>;
};

/**
 * Seal a momentum research split only when roles are isolation-eligible.
 * Fails closed rather than fabricating contaminated VALIDATION/HOLDOUT.
 */
export function trySealMomentumResearchSplit(input: MomentumSplitSealInput): {
  sealed: true;
  splitVersion: typeof MOMENTUM_RESEARCH_SPLIT_VERSION;
  confirmatoryReuseForbidden: true;
  familyDefinitionIdentity: string;
  evidenceContractIdentity: string;
  trainRunId: string;
  validationRunId: string;
  holdoutRunId: string;
} | {
  sealed: false;
  status: "fresh-capture-required-before-validation" | "fresh-capture-required-before-holdout" | "invalid-role-assignment";
  reasons: readonly string[];
} {
  if (!input.familyDefinitionIdentity || !input.evidenceContractIdentity) {
    throw new MomentumEvidenceContractError(
      "Split sealing requires familyDefinitionIdentity and evidenceContractIdentity.",
    );
  }

  const byId = new Map(input.inventory.rows.map((row) => [row.runId, row] as const));
  const train = byId.get(input.trainRunId);
  const validation = byId.get(input.validationRunId);
  const holdout = byId.get(input.holdoutRunId);
  const reasons: string[] = [];

  if (!train || !train.eligibleRoles.includes("train")) {
    reasons.push(`TRAIN run ${input.trainRunId} is not eligible under contamination policy.`);
  }
  if (!validation || !validation.eligibleRoles.includes("validation")) {
    reasons.push(
      `VALIDATION run ${input.validationRunId} is not clean/eligible `
        + `(fresh-capture-required-before-validation).`,
    );
  }
  if (!holdout || !holdout.eligibleRoles.includes("holdout")) {
    reasons.push(
      `HOLDOUT run ${input.holdoutRunId} is not untouched/eligible `
        + `(fresh-capture-required-before-holdout).`,
    );
  }

  // Explicit forbidden mappings.
  if (input.validationRunId === PRIOR_MICROSTRUCTURE_TRAIN_RUN_ID) {
    reasons.push("Prior M13 TRAIN cannot be pristine momentum VALIDATION.");
  }
  if (input.holdoutRunId === PRIOR_MICROSTRUCTURE_TRAIN_RUN_ID) {
    reasons.push("Prior M13 TRAIN cannot be momentum HOLDOUT.");
  }
  if (input.holdoutRunId === PRIOR_LEAD_LAG_HOLDOUT_RUN_ID) {
    reasons.push("Prior lead-lag HOLDOUT cannot be declared untouched momentum HOLDOUT.");
  }

  if (reasons.length > 0) {
    const status = reasons.some((r) => r.includes("VALIDATION"))
      ? "fresh-capture-required-before-validation"
      : reasons.some((r) => r.includes("HOLDOUT") || r.includes("holdout"))
      ? "fresh-capture-required-before-holdout"
      : "invalid-role-assignment";
    return { sealed: false, status, reasons };
  }

  return {
    sealed: true,
    splitVersion: MOMENTUM_RESEARCH_SPLIT_VERSION,
    confirmatoryReuseForbidden: true,
    familyDefinitionIdentity: input.familyDefinitionIdentity,
    evidenceContractIdentity: input.evidenceContractIdentity,
    trainRunId: input.trainRunId,
    validationRunId: input.validationRunId,
    holdoutRunId: input.holdoutRunId,
  };
}

/** Test helper: assert inventory never claims outcome computation. */
export function assertInventoryDidNotComputeOutcomes(
  inventory: ReturnType<typeof buildMetadataOnlyMomentumCaptureInventory>,
): void {
  if (
    inventory.returnsComputed
    || inventory.continuationComputed
    || inventory.pnlComputed
  ) {
    throw new MomentumEvidenceContractError(
      "Metadata-only inventory must not compute returns/continuation/P&L.",
    );
  }
}
