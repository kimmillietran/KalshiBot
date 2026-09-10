import { dirname } from "node:path";

import { publishResearchArtifactsAtomically } from "@/lib/data/research/calibrationFadeForwardValidation/publishResearchArtifactsAtomically";
import {
  buildMicrostructureGovernedDiscoveryReport,
  createFilesystemMicrostructureDiscoveryIo,
  parseMicrostructureDiscoveryArgv,
  serializeMicrostructureDiscoveryHtml,
  serializeMicrostructureDiscoveryJson,
} from "@/lib/data/research/spreadLiquidityMicrostructureDiscovery";
import { stableStringify } from "@/lib/trading/config/hashConfig";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

export async function runSpreadLiquidityMicrostructureDiscoveryCommand(
  argv: readonly string[],
  options?: { generatedAt?: string },
): Promise<number> {
  try {
    const parsed = parseMicrostructureDiscoveryArgv(argv);
    const io = createFilesystemMicrostructureDiscoveryIo();
    const report = await buildMicrostructureGovernedDiscoveryReport({
      io,
      trainCaptureRunDir: parsed.trainCaptureRunDir,
      validationCaptureRunDir: parsed.validationCaptureRunDir,
      holdoutCaptureRunDir: parsed.holdoutCaptureRunDir,
      outputPath: parsed.outputPath,
      htmlOutputPath: parsed.htmlOutputPath,
      generatedAt: options?.generatedAt,
      log: (message) => {
        process.stderr.write(`${message}\n`);
      },
    });

    io.mkdirSync(dirname(report.outputPaths.outputPath), { recursive: true });
    io.mkdirSync(dirname(report.outputPaths.htmlOutputPath), { recursive: true });

    const publishIo = {
      writeFile: (path: string, data: string) => writeFileSync(path, data, "utf8"),
      fileExists: (path: string) => existsSync(path),
      renameFile: (from: string, to: string) => renameSync(from, to),
      unlinkFile: (path: string) => unlinkSync(path),
      mkdirSync: (path: string, opts?: { recursive?: boolean }) => mkdirSync(path, opts),
      readFile: (path: string) => readFileSync(path, "utf8"),
    };

    // Persist split + cells + report.
    io.writeFile(
      report.outputPaths.splitManifestPath,
      `${stableStringify({
        splitManifestIdentity: report.splitManifestIdentity,
        familyDefinitionIdentity: report.familyDefinitionIdentity,
        evidenceContractIdentity: report.evidenceContractIdentity,
        contaminationAudit: report.contaminationAudit,
        trainRunId: report.trainRunId,
      })}\n`,
    );
    io.writeFile(
      report.outputPaths.cellsOutputPath,
      `${report.perCandidateResults.map((row) => stableStringify(row)).join("\n")}\n`,
    );

    publishResearchArtifactsAtomically(publishIo, [
      {
        outputPath: report.outputPaths.outputPath,
        data: serializeMicrostructureDiscoveryJson(report),
      },
      {
        outputPath: report.outputPaths.htmlOutputPath,
        data: serializeMicrostructureDiscoveryHtml(report),
      },
    ]);

    process.stdout.write(
      `${stableStringify({
        analysisVersion: report.analysisVersion,
        discoveryIdentity: report.discoveryIdentity,
        familyDefinitionIdentity: report.familyDefinitionIdentity,
        evidenceContractIdentity: report.evidenceContractIdentity,
        splitManifestIdentity: report.splitManifestIdentity,
        discoveryStatus: report.discoveryStatus,
        recommendedNextAction: report.recommendedNextAction,
        shortlist: report.shortlist.map((row) => ({
          candidateId: row.candidateId,
          ess: row.effectiveSampleSize,
          medianExec: row.signedExecutableMedianCents,
        })),
        quarantine: report.quarantine,
        outputPath: report.outputPaths.outputPath,
      })}\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const code = await runSpreadLiquidityMicrostructureDiscoveryCommand(process.argv.slice(2));
  process.exitCode = code;
}

if (
  import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith("buildSpreadLiquidityMicrostructureDiscovery.ts")
) {
  void main();
}
