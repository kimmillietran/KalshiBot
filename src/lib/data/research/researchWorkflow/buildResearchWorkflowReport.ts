import {
  compareWorkflowActions,
  deriveWorkflowStatus,
  determineHypothesisWorkflowAction,
  RESEARCH_WORKFLOW_ACTION_LABELS,
} from "./computeResearchWorkflowAction";
import type { LoadedResearchWorkflowInputs } from "./loadResearchWorkflowInputs";
import type {
  ResearchWorkflowFunnel,
  ResearchWorkflowHypothesisPipeline,
  ResearchWorkflowInputPaths,
  ResearchWorkflowQueueItem,
  ResearchWorkflowReport,
  ResearchWorkflowSummary,
} from "./researchWorkflowTypes";

function collectHypothesisIds(inputs: LoadedResearchWorkflowInputs): string[] {
  const ids = new Set<string>();

  for (const analysis of inputs.failureAnalysis?.analyses ?? []) {
    ids.add(analysis.hypothesisId);
  }

  for (const entry of inputs.derivedSensitivity?.entries ?? []) {
    ids.add(entry.hypothesisId);
  }

  for (const refinement of inputs.refinements?.refinements ?? []) {
    ids.add(refinement.parentHypothesisId);
  }

  for (const candidate of inputs.refinementCandidates?.candidates ?? []) {
    if (candidate.parentHypothesisId) {
      ids.add(candidate.parentHypothesisId);
    }
  }

  for (const trace of inputs.synthesisDebug?.traces ?? []) {
    ids.add(trace.hypothesisId);
  }

  for (const entry of inputs.monthRegime?.entries ?? []) {
    ids.add(entry.hypothesisId);
  }

  return [...ids].sort((left, right) => left.localeCompare(right));
}

function buildFunnel(inputs: LoadedResearchWorkflowInputs): ResearchWorkflowFunnel {
  const synthesisFunnel = inputs.synthesisDebug?.summary?.funnel;
  const failureSummary = inputs.failureAnalysis?.summary;

  const refinementCandidates =
    inputs.refinementCandidates?.candidates?.length
    ?? inputs.refinements?.summary?.totalRefinements
    ?? inputs.refinements?.refinements?.length
    ?? 0;

  const registeredRefinementChildren =
    inputs.refinementCandidates?.candidates?.filter(
      (candidate) => candidate.hypothesisId,
    ).length ?? 0;

  return {
    hypothesisCandidates: synthesisFunnel?.hypothesisCandidates ?? failureSummary?.totalHypotheses ?? 0,
    validatedHypotheses: failureSummary?.totalHypotheses ?? 0,
    nearPromisingHypotheses: failureSummary?.nearPromisingCount ?? 0,
    refinementCandidates,
    registeredRefinementChildren,
    synthesisCandidates: synthesisFunnel?.synthesisCandidates ?? 0,
    harnessEligible: synthesisFunnel?.harnessEligible ?? 0,
    harnessEvaluated:
      synthesisFunnel?.harnessEvaluated
      ?? inputs.harnessSummary?.evaluatedStrategies
      ?? inputs.harnessSummary?.results?.length
      ?? 0,
  };
}

function buildQueue(
  pipelines: readonly ResearchWorkflowHypothesisPipeline[],
): ResearchWorkflowQueueItem[] {
  const grouped = new Map<
    ResearchWorkflowHypothesisPipeline["recommendedNextAction"],
    string[]
  >();

  for (const pipeline of pipelines) {
    const existing = grouped.get(pipeline.recommendedNextAction) ?? [];
    existing.push(pipeline.hypothesisId);
    grouped.set(pipeline.recommendedNextAction, existing);
  }

  const items = [...grouped.entries()]
    .sort(([leftAction], [rightAction]) => compareWorkflowActions(leftAction, rightAction))
    .map(([action, hypothesisIds], index) => {
      const sortedIds = [...hypothesisIds].sort((left, right) => left.localeCompare(right));
      const label = RESEARCH_WORKFLOW_ACTION_LABELS[action];

      return {
        rank: index + 1,
        action,
        label,
        rationale: `${sortedIds.length} ${sortedIds.length === 1 ? "hypothesis" : "hypotheses"} queued for ${label.toLowerCase()}.`,
        hypothesisIds: sortedIds,
      };
    });

  return items;
}

function buildSummary(
  inputStatus: LoadedResearchWorkflowInputs["inputStatus"],
  pipelines: readonly ResearchWorkflowHypothesisPipeline[],
  queue: readonly ResearchWorkflowQueueItem[],
): ResearchWorkflowSummary {
  const statusValues = Object.values(inputStatus);
  const activeHypothesisCount = pipelines.filter(
    (pipeline) => pipeline.workflowStatus === "active",
  ).length;
  const blockedHypothesisCount = pipelines.filter(
    (pipeline) => pipeline.workflowStatus === "blocked",
  ).length;
  const deprioritizedHypothesisCount = pipelines.filter(
    (pipeline) => pipeline.workflowStatus === "deprioritized",
  ).length;

  const topQueueItem = queue[0] ?? null;

  return {
    totalHypotheses: pipelines.length,
    activeHypothesisCount,
    blockedHypothesisCount,
    deprioritizedHypothesisCount,
    artifactsAvailable: statusValues.filter(Boolean).length,
    artifactsTotal: statusValues.length,
    nextRecommendedMilestone: topQueueItem?.label ?? null,
    highestValueTask: topQueueItem?.rationale ?? null,
  };
}

function buildPipelines(
  inputs: LoadedResearchWorkflowInputs,
): ResearchWorkflowHypothesisPipeline[] {
  const hypothesisIds = collectHypothesisIds(inputs);

  const failureById = new Map(
    (inputs.failureAnalysis?.analyses ?? []).map((analysis) => [
      analysis.hypothesisId,
      analysis,
    ]),
  );
  const sensitivityById = new Map(
    (inputs.derivedSensitivity?.entries ?? []).map((entry) => [entry.hypothesisId, entry]),
  );
  const refinementsByParent = new Map<string, number>();
  for (const refinement of inputs.refinements?.refinements ?? []) {
    refinementsByParent.set(
      refinement.parentHypothesisId,
      (refinementsByParent.get(refinement.parentHypothesisId) ?? 0) + 1,
    );
  }
  const registeredChildrenByParent = new Map<string, number>();
  for (const candidate of inputs.refinementCandidates?.candidates ?? []) {
    if (candidate.parentHypothesisId && candidate.hypothesisId) {
      registeredChildrenByParent.set(
        candidate.parentHypothesisId,
        (registeredChildrenByParent.get(candidate.parentHypothesisId) ?? 0) + 1,
      );
    }
  }
  const synthesisById = new Map(
    (inputs.synthesisDebug?.traces ?? []).map((trace) => [trace.hypothesisId, trace]),
  );
  const monthRegimeById = new Map(
    (inputs.monthRegime?.entries ?? []).map((entry) => [entry.hypothesisId, entry]),
  );

  return hypothesisIds.map((hypothesisId) => {
    const failure = failureById.get(hypothesisId);
    const sensitivity = sensitivityById.get(hypothesisId);
    const synthesis = synthesisById.get(hypothesisId);
    const monthRegime = monthRegimeById.get(hypothesisId);
    const refinementsAvailable = refinementsByParent.get(hypothesisId) ?? 0;
    const registeredChildren = registeredChildrenByParent.get(hypothesisId) ?? 0;
    const failureCategories = failure?.failureReasons?.map((reason) => reason.category) ?? [];
    const synthesisRejectionReasons = synthesis?.rejectionReasons ?? [];
    const synthesisRejectionCategories = synthesis?.rejectionCategories ?? [];
    const robustnessScore =
      failure?.robustnessScore
      ?? synthesis?.robustnessScore
      ?? null;
    const validationPasses =
      failure?.passes
      ?? synthesis?.validationPasses
      ?? null;
    const harnessFilterExcluded = synthesisRejectionCategories.includes(
      "harness-filter-excluded",
    );

    const monthRegimeUnstable =
      monthRegime?.monthInstability
      ?? monthRegime?.unstable
      ?? null;

    const recommendedNextAction = determineHypothesisWorkflowAction({
      refinementsAvailable,
      registeredChildren,
      harnessEligible: synthesis?.harnessEligible ?? null,
      harnessEvaluated: synthesis?.harnessEvaluated ?? null,
      failureCategories,
      priorityCategory: failure?.priorityCategory ?? null,
      recommendedNextAction: failure?.recommendedNextAction ?? null,
      monthRegimeUnstable,
      robustnessScore,
      harnessFilterExcluded,
      synthesisRejectionReasons,
    });

    const workflowStatus = deriveWorkflowStatus(
      recommendedNextAction,
      failure?.priorityCategory ?? null,
    );

    const failureSummary =
      failure?.failureReasons?.[0]?.summary
      ?? synthesisRejectionReasons[0]
      ?? (failure || synthesis ? "No dominant failure reason recorded." : null);

    return {
      hypothesisId,
      hypothesis: failure?.hypothesis ?? hypothesisId,
      workflowStatus,
      priorityRank: failure?.priorityRank ?? 999,
      validation: {
        passes: validationPasses,
        robustnessScore,
        summary:
          validationPasses === null && robustnessScore === null
            ? null
            : `${validationPasses ? "Passing" : "Failing"} · robustness ${robustnessScore ?? "—"}`,
      },
      failure: {
        summary: failureSummary,
        categories: failureCategories.length > 0
          ? failureCategories
          : synthesisRejectionCategories,
        priorityCategory: failure?.priorityCategory ?? null,
        recommendedNextAction: failure?.recommendedNextAction ?? null,
      },
      derivedSensitivity: {
        recommendation: sensitivity?.recommendation ?? null,
        deltaRobustness: sensitivity?.deltaRobustness ?? null,
        summary: sensitivity
          ? `${sensitivity.recommendation} · Δ robustness ${sensitivity.deltaRobustness}`
          : null,
      },
      refinementsAvailable,
      registeredChildren,
      harness: {
        funnelStage: synthesis?.funnelStageReached ?? null,
        harnessEligible: synthesis?.harnessEligible ?? null,
        harnessEvaluated: synthesis?.harnessEvaluated ?? null,
        summary: synthesis
          ? `${synthesis.funnelStageReached} · eligible ${synthesis.harnessEligible ? "yes" : "no"} · evaluated ${synthesis.harnessEvaluated ? "yes" : "no"}`
          : null,
      },
      monthRegime: {
        unstable: monthRegimeUnstable,
        summary: monthRegime?.summary ?? monthRegime?.recommendation ?? null,
      },
      recommendedNextAction,
    };
  }).sort((left, right) => {
    if (left.priorityRank !== right.priorityRank) {
      return left.priorityRank - right.priorityRank;
    }

    return left.hypothesisId.localeCompare(right.hypothesisId);
  });
}

/** Builds the unified research workflow report from optional diagnostic artifacts. */
export function buildResearchWorkflowReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchWorkflowInputPaths;
  loadedInputs: LoadedResearchWorkflowInputs;
}): ResearchWorkflowReport {
  const pipelines = buildPipelines(input.loadedInputs);
  const queue = buildQueue(pipelines);
  const funnel = buildFunnel(input.loadedInputs);
  const summary = buildSummary(
    input.loadedInputs.inputStatus,
    pipelines,
    queue,
  );

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    inputStatus: input.loadedInputs.inputStatus,
    summary,
    funnel,
    queue,
    pipelines,
  };
}
