/**
 * M15.0 — prospective KXBTC15M taker cost-floor study CLI.
 *
 * DESIGN + IMPLEMENTATION only at M15.0: prefer --definition-only until the
 * study definition is reviewed. Do NOT point at M14 validation captures.
 * Do NOT launch fresh capture from this script.
 */
import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation/publishResearchArtifactsAtomically";
import {
  buildM15StudyDefinition,
  parseM15CostFloorArgv,
  serializeM15CostFloorReportJson,
  serializeM15StudyDefinitionJson,
  streamM15TakerCostFloorFromCaptures,
} from "@/lib/data/research/kalshiKxbtc15mTakerCostFloor";
import { createFilesystemMomentumDiscoveryIo } from "@/lib/data/research/kalshiTobMomentumDiscovery";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export async function runM15TakerCostFloorCommand(
  argv: readonly string[],
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const parsed = parseM15CostFloorArgv(argv);
    const study = buildM15StudyDefinition();

    const publishIo = {
      writeFile: (path: string, data: string) => writeFileSync(path, data, "utf8"),
      fileExists: (path: string) => existsSync(path),
      renameFile: (from: string, to: string) => renameSync(from, to),
      unlinkFile: (path: string) => unlinkSync(path),
      mkdirSync: (path: string, opts?: { recursive?: boolean }) => mkdirSync(path, opts),
      readFile: (path: string) => readFileSync(path, "utf8"),
    };

    mkdirSync(dirname(parsed.studyDefinitionOutputPath), { recursive: true });
    publishResearchArtifactsAtomically(publishIo, [
      {
        outputPath: parsed.studyDefinitionOutputPath,
        data: serializeM15StudyDefinitionJson(study),
      },
    ]);

    if (parsed.dryRunDefinitionOnly) {
      process.stdout.write(
        `${stableStringify({
          mode: "definition-only",
          studyId: study.studyId,
          studyDefinitionIdentity: study.studyDefinitionIdentity,
          feeContractIdentity: study.feeContract.feeContractIdentity,
          studyDefinitionOutputPath: parsed.studyDefinitionOutputPath,
          m14Status: "CLOSED — VALIDATION FAILED — NO HOLDOUT",
          realEvidenceConsumed: false,
        })}\n`,
      );
      return 0;
    }

    const io = createFilesystemMomentumDiscoveryIo();
    const report = await streamM15TakerCostFloorFromCaptures({
      io,
      captures: parsed.captures,
      expectedFeeContractIdentity:
        parsed.expectedFeeContractIdentity ?? study.feeContract.feeContractIdentity,
      codeAuthoritySha: parsed.codeAuthoritySha,
      generatedAt: options?.generatedAt,
      log: (message) => {
        process.stderr.write(`${message}\n`);
      },
    });

    mkdirSync(dirname(parsed.outputPath), { recursive: true });
    publishResearchArtifactsAtomically(publishIo, [
      {
        outputPath: parsed.outputPath,
        data: serializeM15CostFloorReportJson(report),
      },
    ]);

    process.stdout.write(
      `${stableStringify({
        analysisVersion: report.analysisVersion,
        studyId: report.studyId,
        studyDefinitionIdentity: report.studyDefinitionIdentity,
        reportIdentity: report.reportIdentity,
        programDecision: report.programDecision,
        feeContractIdentity: report.feeContract.feeContractIdentity,
        outputPath: parsed.outputPath,
        realEvidenceNote:
          "M15.0 ships design+tests only; do not treat CLI output on real captures "
          + "as reviewed evidence until senior design review passes.",
      })}\n`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`M15 cost-floor failed: ${message}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const code = await runM15TakerCostFloorCommand(process.argv.slice(2));
  process.exitCode = code;
}

if (
  import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith("runM15TakerCostFloorStudy.ts")
) {
  void main();
}
