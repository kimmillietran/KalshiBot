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
  buildDataHealthReportFromPaths,
  serializeDataHealthReport,
} from "@/lib/data/research/dataHealth";

import { normalizeDataHealthArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseDiscoveryResultPathFromArgv,
  parseFixturesDirFromArgv,
  parseImportConfigsDirFromArgv,
  parseImportsDirFromArgv,
  parseLeaderboardPathFromArgv,
  parseOutputPathFromArgv,
  parseRegistryDirFromArgv,
  parseReportHtmlPathFromArgv,
  parseResearchResultsDirFromArgv,
} from "./buildDataHealthReportTypes";
import type { DataHealthCommandIo } from "./buildDataHealthReportTypes";

export function runDataHealthReportCommand(
  argv: readonly string[],
  io: DataHealthCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeDataHealthArgv(argv);
    const config = {
      discoveryResultPath: parseDiscoveryResultPathFromArgv(normalizedArgv),
      importsDir: parseImportsDirFromArgv(normalizedArgv),
      importConfigsDir: parseImportConfigsDirFromArgv(normalizedArgv),
      fixturesDir: parseFixturesDirFromArgv(normalizedArgv),
      registryDir: parseRegistryDirFromArgv(normalizedArgv),
      researchResultsDir: parseResearchResultsDirFromArgv(normalizedArgv),
      leaderboardPath: parseLeaderboardPathFromArgv(normalizedArgv),
      reportHtmlPath: parseReportHtmlPathFromArgv(normalizedArgv),
      outputPath: parseOutputPathFromArgv(normalizedArgv),
    };
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildDataHealthReportFromPaths(config, io, { generatedAt });

    io.mkdirSync(dirname(config.outputPath), { recursive: true });
    io.writeFile(config.outputPath, serializeDataHealthReport(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: report.outputPath,
          stageCount: report.stageStatuses.length,
          recommendationCount: report.recommendations.length,
          researchOutputs: report.pipelineCoverage.researchOutputs,
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
  const exitCode = runDataHealthReportCommand(process.argv.slice(2), {
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
    getLastModified: (path) => {
      if (!existsSync(path)) {
        return null;
      }
      return statSync(path).mtime.toISOString();
    },
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  DataHealthCommandError,
  formatStdoutOutput,
  parseDiscoveryResultPathFromArgv,
  parseFixturesDirFromArgv,
  parseImportConfigsDirFromArgv,
  parseImportsDirFromArgv,
  parseLeaderboardPathFromArgv,
  parseOutputPathFromArgv,
  parseRegistryDirFromArgv,
  parseReportHtmlPathFromArgv,
  parseResearchResultsDirFromArgv,
} from "./buildDataHealthReportTypes";
