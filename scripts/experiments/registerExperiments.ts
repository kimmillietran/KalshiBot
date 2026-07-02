import { dirname } from "node:path";
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";

import {
  ExperimentRegistryError,
  registerExperiments,
} from "@/lib/data/research/experiment-registry";

import {
  formatStdoutOutput,
  parseExperimentsRootFromArgv,
  parseFixturesRootFromArgv,
  parseResearchRootFromArgv,
  RegisterExperimentsCommandError,
} from "./registerExperimentsTypes";
import type { RegisterExperimentsCommandIo } from "./registerExperimentsTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof RegisterExperimentsCommandError) {
    return error.message;
  }

  if (error instanceof ExperimentRegistryError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Experiment registration failed";
}

function resolveGitCommitFromProcess(): string | null {
  try {
    const output = execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const commit = output.trim();
    return commit || null;
  } catch {
    return null;
  }
}

export function runRegisterExperimentsCommand(
  argv: readonly string[],
  io: RegisterExperimentsCommandIo,
  options?: { registeredAt?: string; gitCommit?: string | null },
): number {
  try {
    const researchRoot = parseResearchRootFromArgv(argv);
    const experimentsRoot = parseExperimentsRootFromArgv(argv);
    const fixturesRoot = parseFixturesRootFromArgv(argv);
    const registeredAt = options?.registeredAt ?? new Date().toISOString();
    const gitCommit =
      options?.gitCommit
      ?? io.resolveGitCommit?.()
      ?? resolveGitCommitFromProcess();

    const result = registerExperiments(
      {
        researchRoot,
        experimentsRoot,
        fixturesRoot,
        registeredAt,
        gitCommit,
      },
      {
        readdir: (path) => io.readdir(path),
        readFile: (path) => io.readFile(path),
        writeFile: (path, data) => {
          io.mkdirSync(dirname(path), { recursive: true });
          io.writeFile(path, data);
        },
        fileExists: (path) => io.fileExists(path),
        isDirectory: (path) => io.isDirectory(path),
        resolveGitCommit: io.resolveGitCommit,
      },
    );

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          researchRoot,
          experimentsRoot,
          fixturesRoot,
          registeredCount: result.registeredCount,
          skippedCount: result.skippedCount,
          experimentIds: result.experimentIds,
          outputPaths: result.outputPaths,
        }),
      ),
    );

    return 0;
  } catch (error) {
    const message = mapCommandError(error);
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runRegisterExperimentsCommand(process.argv.slice(2), {
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
    resolveGitCommit: resolveGitCommitFromProcess,
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  formatStdoutOutput,
  parseExperimentsRootFromArgv,
  parseFixturesRootFromArgv,
  parseResearchRootFromArgv,
  RegisterExperimentsCommandError,
} from "./registerExperimentsTypes";
