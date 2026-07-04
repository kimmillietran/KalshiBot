import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";

import { scanCalibrationResearchOutputs } from "@/lib/data/research/calibration/scanCalibrationResearchOutputs";
import {
  buildHypothesisCandidates,
  loadHypothesisCandidateInputs,
  serializeHypothesisCandidatesReport,
} from "@/lib/data/research/hypothesisCandidates";
import {
  buildHypothesisEvidenceReport,
  serializeHypothesisEvidenceHtml,
} from "@/lib/data/research/hypothesisEvidence";

import { normalizeHypothesisCandidatesArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseArtifactPathsFromArgv,
  parseHtmlOutputPathFromArgv,
  parseMinSampleFromArgv,
  parseMinUniqueTradingDaysFromArgv,
  parseOutputPathFromArgv,
  parseResearchInputRootFromArgv,
} from "./buildHypothesisCandidatesTypes";
import type { HypothesisCandidatesCommandIo } from "./buildHypothesisCandidatesTypes";

function resolveResearchInputRoot(
  inputs: Awaited<ReturnType<typeof loadHypothesisCandidateInputs>>["inputs"],
  cliRoot: string,
): string {
  return (
    inputs.mispricingAtlas?.inputRoot
    ?? inputs.leadLagAnalysis?.inputRoot
    ?? cliRoot
  );
}

function listResearchOutputPaths(root: string, io: HypothesisCandidatesCommandIo): string[] {
  try {
    const scanned = scanCalibrationResearchOutputs(root, {
      readFile: io.readFile,
      fileExists: io.fileExists,
      isDirectory: (path) => {
        try {
          return statSync(path).isDirectory();
        } catch {
          return false;
        }
      },
      readdir: (path) => readdirSync(path),
    });

    return scanned.map((entry) => entry.outputPath);
  } catch {
    return [];
  }
}

export function runHypothesisCandidatesCommand(
  argv: readonly string[],
  io: HypothesisCandidatesCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeHypothesisCandidatesArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
    const researchInputRoot = parseResearchInputRootFromArgv(normalizedArgv);
    const artifactPaths = parseArtifactPathsFromArgv(normalizedArgv);
    const minSampleSize = parseMinSampleFromArgv(normalizedArgv);
    const minUniqueTradingDays = parseMinUniqueTradingDaysFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const { inputs, inputStatus } = loadHypothesisCandidateInputs(io, artifactPaths);

    const report = buildHypothesisCandidates({
      generatedAt,
      outputPath,
      inputs,
      inputStatus,
      config: { minSampleSize, minUniqueTradingDays },
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeHypothesisCandidatesReport(report));

    const resolvedResearchRoot = resolveResearchInputRoot(
      inputs,
      researchInputRoot,
    );
    const evidenceReport = buildHypothesisEvidenceReport({
      generatedAt,
      htmlOutputPath,
      candidatesReport: report,
      mispricingAtlas: inputs.mispricingAtlas,
      leadLagAnalysis: inputs.leadLagAnalysis,
      statisticalSignificance: inputs.statisticalSignificance,
      researchInputRoot: resolvedResearchRoot,
      readFile: io.readFile,
      listResearchOutputPaths: (root) => listResearchOutputPaths(root, io),
    });
    const html = serializeHypothesisEvidenceHtml(evidenceReport);

    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(htmlOutputPath, html);

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath,
          htmlOutputPath,
          candidateCount: report.summary.candidateCount,
          noCandidateReasons: report.summary.noCandidateReasons,
        }),
      ),
    );

    return 0;
  } catch (error) {
    io.writeStderr(`${mapCommandError(error)}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runHypothesisCandidatesCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
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
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  formatStdoutOutput,
  parseArtifactPathsFromArgv,
  parseHtmlOutputPathFromArgv,
  parseMinSampleFromArgv,
  parseMinUniqueTradingDaysFromArgv,
  parseOutputPathFromArgv,
  parseResearchInputRootFromArgv,
  HypothesisCandidatesCommandError,
} from "./buildHypothesisCandidatesTypes";
