import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";

import {
  buildVolPremiumStudyFromDirectories,
  serializeVolPremiumStudy,
} from "@/lib/data/research/volPremium";

import { normalizeVolPremiumArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
} from "./buildVolPremiumStudyTypes";
import type { VolPremiumCommandIo } from "./buildVolPremiumStudyTypes";

export function runVolPremiumStudyCommand(
  argv: readonly string[],
  io: VolPremiumCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeVolPremiumArgv(argv);
    const inputRoot = parseInputDirFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const study = buildVolPremiumStudyFromDirectories(
      inputRoot,
      outputPath,
      io,
      { generatedAt },
    );

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeVolPremiumStudy(study));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          inputRoot,
          outputPath,
          totalObservations: study.sampleCounts.totalObservations,
          marketCount: study.sampleCounts.marketCount,
          warningCount: study.warnings.length,
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
  const exitCode = runVolPremiumStudyCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
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
    readdir: (path) => readdirSync(path),
    fileExists: (path) => existsSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  formatStdoutOutput,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
  VolPremiumCommandError,
} from "./buildVolPremiumStudyTypes";
