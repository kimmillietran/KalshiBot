import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import {
  createNpmScriptRunner,
} from "@/lib/data/research/pipeline";
import {
  parseFullResearchOrchestratorConfigFromArgv,
  runFullResearchOrchestrator,
  serializeFullResearchSummary,
} from "@/lib/data/research/fullOrchestrator";

import { normalizeFullResearchOrchestratorArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  loadRegisteredNpmScriptsFromPackageJson,
  mapCommandError,
} from "./runFullResearchOrchestratorTypes";
import type { FullResearchOrchestratorCommandIo } from "./runFullResearchOrchestratorTypes";

export function runFullResearchOrchestratorCommand(
  argv: readonly string[],
  io: FullResearchOrchestratorCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  return (async () => {
    try {
      const normalizedArgv = normalizeFullResearchOrchestratorArgv(argv);
      const config = parseFullResearchOrchestratorConfigFromArgv(normalizedArgv);
      const generatedAt = options?.generatedAt ?? new Date().toISOString();
      const runner = io.runner ?? createNpmScriptRunner();
      const registeredNpmScripts =
        io.registeredNpmScripts ?? loadRegisteredNpmScriptsFromPackageJson();

      const { summary, exitCode } = await runFullResearchOrchestrator({
        config,
        generatedAt,
        runner,
        log: (message) => {
          io.writeStdout(`${message}\n`);
        },
        outputIo: {
          fileExists: (path) => io.fileExists(path),
        },
        isNpmScriptRegistered: (npmScript) => registeredNpmScripts.has(npmScript),
      });

      io.mkdirSync(dirname(config.summaryOutputPath), { recursive: true });
      io.writeFile(config.summaryOutputPath, serializeFullResearchSummary(summary));

      io.writeStdout(
        formatStdoutOutput(
          JSON.stringify({
            outputPath: config.summaryOutputPath,
            status: summary.status,
            stepCount: summary.steps.length,
            failedSteps: summary.steps.filter((step) => step.status === "failed").length,
            skippedSteps: summary.steps.filter((step) => step.status === "skipped").length,
          }),
        ),
      );

      return exitCode;
    } catch (error) {
      io.writeStderr(`${mapCommandError(error)}\n`);
      return 1;
    }
  })();
}

function main(): void {
  void runFullResearchOrchestratorCommand(process.argv.slice(2), {
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
    fileExists: (path) => existsSync(path),
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  formatStdoutOutput,
  mapCommandError,
  FullResearchOrchestratorCommandError,
} from "./runFullResearchOrchestratorTypes";
