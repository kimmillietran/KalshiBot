import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildResearchPerformanceAudit,
  parseResearchPerformanceAuditConfigFromArgv,
  serializeResearchPerformanceAudit,
  serializeResearchPerformanceAuditHtml,
} from "@/lib/data/research/performanceAudit";

import { normalizeResearchPerformanceAuditArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
} from "./buildResearchPerformanceAuditTypes";
import type { ResearchPerformanceAuditCommandIo } from "./buildResearchPerformanceAuditTypes";

export function runResearchPerformanceAuditCommand(
  argv: readonly string[],
  io: ResearchPerformanceAuditCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeResearchPerformanceAuditArgv(argv);
    const config = parseResearchPerformanceAuditConfigFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildResearchPerformanceAudit({
      generatedAt,
      config,
      io: {
        readFile: io.readFile,
        fileExists: io.fileExists,
      },
    });

    io.mkdirSync(dirname(config.outputPath), { recursive: true });
    io.mkdirSync(dirname(config.htmlOutputPath), { recursive: true });
    io.writeFile(config.outputPath, serializeResearchPerformanceAudit(report));
    io.writeFile(config.htmlOutputPath, serializeResearchPerformanceAuditHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          totalRuntimeMs: report.summary.totalRuntimeMs,
          estimatedParallelRuntimeMs: report.summary.estimatedParallelRuntimeMs,
          opportunityCount: report.optimizationOpportunities.length,
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
  const exitCode = runResearchPerformanceAuditCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
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
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}
