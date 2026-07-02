import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import {
  parseResearchPipelineConfigFromArgv,
  runResearchPipeline,
  serializeResearchPipelineSummary,
} from "@/lib/data/research/pipeline";

import { normalizeResearchPipelineArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
} from "./runResearchPipelineTypes";
import type { ResearchPipelineCommandIo } from "./runResearchPipelineTypes";

function createNpmRunner(): (
  npmScript: string,
  args: readonly string[],
) => Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return (npmScript, args) =>
    new Promise((resolve, reject) => {
      const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
      const child = spawn(npmCommand, ["run", npmScript, "--", ...args], {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
        });
      });
    });
}

export function runResearchPipelineCommand(
  argv: readonly string[],
  io: ResearchPipelineCommandIo,
  options?: { generatedAt?: string },
): Promise<number> {
  return (async () => {
    try {
      const normalizedArgv = normalizeResearchPipelineArgv(argv);
      const config = parseResearchPipelineConfigFromArgv(normalizedArgv);
      const generatedAt = options?.generatedAt ?? new Date().toISOString();
      const runner = io.runner ?? createNpmRunner();

      const { summary, exitCode } = await runResearchPipeline({
        config,
        generatedAt,
        runner,
        log: (message) => {
          io.writeStdout(`${message}\n`);
        },
      });

      io.mkdirSync(dirname(config.summaryOutputPath), { recursive: true });
      io.writeFile(
        config.summaryOutputPath,
        serializeResearchPipelineSummary(summary),
      );

      io.writeStdout(
        formatStdoutOutput(
          JSON.stringify({
            outputPath: config.summaryOutputPath,
            status: summary.status,
            stepCount: summary.steps.length,
            failedSteps: summary.steps.filter((step) => step.status === "failed").length,
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
  void runResearchPipelineCommand(process.argv.slice(2), {
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
  ResearchPipelineCommandError,
} from "./runResearchPipelineTypes";
