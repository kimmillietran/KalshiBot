import { createBtcKalshiLeadLagAnalysisIo } from "@/lib/data/research/btcKalshiLeadLagAnalysis";
import { createFilesystemLeadLagDiscoveryIo } from "@/lib/data/research/btcKalshiLeadLagDiscovery";
import {
  buildLeadLagValidationReport,
  LeadLagValidationError,
  parseLeadLagValidationArgv,
} from "@/lib/data/research/btcKalshiLeadLagValidation";

async function main(): Promise<void> {
  const argv = parseLeadLagValidationArgv(process.argv.slice(2));
  const io = createFilesystemLeadLagDiscoveryIo(createBtcKalshiLeadLagAnalysisIo());

  const report = await buildLeadLagValidationReport({
    io,
    discoveryIdentityHash: argv.discoveryIdentityHash,
    discoveryReportPath: argv.discoveryReportPath,
    expectedSplitManifestHash: argv.expectedSplitManifestHash,
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
        validationOverallStatus: report.validationOverallStatus,
        validationIdentityHash: report.validationIdentityHash,
        validationContractHash: report.validationContractHash,
        discoveryIdentity: report.discoveryIdentity,
        splitManifestHash: report.splitManifestHash,
        validationRunId: report.validationRunId,
        holdoutRunId: report.holdoutRunId,
        holdoutOutcomeAccessed: report.holdoutOutcomeAccessed,
        incidence: report.incidence,
        validationArtifactIdentity: report.validationArtifactIdentity,
        candidateResults: report.candidateResults.map((result) => ({
          discoveryRank: result.exactDefinition.discoveryRank,
          hypothesisId: result.hypothesisId,
          direction: result.exactDefinition.direction,
          validationEventCount: result.validationEventCount,
          uniqueBtcTriggerCount: result.uniqueBtcTriggerCount,
          independentMarketCount: result.independentMarketCount,
          independentMarketDayCount: result.independentMarketDayCount,
          midpointResponseCents: result.midpointResponseCents,
          executableObservabilityShare: result.executableObservabilityShare,
          executableAskResponseCents: result.executableAskResponseCents,
          directionalConsistency: result.directionalConsistency,
          validationStatus: result.validationStatus,
        })),
        survivingCandidateCount: report.survivingCandidateCount,
        lockedHoldoutCandidate: report.lockedHoldoutCandidate
          ? {
              hypothesisId: report.lockedHoldoutCandidate.hypothesisId,
              discoveryRank: report.lockedHoldoutCandidate.exactDefinition.discoveryRank,
              direction: report.lockedHoldoutCandidate.exactDefinition.direction,
              lockReason: report.lockedHoldoutCandidate.lockReason,
            }
          : null,
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
    error instanceof LeadLagValidationError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
