import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";

import {
  buildExpansionImportPerformanceAudit,
  parseExpansionImportPerformanceAuditConfigFromArgv,
  serializeExpansionImportPerformanceAudit,
  serializeExpansionImportPerformanceAuditHtml,
} from "@/lib/data/research/expansionImportPerformanceAudit";

import { normalizeExpansionImportPerformanceAuditArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
} from "./buildExpansionImportPerformanceAuditTypes";
import type { ExpansionImportPerformanceAuditCommandIo } from "./buildExpansionImportPerformanceAuditTypes";

export function runExpansionImportPerformanceAuditCommand(
  argv: readonly string[],
  io: ExpansionImportPerformanceAuditCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeExpansionImportPerformanceAuditArgv(argv);
    const config = parseExpansionImportPerformanceAuditConfigFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildExpansionImportPerformanceAudit({
      generatedAt,
      config,
      io: {
        readFile: io.readFile,
        fileExists: io.fileExists,
        readdir: io.readdir,
        isDirectory: io.isDirectory,
      },
    });

    io.mkdirSync(dirname(config.outputPath), { recursive: true });
    io.mkdirSync(dirname(config.htmlOutputPath), { recursive: true });
    io.writeFile(config.outputPath, serializeExpansionImportPerformanceAudit(report));
    io.writeFile(config.htmlOutputPath, serializeExpansionImportPerformanceAuditHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          totalElapsedMs: report.summaryMetrics.totalElapsedMs,
          importsPerMinute: report.summaryMetrics.importsPerMinute,
          rateLimitedCount: report.summaryMetrics.rateLimitedCount,
          backoffDurationMs: report.summaryMetrics.backoffDurationMs,
          optimizationCount: report.recommendations.optimizations.length,
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
  const exitCode = runExpansionImportPerformanceAuditCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
    readdir: (path) => readdirSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
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
