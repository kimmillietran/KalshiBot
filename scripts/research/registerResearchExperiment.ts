import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import {
  parseExperimentManagerConfigFromArgv,
  registerResearchExperiment,
  serializeExperimentIndex,
  serializeExperimentManagerHtml,
  serializeExperimentRecord,
} from "@/lib/data/research/experimentManager";

import { normalizeResearchExperimentArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
} from "./registerResearchExperimentTypes";
import type { ResearchExperimentCommandIo } from "./registerResearchExperimentTypes";

function resolveGitCommitFromShell(): string | null {
  try {
    const commit = execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    return commit.length > 0 ? commit : null;
  } catch {
    return null;
  }
}

export function runResearchExperimentCommand(
  argv: readonly string[],
  io: ResearchExperimentCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeResearchExperimentArgv(argv);
    const config = parseExperimentManagerConfigFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const result = registerResearchExperiment({
      generatedAt,
      inputPaths: config.inputPaths,
      experimentsDir: config.experimentsDir,
      indexOutputPath: config.indexOutputPath,
      htmlOutputPath: config.htmlOutputPath,
      gitCommit: io.resolveGitCommit?.() ?? null,
      io,
    });

    io.mkdirSync(dirname(result.record.recordPath), { recursive: true });
    io.mkdirSync(dirname(config.indexOutputPath), { recursive: true });
    io.mkdirSync(dirname(config.htmlOutputPath), { recursive: true });

    io.writeFile(result.record.recordPath, serializeExperimentRecord(result.record));
    io.writeFile(result.indexOutputPath, serializeExperimentIndex(result.index));
    io.writeFile(
      config.htmlOutputPath,
      serializeExperimentManagerHtml(result.index, io),
    );

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          experimentId: result.record.experimentId,
          recordPath: result.record.recordPath,
          indexOutputPath: result.indexOutputPath,
          htmlOutputPath: config.htmlOutputPath,
          latestExperimentId: result.index.latestExperimentId,
          experimentCount: result.index.experiments.length,
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
  const exitCode = runResearchExperimentCommand(process.argv.slice(2), {
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
    resolveGitCommit: resolveGitCommitFromShell,
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  formatStdoutOutput,
  mapCommandError,
  ResearchExperimentCommandError,
} from "./registerResearchExperimentTypes";
