import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { createBtcKalshiLeadLagAnalysisIo } from "@/lib/data/research/btcKalshiLeadLagAnalysis";
import { createFilesystemLeadLagDiscoveryIo } from "@/lib/data/research/btcKalshiLeadLagDiscovery";
import {
  buildAndPublishLeadLagReplicationReadiness,
  LeadLagReplicationReadinessError,
  parseLeadLagReplicationReadinessArgv,
} from "@/lib/data/research/btcKalshiLeadLagReplicationReadiness";

function measureDirectoryBytes(dir: string): number | null {
  if (!existsSync(dir)) {
    return null;
  }
  const result = spawnSync("du", ["-sk", dir], { encoding: "utf8" });
  if (result.status !== 0 || result.stdout == null) {
    return null;
  }
  const kilobytes = Number.parseInt(result.stdout.trim().split(/\s+/)[0] ?? "", 10);
  if (!Number.isFinite(kilobytes) || kilobytes < 0) {
    return null;
  }
  return kilobytes * 1024;
}

async function main(): Promise<void> {
  const config = parseLeadLagReplicationReadinessArgv(process.argv.slice(2));
  const io = createFilesystemLeadLagDiscoveryIo(createBtcKalshiLeadLagAnalysisIo());

  const runIds = [
    "2026-09-08T07-46-44-416Z",
    "2026-09-09T06-39-04-259Z",
    "2026-09-09T20-37-36-719Z",
  ];
  const observedBytesByRun = runIds.map((runId) => {
    let observedBytes: number | null = null;
    for (const root of config.captureRunRoots) {
      const measured = measureDirectoryBytes(join(root, runId));
      if (measured != null) {
        observedBytes = measured;
        break;
      }
    }
    return { runId, observedBytes };
  });

  const report = await buildAndPublishLeadLagReplicationReadiness({
    io,
    config,
    observedBytesByRun,
    log: (message) => {
      process.stderr.write(`${message}\n`);
    },
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        analysisVersion: report.analysisVersion,
        readinessIdentityHash: report.readinessIdentityHash,
        lineage: report.lineage,
        currentStatus: report.currentStatus,
        requiredFreshEffectiveN: report.requiredFreshEffectiveN,
        historicalIncidenceByRun: report.historicalIncidenceByRun,
        pooledIncidence: report.pooledIncidence,
        projectedHoursToRequiredN: report.projectedHoursToRequiredN,
        estimatedStorageRequirement: {
          pooledBytesPerHour: report.estimatedStorageRequirement.pooledBytesPerHour,
          projectedBytesToRequiredN:
            report.estimatedStorageRequirement.projectedBytesToRequiredN,
        },
        recommendedStoppingRule: report.recommendedStoppingRule,
        technicalCaptureReadiness: report.technicalCaptureReadiness,
        operationalBurden: report.operationalBurden,
        replicationReadiness: report.replicationReadiness,
        decisionRequired: report.decisionRequired,
        recommendedNextAction: report.recommendedNextAction,
        quarantine: report.quarantine,
        outputPaths: report.outputPaths,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof LeadLagReplicationReadinessError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
