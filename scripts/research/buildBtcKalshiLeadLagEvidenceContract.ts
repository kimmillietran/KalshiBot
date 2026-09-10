import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation/publishResearchArtifactsAtomically";
import {
  buildLeadLagEvidenceDesignReport,
  createOutcomeQuarantinedEvidenceIo,
  parseLeadLagEvidenceContractArgv,
  serializeLeadLagEvidenceDesignHtml,
  serializeLeadLagEvidenceDesignJson,
} from "@/lib/data/research/btcKalshiLeadLagEvidenceContract";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type LeadLagEvidenceContractCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  fileExists: (path: string) => boolean;
  readFile: (path: string) => string;
  unlinkFile: (path: string) => void;
  renameFile: (from: string, to: string) => void;
};

export function formatCommandError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runLeadLagEvidenceContractCommand(
  argv: readonly string[],
  io: LeadLagEvidenceContractCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const config = parseLeadLagEvidenceContractArgv(argv);
    // Quarantine Run 2/3 lead-lag outcome reads even though this prep report
    // does not analyze them — fail closed if anything tries.
    createOutcomeQuarantinedEvidenceIo({
      readFile: io.readFile,
      fileExists: io.fileExists,
    });

    const report = buildLeadLagEvidenceDesignReport({
      config,
      generatedAt: options?.generatedAt ?? new Date().toISOString(),
    });

    io.mkdirSync(dirname(report.outputPath), { recursive: true });
    io.mkdirSync(dirname(report.htmlOutputPath), { recursive: true });

    publishResearchArtifactsAtomically(io, [
      {
        outputPath: report.outputPath,
        data: serializeLeadLagEvidenceDesignJson(report),
      },
      {
        outputPath: report.htmlOutputPath,
        data: serializeLeadLagEvidenceDesignHtml(report),
      },
    ]);

    io.writeStdout(
      `${stableStringify({
        analysisVersion: report.analysisVersion,
        designIdentityHash: report.designIdentityHash,
        discoveryIdentity: report.discoveryIdentity,
        selectionStatus: "candidate-agnostic",
        candidateWinnerSelected: report.candidateWinnerSelected,
        validationOutcomeAccessed: report.validationOutcomeAccessed,
        holdoutOutcomeAccessed: report.holdoutOutcomeAccessed,
        promotionIntegrationStatus: report.promotionIntegrationStatus,
        outputPath: report.outputPath,
        htmlOutputPath: report.htmlOutputPath,
      })}\n`,
    );
    return 0;
  } catch (error) {
    io.writeStderr(`${formatCommandError(error)}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const code = await runLeadLagEvidenceContractCommand(process.argv.slice(2), {
    writeStdout: (text) => process.stdout.write(text),
    writeStderr: (text) => process.stderr.write(text),
    writeFile: (path, data) => writeFileSync(path, data, "utf8"),
    mkdirSync: (path, options) => mkdirSync(path, options),
    fileExists: (path) => existsSync(path),
    readFile: (path) => readFileSync(path, "utf8"),
    unlinkFile: (path) => unlinkSync(path),
    renameFile: (from, to) => renameSync(from, to),
  });
  process.exitCode = code;
}

if (
  import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith("buildBtcKalshiLeadLagEvidenceContract.ts")
) {
  void main();
}
