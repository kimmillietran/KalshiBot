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
  buildStatisticalSignificanceFromDirectories,
  DEFAULT_BOOTSTRAP_SEED,
  DEFAULT_BOOTSTRAP_SIMULATION_COUNT,
  serializeStatisticalSignificanceReport,
} from "@/lib/data/research/statisticalSignificance";

import { normalizeStatisticalSignificanceArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
  parseSeedFromArgv,
  parseSimulationCountFromArgv,
} from "./buildStatisticalSignificanceTypes";
import type { StatisticalSignificanceCommandIo } from "./buildStatisticalSignificanceTypes";

export function runStatisticalSignificanceCommand(
  argv: readonly string[],
  io: StatisticalSignificanceCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeStatisticalSignificanceArgv(argv);
    const inputRoot = parseInputDirFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const seed = parseSeedFromArgv(normalizedArgv, DEFAULT_BOOTSTRAP_SEED);
    const simulationCount = parseSimulationCountFromArgv(
      normalizedArgv,
      DEFAULT_BOOTSTRAP_SIMULATION_COUNT,
    );
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildStatisticalSignificanceFromDirectories(
      inputRoot,
      outputPath,
      io,
      {
        generatedAt,
        config: {
          seed,
          simulationCount,
        },
      },
    );

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeStatisticalSignificanceReport(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          inputRoot: report.inputRoot,
          outputPath: report.outputPath,
          strategyCount: report.strategies.length,
          seed: report.config.seed,
          simulationCount: report.config.simulationCount,
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
  const exitCode = runStatisticalSignificanceCommand(process.argv.slice(2), {
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
  parseSeedFromArgv,
  parseSimulationCountFromArgv,
  StatisticalSignificanceCommandError,
} from "./buildStatisticalSignificanceTypes";
