import type { LoadedResearchDiagnosticsInputs } from "./loadResearchDiagnosticsInputs";
import type {
  ResearchDiagnosticArtifactCard,
  ResearchDiagnosticsInputPaths,
  ResearchDiagnosticsSection,
} from "./researchDiagnosticsTypes";

function formatMetric(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  return String(value);
}

function buildFailureAnalysisCard(
  jsonPath: string,
  htmlPath: string,
  document: LoadedResearchDiagnosticsInputs["hypothesisFailureAnalysis"],
): ResearchDiagnosticArtifactCard {
  const present = document !== null;

  return {
    artifactId: "hypothesis-failure-analysis",
    label: "Hypothesis failure analysis",
    jsonPath,
    htmlPath,
    present,
    generatedAt: document?.generatedAt ?? null,
    metrics: present
      ? [
          {
            label: "Near-promising",
            value: formatMetric(document?.summary?.nearPromisingCount),
          },
          {
            label: "Highest robustness",
            value: formatMetric(document?.summary?.highestRobustnessScore),
          },
          {
            label: "Total hypotheses",
            value: formatMetric(document?.summary?.totalHypotheses),
          },
        ]
      : [],
  };
}

function buildDerivedSettlementCard(
  jsonPath: string,
  htmlPath: string,
  document: LoadedResearchDiagnosticsInputs["derivedSettlementSensitivity"],
): ResearchDiagnosticArtifactCard {
  const present = document !== null;
  const sensitiveCount =
    document?.summary?.derivedSensitiveHypothesisCount
    ?? document?.summary?.sensitiveHypothesisCount
    ?? document?.sensitiveHypothesisCount
    ?? null;

  return {
    artifactId: "derived-settlement-sensitivity",
    label: "Derived settlement sensitivity",
    jsonPath,
    htmlPath,
    present,
    generatedAt: document?.generatedAt ?? null,
    metrics: present
      ? [
          {
            label: "Derived-sensitive hypotheses",
            value: formatMetric(sensitiveCount),
          },
          {
            label: "Total hypotheses",
            value: formatMetric(document?.summary?.totalHypotheses),
          },
        ]
      : [],
  };
}

function buildRefinementsCard(
  jsonPath: string,
  htmlPath: string,
  document: LoadedResearchDiagnosticsInputs["hypothesisRefinements"],
): ResearchDiagnosticArtifactCard {
  const present = document !== null;
  const refinementCount =
    document?.summary?.refinementCandidateCount
    ?? document?.summary?.candidateCount
    ?? document?.summary?.totalRefinements
    ?? (document?.refinements ? document.refinements.length : null);

  return {
    artifactId: "hypothesis-refinements",
    label: "Hypothesis refinements",
    jsonPath,
    htmlPath,
    present,
    generatedAt: document?.generatedAt ?? null,
    metrics: present
      ? [
          {
            label: "Refinement candidates",
            value: formatMetric(refinementCount),
          },
        ]
      : [],
  };
}

function buildSynthesisDebugCard(
  jsonPath: string,
  htmlPath: string,
  document: LoadedResearchDiagnosticsInputs["strategySynthesisDebug"],
): ResearchDiagnosticArtifactCard {
  const present = document !== null;
  const funnelStatus =
    document?.summary?.funnelStatus
    ?? document?.summary?.funnelStage
    ?? null;

  return {
    artifactId: "strategy-synthesis-debug",
    label: "Strategy synthesis debug",
    jsonPath,
    htmlPath,
    present,
    generatedAt: document?.generatedAt ?? null,
    metrics: present
      ? [
          {
            label: "Funnel status",
            value: funnelStatus ?? "—",
          },
          {
            label: "Harness candidates",
            value: formatMetric(document?.summary?.harnessCandidateCount),
          },
          {
            label: "Synthesized",
            value: formatMetric(
              document?.summary?.synthesizedCount ?? document?.summary?.candidateCount,
            ),
          },
        ]
      : [],
  };
}

/** Builds the dashboard research diagnostics section from optional artifacts. */
export function buildResearchDiagnosticsSection(input: {
  inputPaths: ResearchDiagnosticsInputPaths;
  loaded: LoadedResearchDiagnosticsInputs;
}): ResearchDiagnosticsSection {
  const cards = [
    buildFailureAnalysisCard(
      input.inputPaths.hypothesisFailureAnalysisPath,
      input.loaded.htmlPaths.hypothesisFailureAnalysis,
      input.loaded.hypothesisFailureAnalysis,
    ),
    buildDerivedSettlementCard(
      input.inputPaths.derivedSettlementSensitivityPath,
      input.loaded.htmlPaths.derivedSettlementSensitivity,
      input.loaded.derivedSettlementSensitivity,
    ),
    buildRefinementsCard(
      input.inputPaths.hypothesisRefinementsPath,
      input.loaded.htmlPaths.hypothesisRefinements,
      input.loaded.hypothesisRefinements,
    ),
    buildSynthesisDebugCard(
      input.inputPaths.strategySynthesisDebugPath,
      input.loaded.htmlPaths.strategySynthesisDebug,
      input.loaded.strategySynthesisDebug,
    ),
  ];

  const availableCount = cards.filter((card) => card.present).length;

  return {
    availableCount,
    totalCount: cards.length,
    nearPromisingHypothesisCount:
      input.loaded.hypothesisFailureAnalysis?.summary?.nearPromisingCount ?? null,
    highestRobustnessScore:
      input.loaded.hypothesisFailureAnalysis?.summary?.highestRobustnessScore ?? null,
    derivedSensitiveHypothesisCount:
      input.loaded.derivedSettlementSensitivity?.summary?.derivedSensitiveHypothesisCount
      ?? input.loaded.derivedSettlementSensitivity?.summary?.sensitiveHypothesisCount
      ?? input.loaded.derivedSettlementSensitivity?.sensitiveHypothesisCount
      ?? null,
    refinementCandidateCount:
      input.loaded.hypothesisRefinements?.summary?.refinementCandidateCount
      ?? input.loaded.hypothesisRefinements?.summary?.candidateCount
      ?? input.loaded.hypothesisRefinements?.summary?.totalRefinements
      ?? (input.loaded.hypothesisRefinements?.refinements
        ? input.loaded.hypothesisRefinements.refinements.length
        : null),
    strategySynthesisFunnelStatus:
      input.loaded.strategySynthesisDebug?.summary?.funnelStatus
      ?? input.loaded.strategySynthesisDebug?.summary?.funnelStage
      ?? null,
    harnessCandidateCount:
      input.loaded.strategySynthesisDebug?.summary?.harnessCandidateCount ?? null,
    cards,
  };
}
