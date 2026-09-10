import { dirname } from "node:path";
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation/publishResearchArtifactsAtomically";
import {
  buildMicrostructureFamilyDefinitionReport,
  parseMicrostructureFamilyArgv,
  serializeMicrostructureFamilyDefinitionHtml,
  serializeMicrostructureFamilyDefinitionJson,
} from "@/lib/data/research/spreadLiquidityMicrostructureFamily";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type MicrostructureFamilyCommandIo = {
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

export async function runSpreadLiquidityMicrostructureFamilyCommand(
  argv: readonly string[],
  io: MicrostructureFamilyCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const parsed = parseMicrostructureFamilyArgv(argv);
    const report = buildMicrostructureFamilyDefinitionReport({
      config: {
        outputPath: parsed.outputPath,
        htmlOutputPath: parsed.htmlOutputPath,
      },
      generatedAt: options?.generatedAt ?? new Date().toISOString(),
    });

    io.mkdirSync(dirname(report.outputPaths.outputPath), { recursive: true });
    io.mkdirSync(dirname(report.outputPaths.htmlOutputPath), { recursive: true });

    publishResearchArtifactsAtomically(io, [
      {
        outputPath: report.outputPaths.outputPath,
        data: serializeMicrostructureFamilyDefinitionJson(report),
      },
      {
        outputPath: report.outputPaths.htmlOutputPath,
        data: serializeMicrostructureFamilyDefinitionHtml(report),
      },
    ]);

    io.writeStdout(
      `${stableStringify({
        analysisVersion: report.analysisVersion,
        familyId: report.familyId,
        subfamilyId: report.subfamilyId,
        familyDefinitionIdentityHash: report.familyDefinitionIdentityHash,
        hypothesisCount: report.searchUniverse.hypothesisCount,
        directionCount: report.searchUniverse.directionCount,
        quarantine: report.quarantine,
        outputPath: report.outputPaths.outputPath,
        htmlOutputPath: report.outputPaths.htmlOutputPath,
      })}\n`,
    );
    return 0;
  } catch (error) {
    io.writeStderr(`${formatCommandError(error)}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const code = await runSpreadLiquidityMicrostructureFamilyCommand(process.argv.slice(2), {
    writeStdout: (text) => process.stdout.write(text),
    writeStderr: (text) => process.stderr.write(text),
    writeFile: (path, data) => writeFileSync(path, data, "utf8"),
    mkdirSync: (path, options) => mkdirSync(path, options),
    fileExists: (path) => existsSync(path),
    unlinkFile: (path) => unlinkSync(path),
    renameFile: (from, to) => renameSync(from, to),
  });
  process.exitCode = code;
}

if (
  import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith("buildSpreadLiquidityMicrostructureFamily.ts")
) {
  void main();
}
