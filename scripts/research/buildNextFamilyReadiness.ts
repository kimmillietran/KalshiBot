import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import { createCalibrationFadeForwardValidationIo } from "@/lib/data/research/calibrationFadeForwardValidation";
import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation/publishResearchArtifactsAtomically";
import {
  buildNextFamilyReadinessReport,
  parseNextFamilyReadinessArgv,
  serializeNextFamilyReadinessHtml,
  serializeNextFamilyReadinessJson,
} from "@/lib/data/research/nextFamilyReadiness";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type NextFamilyReadinessCommandIo = {
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

export async function runNextFamilyReadinessCommand(
  argv: readonly string[],
  io: NextFamilyReadinessCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const config = parseNextFamilyReadinessArgv(argv);
    const analysisIo = {
      ...createCalibrationFadeForwardValidationIo(),
      fileExists: io.fileExists,
      readFile: io.readFile,
      writeFile: io.writeFile,
      unlinkFile: io.unlinkFile,
      renameFile: io.renameFile,
    };
    const report = buildNextFamilyReadinessReport({
      config,
      io: analysisIo,
      generatedAt: options?.generatedAt ?? new Date().toISOString(),
    });

    io.mkdirSync(dirname(report.outputPath), { recursive: true });
    io.mkdirSync(dirname(report.htmlOutputPath), { recursive: true });

    publishResearchArtifactsAtomically(io, [
      {
        outputPath: report.outputPath,
        data: serializeNextFamilyReadinessJson(report),
      },
      {
        outputPath: report.htmlOutputPath,
        data: serializeNextFamilyReadinessHtml(report),
      },
    ]);

    io.writeStdout(
      `${stableStringify({
        analysisVersion: report.analysisVersion,
        reportIdentityHash: report.reportIdentityHash,
        selectionStatus: report.selectionStatus,
        recommendedFamily: report.recommendedFamily,
        familiesEvaluated: report.familiesEvaluated,
        confirmatoryReuseForbidden: report.confirmatoryReuseForbidden,
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
  const code = await runNextFamilyReadinessCommand(process.argv.slice(2), {
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
    writeFile: (path, data) => {
      writeFileSync(path, data, "utf8");
    },
    mkdirSync: (path, options) => {
      mkdirSync(path, options);
    },
    fileExists: (path) => existsSync(path),
    readFile: (path) => readFileSync(path, "utf8"),
    unlinkFile: (path) => {
      unlinkSync(path);
    },
    renameFile: (from, to) => {
      renameSync(from, to);
    },
  });
  process.exitCode = code;
}

if (
  import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith("buildNextFamilyReadiness.ts")
) {
  void main();
}
