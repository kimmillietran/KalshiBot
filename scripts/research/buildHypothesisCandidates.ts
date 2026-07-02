import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  buildHypothesisCandidates,
  loadHypothesisCandidateInputs,
  serializeHypothesisCandidatesReport,
} from "@/lib/data/research/hypothesisCandidates";

import { normalizeHypothesisCandidatesArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseArtifactPathsFromArgv,
  parseMinSampleFromArgv,
  parseOutputPathFromArgv,
} from "./buildHypothesisCandidatesTypes";
import type { HypothesisCandidatesCommandIo } from "./buildHypothesisCandidatesTypes";

export function runHypothesisCandidatesCommand(
  argv: readonly string[],
  io: HypothesisCandidatesCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeHypothesisCandidatesArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const artifactPaths = parseArtifactPathsFromArgv(normalizedArgv);
    const minSampleSize = parseMinSampleFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const { inputs, inputStatus } = loadHypothesisCandidateInputs(io, artifactPaths);

    const report = buildHypothesisCandidates({
      generatedAt,
      outputPath,
      inputs,
      inputStatus,
      config: { minSampleSize },
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeHypothesisCandidatesReport(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath,
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
  parseMinSampleFromArgv,
  parseOutputPathFromArgv,
  HypothesisCandidatesCommandError,
} from "./buildHypothesisCandidatesTypes";
