/**
 * M16.1 CLI — evidence contract / cohort plan / outcome-open status.
 * Never reads P&L, target-hit, stop-hit, or settlement direction.
 */
import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation/publishResearchArtifactsAtomically";
import {
  buildM16AuthoritativeFeeContract,
  buildM16DependencePlan,
  buildM16EvidenceContract,
  buildM16ProspectiveCohortPlan,
  evaluateM16OutcomeOpenAuthorization,
  parseM161Argv,
  serializeM16AuthoritativeFeeContractJson,
  serializeM16DependencePlanJson,
  serializeM16EvidenceContractJson,
  serializeM16OutcomeOpenStatusJson,
  serializeM16ProspectiveCohortPlanJson,
} from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export async function runM16EvidenceContractCommand(
  argv: readonly string[],
): Promise<number> {
  try {
    const parsed = parseM161Argv(argv);
    const evidence = buildM16EvidenceContract();
    const dependence = buildM16DependencePlan();
    const fee = buildM16AuthoritativeFeeContract();
    const cohort = buildM16ProspectiveCohortPlan();

    const publishIo = {
      writeFile: (path: string, data: string) => writeFileSync(path, data, "utf8"),
      fileExists: (path: string) => existsSync(path),
      renameFile: (from: string, to: string) => renameSync(from, to),
      unlinkFile: (path: string) => unlinkSync(path),
      mkdirSync: (path: string, opts?: { recursive?: boolean }) => mkdirSync(path, opts),
      readFile: (path: string) => readFileSync(path, "utf8"),
    };

    for (const path of [
      parsed.evidenceContractOutputPath,
      parsed.dependencePlanOutputPath,
      parsed.feeContractOutputPath,
      parsed.cohortPlanOutputPath,
    ]) {
      mkdirSync(dirname(path), { recursive: true });
    }

    publishResearchArtifactsAtomically(publishIo, [
      {
        outputPath: parsed.evidenceContractOutputPath,
        data: serializeM16EvidenceContractJson(evidence),
      },
      {
        outputPath: parsed.dependencePlanOutputPath,
        data: serializeM16DependencePlanJson(dependence),
      },
      {
        outputPath: parsed.feeContractOutputPath,
        data: serializeM16AuthoritativeFeeContractJson(fee),
      },
      {
        outputPath: parsed.cohortPlanOutputPath,
        data: serializeM16ProspectiveCohortPlanJson(cohort),
      },
    ]);

    if (parsed.mode === "outcome-open-status") {
      const status = evaluateM16OutcomeOpenAuthorization({
        progress: parsed.progress,
        pnlPreviouslyOpened: false,
      });
      mkdirSync(dirname(parsed.outcomeOpenStatusOutputPath), { recursive: true });
      publishResearchArtifactsAtomically(publishIo, [
        {
          outputPath: parsed.outcomeOpenStatusOutputPath,
          data: serializeM16OutcomeOpenStatusJson(status),
        },
      ]);
      process.stdout.write(
        `${stableStringify({
          mode: parsed.mode,
          authorized: status.authorized,
          blockers: status.blockers,
          progress: status.progress,
          sealedIdentities: status.sealedIdentities,
          outcomesOpened: false,
          pnlInspected: false,
        })}\n`,
      );
      return 0;
    }

    process.stdout.write(
      `${stableStringify({
        mode: parsed.mode,
        evidenceContractIdentity: evidence.evidenceContractIdentity,
        dependencePlanIdentity: dependence.dependencePlanIdentity,
        feeContractIdentity: fee.feeContractIdentity,
        feeContractStatus: fee.feeContractStatus,
        cohortPlanIdentity: cohort.cohortPlanIdentity,
        requiredTradeN: evidence.collectionTargets.requiredTradeN,
        minimumUtcDayClusters: evidence.collectionTargets.minimumUtcDayClusters,
        iidBaselineTradeN: evidence.iidBaseline.iidBaselineTradeN,
        maxAcceptedCaptureHours: cohort.budget.maxAcceptedCaptureHours,
        outcomesOpened: false,
        pnlInspected: false,
      })}\n`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`M16.1 failed: ${message}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const code = await runM16EvidenceContractCommand(process.argv.slice(2));
  process.exitCode = code;
}

if (
  import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith("runM16EvidenceContract.ts")
) {
  void main();
}
