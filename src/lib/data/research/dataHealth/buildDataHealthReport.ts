import { stableStringify } from "@/lib/trading/config/hashConfig";

import { computeRecommendations, computeStageStatuses } from "./computeStageStatuses";
import { scanDataHealthInputs } from "./scanDataHealthInputs";
import type {
  BuildDataHealthReportInput,
  DataHealthConfig,
  DataHealthIo,
  DataHealthReport,
} from "./dataHealthTypes";

/** Builds a deterministic data health report from scanned inputs. */
export function buildDataHealthReport(input: BuildDataHealthReportInput): DataHealthReport {
  const stageStatuses = computeStageStatuses(input.scanned);

  return {
    generatedAt: input.generatedAt,
    outputPath: input.config.outputPath.replace(/\\/g, "/"),
    config: {
      ...input.config,
      discoveryResultPath: input.config.discoveryResultPath.replace(/\\/g, "/"),
      importsDir: input.config.importsDir.replace(/\\/g, "/"),
      importConfigsDir: input.config.importConfigsDir.replace(/\\/g, "/"),
      fixturesDir: input.config.fixturesDir.replace(/\\/g, "/"),
      registryDir: input.config.registryDir.replace(/\\/g, "/"),
      researchResultsDir: input.config.researchResultsDir.replace(/\\/g, "/"),
      leaderboardPath: input.config.leaderboardPath.replace(/\\/g, "/"),
      reportHtmlPath: input.config.reportHtmlPath.replace(/\\/g, "/"),
      outputPath: input.config.outputPath.replace(/\\/g, "/"),
    },
    pipelineCoverage: input.scanned.pipelineCoverage,
    settlementHealth: input.scanned.settlementHealth,
    researchCoverage: input.scanned.researchCoverage,
    artifactFreshness: input.scanned.artifactFreshness,
    stageStatuses,
    recommendations: computeRecommendations(stageStatuses),
  };
}

export function buildDataHealthReportFromPaths(
  config: DataHealthConfig,
  io: DataHealthIo,
  options: { generatedAt: string },
): DataHealthReport {
  const scanned = scanDataHealthInputs(config, io);
  return buildDataHealthReport({
    generatedAt: options.generatedAt,
    config,
    scanned,
  });
}

export function serializeDataHealthReport(report: DataHealthReport): string {
  return stableStringify(report);
}
