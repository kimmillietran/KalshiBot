import type {
  ResearchPipelineConfig,
  ResearchPipelineStepDefinition,
} from "./researchPipelineTypes";

/** Builds the ordered research pipeline step definitions. */
export function buildResearchPipelineSteps(
  config: ResearchPipelineConfig,
): readonly ResearchPipelineStepDefinition[] {
  return [
    {
      id: "discover",
      label: "Discover markets",
      npmScript: "discover:markets",
      args: [
        "--series",
        config.series,
        "--limit",
        String(config.limit),
        "--request-delay-ms",
        "250",
        "--max-retries",
        "5",
        "--retry-base-delay-ms",
        "2000",
        "--output",
        config.discoveryOutputPath,
      ],
    },
    {
      id: "import-configs",
      label: "Generate import configs",
      npmScript: "discovery:import-configs",
      args: [
        "--input",
        config.discoveryOutputPath,
        "--output-dir",
        "data/import-configs",
      ],
    },
    {
      id: "import-batch",
      label: "Batch import historical data",
      npmScript: "import:batch",
      args: [
        "--input-dir",
        "data/import-configs",
        "--output-dir",
        "data/imports",
        "--concurrency",
        String(config.concurrency),
        "--request-delay-ms",
        "1000",
        "--max-retries",
        "5",
        "--retry-base-delay-ms",
        "2000",
      ],
    },
    {
      id: "analyze-failures",
      label: "Analyze import failures",
      npmScript: "imports:analyze-failures",
      args: [],
    },
    {
      id: "fixtures",
      label: "Build fixtures",
      npmScript: "fixtures:batch",
      args: [
        "--input-dir",
        "data/imports",
        "--output-dir",
        "data/fixtures",
        "--summary",
        "batch-fixtures-summary.json",
      ],
    },
    {
      id: "registry",
      label: "Build research registry",
      npmScript: "research:registry",
      args: [
        "--input-dir",
        "data/fixtures",
        "--metadata-dir",
        "data/imports",
        "--output-dir",
        "data/research-datasets",
      ],
    },
    {
      id: "sweep",
      label: "Run strategy sweep",
      npmScript: "research:sweep",
      args: [
        "--all",
        "--registry",
        "data/research-datasets",
        "--output-dir",
        "data/research-results",
        "--summary",
        "sweep-summary.json",
        "--concurrency",
        String(config.concurrency),
      ],
    },
    {
      id: "aggregate",
      label: "Aggregate research statistics",
      npmScript: "research:aggregate",
      args: [
        "--input-dir",
        "data/research-results",
        "--output-dir",
        "data/research-results",
      ],
    },
    {
      id: "leaderboard",
      label: "Build strategy leaderboard",
      npmScript: "leaderboard:strategies",
      args: [
        "--input-dir",
        "data/research-results",
        "--output",
        "data/leaderboards/strategy-leaderboard.json",
        "--rank-by",
        config.rankBy,
      ],
    },
    {
      id: "calibration",
      label: "Build calibration report",
      npmScript: "research:calibration",
      args: [],
    },
    {
      id: "report",
      label: "Build research report",
      npmScript: "research:report",
      args: [],
    },
    {
      id: "lead-lag",
      label: "Build lead-lag analysis",
      npmScript: "research:lead-lag",
      args: [],
    },
    {
      id: "significance",
      label: "Build statistical significance report",
      npmScript: "research:significance",
      args: [],
    },
    {
      id: "power-analysis",
      label: "Build power analysis report",
      npmScript: "research:power-analysis",
      args: [],
    },
    {
      id: "overfitting-diagnostics",
      label: "Build overfitting diagnostics",
      npmScript: "research:overfitting-diagnostics",
      args: [],
    },
    {
      id: "regime-tags",
      label: "Tag market regimes",
      npmScript: "research:tag-regimes",
      args: [],
    },
    {
      id: "hypotheses",
      label: "Generate hypothesis candidates",
      npmScript: "research:hypotheses",
      args: [],
    },
  ];
}

export function formatResearchPipelineCommand(
  npmScript: string,
  args: readonly string[],
): string {
  if (args.length === 0) {
    return `npm run ${npmScript}`;
  }

  return `npm run ${npmScript} -- ${args.join(" ")}`;
}
