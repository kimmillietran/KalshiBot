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
  buildEventStudyReportFromDirectories,
  readEventsFile,
  serializeEventStudyReport,
} from "@/lib/data/research/eventStudy";

import { normalizeEventStudyArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseEventsPathFromArgv,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
} from "./buildEventStudyTypes";
import type { EventStudyCommandIo } from "./buildEventStudyTypes";

export function runEventStudyCommand(
  argv: readonly string[],
  io: EventStudyCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeEventStudyArgv(argv);
    const inputRoot = parseInputDirFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const eventsPath = parseEventsPathFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const events = readEventsFile(eventsPath, (path) => io.readFile(path));

    const report = buildEventStudyReportFromDirectories(
      inputRoot,
      outputPath,
      eventsPath,
      io,
      {
        generatedAt,
        events,
      },
    );

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeEventStudyReport(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          inputRoot: report.inputRoot,
          outputPath: report.outputPath,
          eventsPath: report.eventsPath,
          eventCount: report.sampleCounts.eventCount,
          analyzedMarketCount: report.sampleCounts.analyzedMarketCount,
          warningCount: report.warnings.length,
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
  const exitCode = runEventStudyCommand(process.argv.slice(2), {
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
  parseEventsPathFromArgv,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
  EventStudyCommandError,
} from "./buildEventStudyTypes";
