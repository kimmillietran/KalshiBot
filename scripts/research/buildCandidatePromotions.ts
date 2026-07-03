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
  buildCandidatePromotionReport,
  loadCandidatePromotionInputs,
  parseCandidatePromotionConfigFromArgv,
  serializeCandidatePromotionHtml,
  serializeCandidatePromotionReport,
} from "@/lib/data/research/candidatePromotion";

import { normalizeCandidatePromotionArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
} from "./buildCandidatePromotionsTypes";
import type { CandidatePromotionCommandIo } from "./buildCandidatePromotionsTypes";

export function runCandidatePromotionCommand(
  argv: readonly string[],
  io: CandidatePromotionCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeCandidatePromotionArgv(argv);
    const { outputPath, htmlOutputPath, inputPaths } =
      parseCandidatePromotionConfigFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const inputs = loadCandidatePromotionInputs(io, inputPaths);
    const report = buildCandidatePromotionReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      inputs,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeCandidatePromotionReport(report));
    io.writeFile(htmlOutputPath, serializeCandidatePromotionHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath,
          htmlOutputPath,
          totalStrategies: report.summary.totalStrategies,
          watchlistCount: report.summary.watchlistCount,
          rejectedCount: report.summary.rejectedCount,
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
  const exitCode = runCandidatePromotionCommand(process.argv.slice(2), {
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
    readFile: (path) => readFileSync(path, "utf8"),
    fileExists: (path) => existsSync(path),
    readdir: (path) => readdirSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  formatStdoutOutput,
  mapCommandError,
  CandidatePromotionCommandError,
} from "./buildCandidatePromotionsTypes";
