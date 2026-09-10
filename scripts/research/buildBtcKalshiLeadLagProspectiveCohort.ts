import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildLeadLagProspectiveCohortReport,
  LeadLagProspectiveCohortError,
  parseLeadLagProspectiveCohortArgv,
} from "@/lib/data/research/btcKalshiLeadLagProspectiveCohort";

async function main(): Promise<void> {
  const config = parseLeadLagProspectiveCohortArgv(process.argv.slice(2));
  const io = {
    fileExists: (path: string) => existsSync(path),
    readFile: (path: string) => readFileSync(path, "utf8"),
    writeFile: (path: string, data: string) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, data, "utf8");
    },
    mkdirSync: (path: string, options?: { recursive?: boolean }) => {
      mkdirSync(path, options);
    },
  };

  const report = buildLeadLagProspectiveCohortReport({ io, config });
  process.stdout.write(
    `${JSON.stringify(
      {
        analysisVersion: report.analysisVersion,
        cohortIdentityHash: report.cohortIdentityHash,
        admittedRunIds: report.manifest.memberRunIds,
        rejectedAdmissions: report.rejectedAdmissions,
        rawPerRunEssSum: report.dedup.rawPerRunEssSum,
        deduplicatedCohortEss: report.dedup.deduplicatedCohortEss,
        duplicateOrDependentUnitsRemoved: report.dedup.duplicateOrDependentUnitsRemoved,
        fixedNProgress: report.collectionProgress.fixedNProgress,
        finalEvaluationBoundary: report.finalEvaluationBoundary,
        quarantine: report.quarantine,
        outputPath: report.outputPath,
        progressOutputPath: report.progressOutputPath,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof LeadLagProspectiveCohortError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
