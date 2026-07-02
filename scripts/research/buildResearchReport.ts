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
  buildResearchReportDocument,
  loadResearchReportInputs,
  serializeResearchReportHtml,
} from "@/lib/data/research/reports";

import { normalizeResearchReportArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseInputDirFromArgv,
  parseLeaderboardPathFromArgv,
  parseOutputPathFromArgv,
} from "./buildResearchReportTypes";
import type { BuildResearchReportCommandIo } from "./buildResearchReportTypes";

export function runBuildResearchReportCommand(
  argv: readonly string[],
  io: BuildResearchReportCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeResearchReportArgv(argv);
    const inputRoot = parseInputDirFromArgv(normalizedArgv);
    const leaderboardPath = parseLeaderboardPathFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const inputs = loadResearchReportInputs(io, {
      inputRoot,
      leaderboardPath,
    });

    const document = buildResearchReportDocument({
      generatedAt,
      inputRoot,
      leaderboardPath: inputs.leaderboardPath,
      inputs,
    });

    const html = serializeResearchReportHtml(document);
    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, html);

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          inputRoot,
          leaderboardPath: inputs.leaderboardPath,
          outputPath,
          hasData: document.hasData,
          strategyCount: document.strategySections.length,
          calibrationReportCount: document.calibrationReports.length,
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
  const exitCode = runBuildResearchReportCommand(process.argv.slice(2), {
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
  BuildResearchReportCommandError,
  formatStdoutOutput,
  parseInputDirFromArgv,
  parseLeaderboardPathFromArgv,
  parseOutputPathFromArgv,
} from "./buildResearchReportTypes";
