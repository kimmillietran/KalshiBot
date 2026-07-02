import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

import type { ResearchPipelineRunner } from "./researchPipelineTypes";

export const PIPELINE_OUTPUT_TAIL_MAX_CHARS = 2_000;

export type NpmSpawnSpec = {
  command: string;
  args: string[];
  options: SpawnOptions;
};

/** Resolves a cross-platform spawn configuration for `npm run <script>`. */
export function resolveNpmSpawnSpec(
  npmScript: string,
  scriptArgs: readonly string[],
  platform: NodeJS.Platform = process.platform,
): NpmSpawnSpec {
  const npmArgs = ["run", npmScript, "--", ...scriptArgs];

  if (platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npm", ...npmArgs],
      options: {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    };
  }

  return {
    command: "npm",
    args: npmArgs,
    options: {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  };
}

export function tailCapturedOutput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.length <= PIPELINE_OUTPUT_TAIL_MAX_CHARS) {
    return trimmed;
  }

  return trimmed.slice(-PIPELINE_OUTPUT_TAIL_MAX_CHARS);
}

export function formatPipelineStepFailureMessage(input: {
  exitCode: number;
  stdout: string;
  stderr: string;
}): string {
  const stderr = input.stderr.trim();
  const stdout = input.stdout.trim();

  if (stderr && stdout) {
    return `${stderr}\n${stdout}`;
  }

  if (stderr) {
    return stderr;
  }

  if (stdout) {
    return stdout;
  }

  return `Step exited with code ${input.exitCode}`;
}

export function formatPipelineSpawnError(
  error: unknown,
  command: string,
): string {
  if (error instanceof Error) {
    const errnoException = error as NodeJS.ErrnoException;
    const code = errnoException.code ? `code=${errnoException.code}` : null;
    const errno =
      typeof errnoException.errno === "number"
        ? `errno=${errnoException.errno}`
        : null;
    const details = [error.message, code, errno].filter(Boolean).join("; ");

    return `Failed to spawn pipeline step (${details}). Command: ${command}`;
  }

  return `Failed to spawn pipeline step. Command: ${command}`;
}

export type SpawnNpmScriptDeps = {
  platform?: NodeJS.Platform;
  spawnImpl?: typeof spawn;
  onStderrChunk?: (chunk: string) => void;
};

function collectChildOutput(
  child: ChildProcess,
  onStderrChunk?: (chunk: string) => void,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      stderr += text;
      onStderrChunk?.(text);
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

/** Spawns `npm run <script>` and captures stdout/stderr. */
export async function spawnNpmScript(
  npmScript: string,
  scriptArgs: readonly string[],
  deps: SpawnNpmScriptDeps = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const platform = deps.platform ?? process.platform;
  const spawnImpl = deps.spawnImpl ?? spawn;
  const spec = resolveNpmSpawnSpec(npmScript, scriptArgs, platform);
  const child = spawnImpl(spec.command, spec.args, spec.options);

  return collectChildOutput(child, deps.onStderrChunk);
}

export function createNpmScriptRunner(
  deps: SpawnNpmScriptDeps = {},
): ResearchPipelineRunner {
  const streamStderr =
    deps.onStderrChunk
    ?? ((chunk: string) => {
      process.stderr.write(chunk);
    });

  return (npmScript, scriptArgs) =>
    spawnNpmScript(npmScript, scriptArgs, {
      ...deps,
      onStderrChunk: streamStderr,
    });
}
