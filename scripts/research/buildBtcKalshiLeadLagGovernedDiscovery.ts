import {
  buildLeadLagGovernedDiscoveryReport,
  createFilesystemLeadLagDiscoveryIo,
  LeadLagGovernedDiscoveryError,
  parseLeadLagGovernedDiscoveryArgv,
} from "@/lib/data/research/btcKalshiLeadLagDiscovery";
import { createBtcKalshiLeadLagAnalysisIo } from "@/lib/data/research/btcKalshiLeadLagAnalysis";

async function main(): Promise<void> {
  const argv = parseLeadLagGovernedDiscoveryArgv(process.argv.slice(2));
  const baseIo = createFilesystemLeadLagDiscoveryIo(createBtcKalshiLeadLagAnalysisIo());

  const report = await buildLeadLagGovernedDiscoveryReport({
    io: baseIo,
    trainCaptureRunDir: argv.trainCaptureRunDir,
    validationCaptureRunDir: argv.validationCaptureRunDir,
    holdoutCaptureRunDir: argv.holdoutCaptureRunDir,
    outputPath: argv.outputPath,
    htmlOutputPath: argv.htmlOutputPath,
    log: (message) => {
      process.stderr.write(`${message}\n`);
    },
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        discoveryStatus: report.discoveryStatus,
        discoveryIsolationStatus: report.discoveryIsolationStatus,
        discoveryIdentityHash: report.discoveryIdentityHash,
        splitManifestHash: report.splitManifestHash,
        trainRunId: report.splitManifest.train.runId,
        validationRunId: report.splitManifest.validation.runId,
        holdoutRunId: report.splitManifest.holdout.runId,
        contamination: {
          train: report.splitManifest.train.contaminationClassification,
          validation: report.splitManifest.validation.contaminationClassification,
          holdout: report.splitManifest.holdout.contaminationClassification,
        },
        trainCaptureHealth: report.trainCaptureHealth,
        incidence: report.incidence,
        searchUniverse: {
          structuralCellCount: report.searchUniverse.structuralCellCount,
          hypothesisCount: report.searchUniverse.hypothesisCount,
          multiplicityDeclaration: report.searchUniverse.multiplicityDeclaration,
        },
        candidates: report.candidates.map((candidate) => ({
          rank: candidate.rank,
          hypothesisId: candidate.hypothesisId,
          direction: candidate.direction,
          btcMoveHorizonMs: candidate.btcMoveHorizonMs,
          responseWindowMs: candidate.responseWindowMs,
          btcMagnitudeBin: candidate.btcMagnitudeBin,
          timeRemainingBin: candidate.timeRemainingBin,
          impliedProbabilityBin: candidate.impliedProbabilityBin,
          eligibleMarketTriggerCount: candidate.eligibleMarketTriggerCount,
          uniqueBtcTriggerCount: candidate.uniqueBtcTriggerCount,
          independentMarketCount: candidate.independentMarketCount,
          independentMarketDayCount: candidate.independentMarketDayCount,
          medianSignedMidResponseCents: candidate.medianSignedMidResponseCents,
          medianSignedExecutableAskResponseCents:
            candidate.medianSignedExecutableAskResponseCents,
          executableObservabilityShare: candidate.executableObservabilityShare,
          rankingScore: candidate.rankingScore,
        })),
        quarantine: report.quarantine,
        outputPaths: report.outputPaths,
        warnings: report.warnings,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof LeadLagGovernedDiscoveryError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
