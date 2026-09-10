import { dirname, join } from "node:path";

import { publishResearchArtifactsAtomically } from "../calibrationFadeForwardValidation/publishResearchArtifactsAtomically";

import {
  buildLeadLagReplicationReadinessReport,
} from "./buildLeadLagReplicationReadinessReport";
import { loadReplicationLineageArtifacts } from "./loadReplicationLineageArtifacts";
import type {
  LeadLagReplicationReadinessConfig,
  LeadLagReplicationReadinessIo,
  LeadLagReplicationReadinessReport,
} from "./leadLagReplicationReadinessTypes";
import {
  serializeLeadLagReplicationReadinessHtml,
  serializeLeadLagReplicationReadinessJson,
} from "./serializeLeadLagReplicationReadiness";

function tryMeasureDirectoryBytes(
  io: LeadLagReplicationReadinessIo,
  root: string,
  runId: string,
): number | null {
  const dir = join(root, runId);
  if (!io.fileExists(dir)) {
    return null;
  }
  // Prefer status-adjacent lightweight signals; exact recursive du is optional and
  // may be supplied by the CLI via observed bytes probe. Here we only detect presence.
  return null;
}

export async function buildAndPublishLeadLagReplicationReadiness(input: {
  io: LeadLagReplicationReadinessIo;
  config: LeadLagReplicationReadinessConfig;
  generatedAt?: string;
  observedBytesByRun?: readonly { runId: string; observedBytes: number | null }[];
  log?: (message: string) => void;
}): Promise<LeadLagReplicationReadinessReport> {
  const lineage = loadReplicationLineageArtifacts({
    io: input.io,
    discoveryIdentityHash: input.config.discoveryIdentityHash,
    discoveryReportPath: input.config.discoveryReportPath,
    validationIdentityHash: input.config.validationIdentityHash,
    validationReportPath: input.config.validationReportPath,
    holdoutIdentityHash: input.config.holdoutIdentityHash,
    holdoutReportPath: input.config.holdoutReportPath,
    expectedEvidenceContractIdentity: input.config.expectedEvidenceContractIdentity,
  });

  const observedBytesByRun =
    input.observedBytesByRun
    ?? input.config.captureRunRoots.flatMap((root) => {
      const runIds = [
        lineage.discovery.splitManifest.train.runId,
        lineage.validation.validationRunId,
        lineage.holdout.holdoutRunId,
      ];
      return runIds.map((runId) => ({
        runId,
        observedBytes: tryMeasureDirectoryBytes(input.io, root, runId),
      }));
    });

  const report = buildLeadLagReplicationReadinessReport({
    lineage,
    observedBytesByRun,
    generatedAt: input.generatedAt,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
  });

  input.io.mkdirSync(dirname(report.outputPaths.outputPath), { recursive: true });
  input.io.mkdirSync(dirname(report.outputPaths.htmlOutputPath), { recursive: true });

  publishResearchArtifactsAtomically(input.io, [
    {
      outputPath: report.outputPaths.outputPath,
      data: serializeLeadLagReplicationReadinessJson(report),
    },
    {
      outputPath: report.outputPaths.htmlOutputPath,
      data: serializeLeadLagReplicationReadinessHtml(report),
    },
  ]);

  input.log?.(
    [
      `replicationReadiness=${report.replicationReadiness}`,
      `decisionRequired=${report.decisionRequired}`,
      `requiredFreshEffectiveN=${report.requiredFreshEffectiveN}`,
      `readinessIdentityHash=${report.readinessIdentityHash}`,
      `output=${report.outputPaths.outputPath}`,
    ].join("\n"),
  );

  return report;
}
