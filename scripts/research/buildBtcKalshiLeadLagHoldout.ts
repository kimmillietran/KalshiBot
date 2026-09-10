import { createBtcKalshiLeadLagAnalysisIo } from "@/lib/data/research/btcKalshiLeadLagAnalysis";
import { createFilesystemLeadLagDiscoveryIo } from "@/lib/data/research/btcKalshiLeadLagDiscovery";
import {
  buildLeadLagHoldoutReport,
  LeadLagHoldoutError,
  parseLeadLagHoldoutArgv,
} from "@/lib/data/research/btcKalshiLeadLagHoldout";

async function main(): Promise<void> {
  const config = parseLeadLagHoldoutArgv(process.argv.slice(2));
  const io = createFilesystemLeadLagDiscoveryIo(createBtcKalshiLeadLagAnalysisIo());

  const report = await buildLeadLagHoldoutReport({
    io,
    config,
    log: (message) => {
      process.stderr.write(`${message}\n`);
    },
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        holdoutStatisticalVerdict: report.holdoutStatisticalVerdict,
        holdoutOverallStatus: report.holdoutOverallStatus,
        recommendedNextAction: report.recommendedNextAction,
        discoveryIdentity: report.discoveryIdentity,
        validationIdentity: report.validationIdentity,
        evidenceContractIdentity: report.evidenceContractIdentity,
        holdoutIdentityHash: report.holdoutIdentityHash,
        lockedCandidateId: report.lockedCandidateId,
        lockedCandidateDefinitionHash: report.lockedCandidateDefinitionHash,
        holdoutRunId: report.holdoutRunId,
        lineage: report.lineage,
        captureQuality: report.captureQuality,
        candidateMetrics: {
          rawEligibleEventCount: report.candidateMetrics.rawEligibleEventCount,
          uniqueBtcTriggerCount: report.candidateMetrics.uniqueBtcTriggerCount,
          independentMarketCount: report.candidateMetrics.independentMarketCount,
          independentMarketDayCount: report.candidateMetrics.independentMarketDayCount,
          effectiveSampleSize: report.candidateMetrics.effectiveSampleSize,
          holdoutEffectCents: report.candidateMetrics.holdoutEffectCents,
          executableAskEffectCents: report.candidateMetrics.executableAskEffectCents,
          executableObservabilityShare: report.candidateMetrics.executableObservabilityShare,
          executionObservabilitySatisfied:
            report.candidateMetrics.executionObservabilitySatisfied,
        },
        power: report.power,
        candidatesEvaluatedCount: report.candidatesEvaluatedCount,
        otherValidationSurvivorsInspectedOnHoldout:
          report.otherValidationSurvivorsInspectedOnHoldout,
        searchGridRerun: report.searchGridRerun,
        parameterRetuningOccurred: report.parameterRetuningOccurred,
        quarantine: report.quarantine,
        promotionEligibilityNote: report.promotionEligibilityNote,
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
    error instanceof LeadLagHoldoutError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
