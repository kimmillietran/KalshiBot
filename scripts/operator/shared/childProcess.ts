import { createWriteStream, type WriteStream } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";

export type SpawnTeeResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

export type SpawnTeeOptions = {
  command: string;
  args: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  logPath: string;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  signalHandlers?: boolean;
};

function waitForStreamEnd(stream: Readable): Promise<void> {
  if (stream.readableEnded || stream.destroyed) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const finish = (): void => {
      resolve();
    };
    stream.once("end", finish);
    stream.once("close", finish);
    stream.once("error", finish);
  });
}

/**
 * Spawn a child process, stream stdout/stderr live, tee both to one UTF-8 log,
 * forward SIGINT/SIGTERM, wait for writers to drain, and preserve exit/signal.
 */
export async function spawnWithTee(
  options: SpawnTeeOptions,
): Promise<SpawnTeeResult> {
  const logStream: WriteStream = createWriteStream(options.logPath, {
    flags: "a",
    encoding: "utf8",
  });

  await new Promise<void>((resolve, reject) => {
    logStream.once("open", () => resolve());
    logStream.once("error", reject);
    // If the stream opened synchronously before listeners attached.
    if (typeof logStream.fd === "number" && logStream.fd >= 0) {
      resolve();
    }
  }).catch(() => undefined);

  let stdout = "";
  let stderr = "";
  let settled = false;

  const child: ChildProcess = spawn(
    options.command,
    [...options.args],
    {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  if (!child.stdout || !child.stderr) {
    throw new Error("spawnWithTee requires piped stdout and stderr");
  }

  const childStdout = child.stdout;
  const childStderr = child.stderr;

  const forwardSignal = (signal: NodeJS.Signals): void => {
    if (!child.killed) {
      try {
        child.kill(signal);
      } catch {
        // Child may have already exited.
      }
    }
  };

  const onSigInt = (): void => {
    forwardSignal("SIGINT");
  };
  const onSigTerm = (): void => {
    forwardSignal("SIGTERM");
  };

  if (options.signalHandlers !== false) {
    process.on("SIGINT", onSigInt);
    process.on("SIGTERM", onSigTerm);
  }

  const writeLog = (chunk: string): void => {
    if (!logStream.destroyed && !logStream.writableEnded) {
      logStream.write(chunk);
    }
  };

  childStdout.setEncoding("utf8");
  childStderr.setEncoding("utf8");

  const stdoutEnded = waitForStreamEnd(childStdout);
  const stderrEnded = waitForStreamEnd(childStderr);

  childStdout.on("data", (chunk: string) => {
    stdout += chunk;
    process.stdout.write(chunk);
    writeLog(chunk);
    options.onStdoutChunk?.(chunk);
  });

  childStderr.on("data", (chunk: string) => {
    stderr += chunk;
    process.stderr.write(chunk);
    writeLog(chunk);
    options.onStderrChunk?.(chunk);
  });

  const childExit = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("close", (code, signal) => {
      resolve({ code, signal });
    });
  });

  try {
    const [{ code, signal }] = await Promise.all([
      childExit,
      stdoutEnded,
      stderrEnded,
    ]);

    await new Promise<void>((resolve, reject) => {
      if (logStream.destroyed || logStream.writableEnded) {
        resolve();
        return;
      }
      logStream.end(() => resolve());
      logStream.once("error", reject);
    });

    return {
      exitCode: code,
      signal,
      stdout,
      stderr,
    };
  } finally {
    if (options.signalHandlers !== false) {
      process.off("SIGINT", onSigInt);
      process.off("SIGTERM", onSigTerm);
    }
    if (!logStream.destroyed && !logStream.writableEnded) {
      logStream.destroy();
    }
  }
}

export function resolveNpxCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

export function buildTsxArgs(scriptPath: string, scriptArgv: readonly string[]): string[] {
  return ["tsx", scriptPath, ...scriptArgv];
}
