import { spawnSync } from "node:child_process";

import { buildTsxArgs, resolveNpxCommand } from "./childProcess";

export type CommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
};

export type RunTsxResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type OperatorCommandRunner = {
  runTsx: (scriptPath: string, argv: readonly string[]) => Promise<RunTsxResult>;
};

export function createDefaultCommandRunner(io: CommandIo): OperatorCommandRunner {
  return {
    async runTsx(scriptPath, argv) {
      const npx = resolveNpxCommand();
      const args = buildTsxArgs(scriptPath, argv);
      const result = spawnSync(npx, args, {
        encoding: "utf8",
        env: process.env,
        shell: process.platform === "win32",
      });

      const stdout = result.stdout ?? "";
      const stderr = result.stderr ?? "";
      if (stdout) {
        io.writeStdout(stdout.endsWith("\n") ? stdout : `${stdout}\n`);
      }
      if (stderr) {
        io.writeStderr(stderr.endsWith("\n") ? stderr : `${stderr}\n`);
      }

      if (result.error) {
        io.writeStderr(`${result.error.message}\n`);
        return { exitCode: 1, stdout, stderr: `${stderr}${result.error.message}\n` };
      }

      return {
        exitCode: result.status ?? 1,
        stdout,
        stderr,
      };
    },
  };
}

export function createPlanOnlyRunner(io: CommandIo): OperatorCommandRunner {
  return {
    async runTsx(scriptPath, argv) {
      const planned = `PLAN: npx tsx ${scriptPath} ${argv.join(" ")}`.trimEnd();
      io.writeStdout(`${planned}\n`);
      return { exitCode: 0, stdout: `${planned}\n`, stderr: "" };
    },
  };
}
