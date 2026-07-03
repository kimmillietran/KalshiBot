import type {
  BuildResearchCandidateRegistryInput,
  ParsedHarnessResultRecord,
  ParsedHypothesisValidationRecord,
  ParsedResearchCandidateRegistryInputs,
  ParsedSynthesizedStrategyRecord,
  ResearchCandidateHarnessMetrics,
  ResearchCandidatePromotionEvent,
  ResearchCandidateRegistryEntry,
  ResearchCandidateRegistryReport,
  ResearchCandidateRegistrySummary,
  ResearchCandidateStatus,
} from "./researchCandidateRegistryTypes";

type CandidateSeed = {
  candidateId: string;
  hypothesisId: string;
  strategyFamily: string;
  creationTimestamp: string;
  warnings: readonly string[];
};

function resolveCurrentStatus(input: {
  validation: ParsedHypothesisValidationRecord | undefined;
  synthesis: ParsedSynthesizedStrategyRecord | undefined;
  harnessMetrics: ResearchCandidateHarnessMetrics | null;
}): ResearchCandidateStatus {
  if (input.synthesis?.promotionStatus === "rejected") {
    return "rejected";
  }

  if (input.validation && !input.validation.passes) {
    return "rejected";
  }

  if (input.synthesis?.promotionStatus === "candidate") {
    return input.harnessMetrics && input.harnessMetrics.successfulRuns > 0
      ? "candidate"
      : "backtested";
  }

  if (input.harnessMetrics && input.harnessMetrics.successfulRuns > 0) {
    return "backtested";
  }

  if (input.synthesis) {
    return "synthesized";
  }

  if (input.validation?.passes) {
    return "validated";
  }

  return "hypothesis";
}

function buildRejectionReasons(input: {
  validation: ParsedHypothesisValidationRecord | undefined;
  synthesis: ParsedSynthesizedStrategyRecord | undefined;
  warnings: readonly string[];
}): string[] {
  const reasons = [...input.warnings];

  if (input.validation && !input.validation.passes) {
    reasons.push(...input.validation.reasons);
  }

  if (input.synthesis?.promotionStatus === "rejected") {
    reasons.push(...input.synthesis.riskNotes);
  }

  return [...new Set(reasons.map((reason) => reason.trim()).filter(Boolean))].sort();
}

function buildHarnessMetrics(
  hypothesisId: string,
  strategyId: string | null,
  harnessResults: readonly ParsedHarnessResultRecord[],
  completedAt: string | null,
): ResearchCandidateHarnessMetrics | null {
  const relevant = harnessResults.filter((result) => {
    if (result.hypothesisId !== hypothesisId) {
      return false;
    }

    if (strategyId) {
      return result.synthesizedStrategyId === strategyId;
    }

    return true;
  });

  if (relevant.length === 0) {
    return null;
  }

  return {
    evaluatedRuns: relevant.length,
    successfulRuns: relevant.filter((result) => result.status === "success").length,
    failedRuns: relevant.filter((result) => result.status === "failed").length,
    skippedRuns: relevant.filter((result) => result.status === "skipped").length,
    lastHarnessCompletedAt: completedAt,
  };
}

function collectCandidateSeeds(
  inputs: ParsedResearchCandidateRegistryInputs,
): CandidateSeed[] {
  const seeds = new Map<string, CandidateSeed>();

  for (const candidate of inputs.hypothesisCandidates?.candidates ?? []) {
    seeds.set(candidate.candidateId, {
      candidateId: candidate.candidateId,
      hypothesisId: candidate.candidateId,
      strategyFamily: candidate.suggestedStrategyFamily,
      creationTimestamp: inputs.hypothesisCandidates?.generatedAt ?? "",
      warnings: candidate.warnings,
    });
  }

  for (const strategy of inputs.strategySynthesis?.strategies ?? []) {
    const existing = seeds.get(strategy.hypothesisId);
    seeds.set(strategy.hypothesisId, {
      candidateId: strategy.hypothesisId,
      hypothesisId: strategy.hypothesisId,
      strategyFamily: existing?.strategyFamily ?? strategy.strategyFamily,
      creationTimestamp:
        existing?.creationTimestamp
        ?? inputs.strategySynthesis?.generatedAt
        ?? "",
      warnings: existing?.warnings ?? strategy.riskNotes,
    });
  }

  return [...seeds.values()].sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId),
  );
}

function buildFreshEntry(
  seed: CandidateSeed,
  inputs: ParsedResearchCandidateRegistryInputs,
): ResearchCandidateRegistryEntry {
  const validation = inputs.hypothesisValidation?.validations.find(
    (entry) => entry.hypothesisId === seed.hypothesisId,
  );
  const synthesis = inputs.strategySynthesis?.strategies.find(
    (entry) => entry.hypothesisId === seed.hypothesisId,
  );
  const harnessMetrics = buildHarnessMetrics(
    seed.hypothesisId,
    synthesis?.strategyId ?? null,
    inputs.harnessResults?.results ?? [],
    inputs.harnessResults?.completedAt ?? null,
  );

  const currentStatus = resolveCurrentStatus({ validation, synthesis, harnessMetrics });

  return {
    candidateId: seed.candidateId,
    hypothesisId: seed.hypothesisId,
    strategyId: synthesis?.strategyId ?? null,
    strategyFamily: synthesis?.strategyFamily ?? seed.strategyFamily,
    creationTimestamp: seed.creationTimestamp,
    validationScore:
      validation?.robustnessScore
      ?? synthesis?.validationSummary.robustnessScore
      ?? null,
    harnessMetrics,
    currentStatus,
    rejectionReasons: buildRejectionReasons({
      validation,
      synthesis,
      warnings: seed.warnings,
    }),
    promotionHistory: [],
  };
}

function appendPromotionEvent(
  history: readonly ResearchCandidatePromotionEvent[],
  event: ResearchCandidatePromotionEvent,
): ResearchCandidatePromotionEvent[] {
  const exists = history.some(
    (entry) =>
      entry.timestamp === event.timestamp
      && entry.nextStatus === event.nextStatus
      && entry.reason === event.reason,
  );

  if (exists) {
    return [...history];
  }

  return [...history, event].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );
}

function mergeRegistryEntry(
  fresh: ResearchCandidateRegistryEntry,
  existing: ResearchCandidateRegistryEntry | undefined,
  generatedAt: string,
): ResearchCandidateRegistryEntry {
  if (!existing) {
    return {
      ...fresh,
      creationTimestamp: fresh.creationTimestamp || generatedAt,
      promotionHistory:
        fresh.currentStatus === "hypothesis"
          ? []
          : [
              {
                timestamp: generatedAt,
                previousStatus: null,
                nextStatus: fresh.currentStatus,
                reason: `Initial registry status recorded as ${fresh.currentStatus}.`,
              },
            ],
    };
  }

  let promotionHistory = [...existing.promotionHistory];
  if (existing.currentStatus !== fresh.currentStatus) {
    promotionHistory = appendPromotionEvent(promotionHistory, {
      timestamp: generatedAt,
      previousStatus: existing.currentStatus,
      nextStatus: fresh.currentStatus,
      reason: `Status updated from ${existing.currentStatus} to ${fresh.currentStatus}.`,
    });
  }

  return {
    candidateId: existing.candidateId,
    hypothesisId: existing.hypothesisId,
    strategyId: fresh.strategyId ?? existing.strategyId,
    strategyFamily: fresh.strategyFamily || existing.strategyFamily,
    creationTimestamp: existing.creationTimestamp,
    validationScore: fresh.validationScore ?? existing.validationScore,
    harnessMetrics: fresh.harnessMetrics ?? existing.harnessMetrics,
    currentStatus: fresh.currentStatus,
    rejectionReasons:
      fresh.rejectionReasons.length > 0
        ? fresh.rejectionReasons
        : existing.rejectionReasons,
    promotionHistory,
  };
}

function summarizeCandidates(
  candidates: readonly ResearchCandidateRegistryEntry[],
): ResearchCandidateRegistrySummary {
  return {
    totalCandidates: candidates.length,
    hypothesisCount: candidates.filter((entry) => entry.currentStatus === "hypothesis").length,
    validatedCount: candidates.filter((entry) => entry.currentStatus === "validated").length,
    synthesizedCount: candidates.filter((entry) => entry.currentStatus === "synthesized").length,
    backtestedCount: candidates.filter((entry) => entry.currentStatus === "backtested").length,
    candidateCount: candidates.filter((entry) => entry.currentStatus === "candidate").length,
    rejectedCount: candidates.filter((entry) => entry.currentStatus === "rejected").length,
  };
}

/** Builds a deterministic, append/update candidate registry report. */
export function buildResearchCandidateRegistryReport(
  input: BuildResearchCandidateRegistryInput,
): ResearchCandidateRegistryReport {
  const existingById = new Map(
    (input.existingRegistry?.candidates ?? []).map((entry) => [entry.candidateId, entry]),
  );
  const freshById = new Map(
    collectCandidateSeeds(input.inputs).map((seed) => [
      seed.candidateId,
      buildFreshEntry(seed, input.inputs),
    ]),
  );

  const candidateIds = new Set([
    ...existingById.keys(),
    ...freshById.keys(),
  ]);

  const candidates = [...candidateIds]
    .sort((left, right) => left.localeCompare(right))
    .map((candidateId) => {
      const fresh = freshById.get(candidateId);
      const existing = existingById.get(candidateId);

      if (!fresh && !existing) {
        return null;
      }

      return mergeRegistryEntry(
        fresh ?? existing!,
        existing,
        input.generatedAt,
      );
    })
    .filter((entry): entry is ResearchCandidateRegistryEntry => entry !== null);

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    summary: summarizeCandidates(candidates),
    candidates,
  };
}

export function buildResearchCandidateRegistryReportFromInputs(
  generatedAt: string,
  outputPath: string,
  htmlOutputPath: string,
  inputPaths: BuildResearchCandidateRegistryInput["inputPaths"],
  inputs: ParsedResearchCandidateRegistryInputs,
  existingRegistry: ResearchCandidateRegistryReport | null,
): ResearchCandidateRegistryReport {
  return buildResearchCandidateRegistryReport({
    generatedAt,
    outputPath,
    htmlOutputPath,
    inputPaths,
    inputs,
    existingRegistry,
  });
}

export function serializeResearchCandidateRegistryReport(
  report: ResearchCandidateRegistryReport,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
