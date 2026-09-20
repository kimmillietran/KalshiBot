/**
 * M16.0 — side-invariant exhaustion-reversal CLI.
 * definition-only / incidence-plan-only / pnl-blind incidence.
 * Do NOT open economic outcomes from this script.
 */
import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation/publishResearchArtifactsAtomically";
import {
  buildM16FamilyDefinition,
  buildM16IncidencePlan,
  parseM16Argv,
  serializeM16BlindIncidenceReportJson,
  serializeM16FamilyDefinitionJson,
  serializeM16IncidencePlanJson,
  streamM16BlindIncidenceFromCaptures,
} from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal";
import { createFilesystemMomentumDiscoveryIo } from "@/lib/data/research/kalshiTobMomentumDiscovery";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export async function runM16SideInvariantReversalCommand(
  argv: readonly string[],
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const parsed = parseM16Argv(argv);
    const family = buildM16FamilyDefinition();
    const plan = buildM16IncidencePlan();

    const publishIo = {
      writeFile: (path: string, data: string) => writeFileSync(path, data, "utf8"),
      fileExists: (path: string) => existsSync(path),
      renameFile: (from: string, to: string) => renameSync(from, to),
      unlinkFile: (path: string) => unlinkSync(path),
      mkdirSync: (path: string, opts?: { recursive?: boolean }) => mkdirSync(path, opts),
      readFile: (path: string) => readFileSync(path, "utf8"),
    };

    mkdirSync(dirname(parsed.familyDefinitionOutputPath), { recursive: true });
    mkdirSync(dirname(parsed.incidencePlanOutputPath), { recursive: true });

    publishResearchArtifactsAtomically(publishIo, [
      {
        outputPath: parsed.familyDefinitionOutputPath,
        data: serializeM16FamilyDefinitionJson(family),
      },
      {
        outputPath: parsed.incidencePlanOutputPath,
        data: serializeM16IncidencePlanJson(plan),
      },
    ]);

    if (parsed.mode === "definition-only" || parsed.mode === "incidence-plan-only") {
      process.stdout.write(
        `${stableStringify({
          mode: parsed.mode,
          subfamilyId: family.subfamilyId,
          familyDefinitionIdentity: family.familyDefinitionIdentity,
          incidencePlanIdentity: plan.incidencePlanIdentity,
          feeContractIdentity: family.feeContract.feeContractIdentity,
          feeContractStatus: family.feeContract.feeContractStatus,
          confirmatoryEvidenceContractStatus:
            family.confirmatoryEvidenceContractStatus,
          dependenceInferencePlanStatus: family.dependenceInferencePlanStatus,
          economicOutcomeOpenAuthorized: family.economicOutcomeOpenAuthorized,
          familyDefinitionOutputPath: parsed.familyDefinitionOutputPath,
          incidencePlanOutputPath: parsed.incidencePlanOutputPath,
          outcomesOpened: false,
        })}\n`,
      );
      return 0;
    }

    const io = createFilesystemMomentumDiscoveryIo();
    const report = await streamM16BlindIncidenceFromCaptures({
      io,
      captures: parsed.captures,
      codeAuthoritySha: parsed.codeAuthoritySha,
      generatedAt: options?.generatedAt,
      log: (message) => {
        process.stderr.write(`${message}\n`);
      },
    });

    mkdirSync(dirname(parsed.reportOutputPath), { recursive: true });
    publishResearchArtifactsAtomically(publishIo, [
      {
        outputPath: parsed.reportOutputPath,
        data: serializeM16BlindIncidenceReportJson(report),
      },
    ]);

    process.stdout.write(
      `${stableStringify({
        mode: "blind-incidence",
        analysisVersion: report.analysisVersion,
        familyDefinitionIdentity: report.familyDefinitionIdentity,
        incidencePlanIdentity: report.incidencePlanIdentity,
        reportIdentity: report.reportIdentity,
        incidenceDisposition: report.incidenceDisposition,
        usableFutureAnalysisEntryCount: report.usableFutureAnalysisEntryCount,
        incidencePerHour: report.incidencePerHour,
        economicOutcomeOpenAuthorized: report.economicOutcomeOpenAuthorized,
        outcomesOpened: false,
        outputPath: parsed.reportOutputPath,
      })}\n`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`M16 failed: ${message}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const code = await runM16SideInvariantReversalCommand(process.argv.slice(2));
  process.exitCode = code;
}

if (
  import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith("runM16SideInvariantReversalStudy.ts")
) {
  void main();
}
