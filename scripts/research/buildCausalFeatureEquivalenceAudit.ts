import { dirname } from "node:path";
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import { createCalibrationFadeForwardValidationIo } from "@/lib/data/research/calibrationFadeForwardValidation";
import {
  buildCausalFeatureEquivalenceAudit,
  CausalFeatureEquivalenceAuditError,
  parseCausalFeatureEquivalenceAuditArgv,
  publishResearchArtifactsAtomically,
  serializeCausalFeatureEquivalenceAuditHtml,
  serializeCausalFeatureEquivalenceAuditReport,
  type CausalFeatureEquivalenceAuditIo,
} from "@/lib/data/research/causalFeatureEquivalenceAudit";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type CausalFeatureEquivalenceAuditCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  fileExists: (path: string) => boolean;
  unlinkFile: (path: string) => void;
  renameFile: (from: string, to: string) => void;
};

export function formatCommandError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runCausalFeatureEquivalenceAuditCommand(
  argv: readonly string[],
  io: CausalFeatureEquivalenceAuditCommandIo,
  options?: {
    generatedAt?: string;
    auditIo?: CausalFeatureEquivalenceAuditIo;
  },
): Promise<number> {
  try {
    const parsed = parseCausalFeatureEquivalenceAuditArgv(argv);
    const auditIo =
      options?.auditIo ?? createCalibrationFadeForwardValidationIo();
    const report = await buildCausalFeatureEquivalenceAudit({
      captureRunDir: parsed.captureRunDir,
      io: auditIo,
      generatedAt: options?.generatedAt ?? new Date().toISOString(),
      outputPath: parsed.outputPath,
      htmlOutputPath: parsed.htmlOutputPath,
      evidencePath: parsed.evidencePath,
      hypothesisConfigPath: parsed.hypothesisConfigPath,
    });

    io.mkdirSync(dirname(parsed.outputPath), { recursive: true });
    io.mkdirSync(dirname(parsed.htmlOutputPath), { recursive: true });
    publishResearchArtifactsAtomically(io, [
      { outputPath: parsed.outputPath, data: serializeCausalFeatureEquivalenceAuditReport(report) },
      {
        outputPath: parsed.htmlOutputPath,
        data: serializeCausalFeatureEquivalenceAuditHtml(report),
      },
    ]);

    io.writeStdout(
      `${stableStringify({
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
        selectedRunId: report.selectedRunId,
        historicalEvidenceStatus: report.historicalEvidenceStatus,
        auditEvidenceHash: report.auditEvidenceHash,
        hypothesisConfigurationHash: report.hypothesisConfigurationHash,
        historicalContractSemanticHash: report.historicalContractSemanticHash,
        currentForwardContractSemanticHash: report.currentForwardContractSemanticHash,
        equivalent: report.contractComparison.equivalent,
        reconstructable: report.reconstructability.reconstructable,
        verdict: report.verdict,
        recommendedNextAction: report.recommendedNextAction,
      })}\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof CausalFeatureEquivalenceAuditError) {
      io.writeStderr(`${error.message}\n`);
      return 1;
    }
    io.writeStderr(`${formatCommandError(error)}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const exitCode = await runCausalFeatureEquivalenceAuditCommand(process.argv.slice(2), {
    writeStdout: (text) => process.stdout.write(text),
    writeStderr: (text) => process.stderr.write(text),
    writeFile: (path, data) => writeFileSync(path, data, "utf8"),
    mkdirSync: (path, options) => mkdirSync(path, options),
    fileExists: (path) => existsSync(path),
    unlinkFile: (path) => unlinkSync(path),
    renameFile: (from, to) => renameSync(from, to),
  });
  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  void main();
}
