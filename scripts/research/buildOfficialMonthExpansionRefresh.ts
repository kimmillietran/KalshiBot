import { dirname } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";

import {
  buildDefaultOfficialMonthExpansionRefreshInputPaths,
  buildOfficialMonthExpansionRefreshReport,
  createOfficialMonthExpansionRefreshConfig,
  loadOfficialMonthExpansionRefreshArtifacts,
  resolveMonthsAddedAndDeepened,
  resolveOfficialMonthExpansionRefreshInputStatus,
  runExpansionPipeline,
  serializeMonthCoverageAuditHtml,
  serializeMonthCoverageAuditReport,
  serializeOfficialMonthExpansionRefreshHtml,
  serializeOfficialMonthExpansionRefreshReport,
} from "@/lib/data/research/officialMonthExpansionRefresh";
import {
  DEFAULT_MONTH_COVERAGE_AUDIT_HTML_OUTPUT_PATH,
  DEFAULT_MONTH_COVERAGE_AUDIT_OUTPUT_PATH,
} from "@/lib/data/research/officialMonthExpansionRefresh/officialMonthExpansionRefreshTypes";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  formatStdoutOutput,
  mapCommandError,
  parseExecuteImportFromArgv,
  parseHtmlOutputPathFromArgv,
  parseOutputPathFromArgv,
  parseRerunEvidenceChainFromArgv,
  readOptionalFlag,
} from "./buildOfficialMonthExpansionRefreshTypes";
import type { OfficialMonthExpansionRefreshCommandIo } from "./buildOfficialMonthExpansionRefreshTypes";

const execAsync = promisify(exec);

export function createDefaultShellRunner(cwd: string) {
  return async (command: string) => {
    try {
      const result = await execAsync(command, { cwd, maxBuffer: 10 * 1024 * 1024 });
      return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const execError = error as { code?: number; stdout?: string; stderr?: string };
      return {
        exitCode: typeof execError.code === "number" ? execError.code : 1,
        stdout: execError.stdout ?? "",
        stderr: execError.stderr ?? (error instanceof Error ? error.message : "command failed"),
      };
    }
  };
}

export async function runOfficialMonthExpansionRefreshCommand(
  argv: readonly string[],
  io: OfficialMonthExpansionRefreshCommandIo,
  options?: { generatedAt?: string; cwd?: string },
): Promise<number> {
  try {
    const outputPath = parseOutputPathFromArgv(argv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(argv);
    const researchResultsDir =
      readOptionalFlag(argv, "--research-results-dir") ?? "data/research-results";
    const inputPaths = buildDefaultOfficialMonthExpansionRefreshInputPaths({
      researchResultsDir,
    });
    const executeImport = parseExecuteImportFromArgv(argv);
    const rerunEvidenceChain = parseRerunEvidenceChainFromArgv(argv);
    const sensitiveMonth = readOptionalFlag(argv, "--sensitive-month") ?? "2025-12";
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const config = createOfficialMonthExpansionRefreshConfig({ sensitiveMonth });

    const artifactsBefore = loadOfficialMonthExpansionRefreshArtifacts({ inputPaths, io });
    const beforeCapturedAt = generatedAt;

    let expansionExecution = await runExpansionPipeline({
      researchResultsDir,
      executeImport,
      rerunEvidenceChain,
      runCommand: io.runCommand,
    });

    const artifactsAfter = loadOfficialMonthExpansionRefreshArtifacts({ inputPaths, io });
    const afterCapturedAt = new Date().toISOString();
    const inputStatus = resolveOfficialMonthExpansionRefreshInputStatus(io, inputPaths);

    const report = buildOfficialMonthExpansionRefreshReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      inputStatus,
      config,
      beforeCapturedAt,
      afterCapturedAt,
      artifactsBefore,
      artifactsAfter,
      expansionExecution,
    });

    const monthCountsBefore = new Map(
      (artifactsBefore.historicalCoveragePlan?.snapshot.monthCoverage ?? []).map(
        (entry) => [entry.month, entry.marketCount],
      ),
    );
    const monthCountsAfter = new Map(
      (artifactsAfter.historicalCoveragePlan?.snapshot.monthCoverage ?? []).map(
        (entry) => [entry.month, entry.marketCount],
      ),
    );
    const { monthsAdded, monthsDeepened } = resolveMonthsAddedAndDeepened({
      beforeCalendarMonths: report.before.calendarMonthsCovered,
      afterCalendarMonths: report.after.calendarMonthsCovered,
      beforeMarketCountByMonth: monthCountsBefore,
      afterMarketCountByMonth: monthCountsAfter,
    });
    expansionExecution = {
      ...expansionExecution,
      monthsAdded,
      monthsDeepened,
    };
    const finalReport = buildOfficialMonthExpansionRefreshReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      inputStatus,
      config,
      beforeCapturedAt,
      afterCapturedAt,
      artifactsBefore,
      artifactsAfter,
      expansionExecution,
    });

    const auditOutputPath =
      readOptionalFlag(argv, "--audit-output") ?? DEFAULT_MONTH_COVERAGE_AUDIT_OUTPUT_PATH;
    const auditHtmlOutputPath =
      readOptionalFlag(argv, "--audit-html-output")
      ?? DEFAULT_MONTH_COVERAGE_AUDIT_HTML_OUTPUT_PATH;

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.mkdirSync(dirname(auditOutputPath), { recursive: true });
    io.mkdirSync(dirname(auditHtmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeOfficialMonthExpansionRefreshReport(finalReport));
    io.writeFile(htmlOutputPath, serializeOfficialMonthExpansionRefreshHtml(finalReport));
    io.writeFile(
      auditOutputPath,
      serializeMonthCoverageAuditReport(finalReport.monthCoverageAudit),
    );
    io.writeFile(
      auditHtmlOutputPath,
      serializeMonthCoverageAuditHtml(finalReport.monthCoverageAudit),
    );

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: finalReport.outputPath,
          htmlOutputPath: finalReport.htmlOutputPath,
          finalRecommendation: finalReport.finalRecommendation,
          recommendFullM12: finalReport.recommendFullM12,
          monthsAdded: finalReport.expansionExecution.monthsAdded,
          monthsDeepened: finalReport.expansionExecution.monthsDeepened,
          importableOfficialMonths: finalReport.monthCoverageAudit.importableOfficialMonths,
          beforeFamilyNetPnlCents: finalReport.before.familyNetPnlCents,
          afterFamilyNetPnlCents: finalReport.after.familyNetPnlCents,
          afterExcludingSensitiveMonthNetPnlCents:
            finalReport.after.excludingSensitiveMonthNetPnlCents,
        }),
      ),
    );

    return expansionExecution.succeeded ? 0 : 1;
  } catch (error) {
    io.writeStderr(`${mapCommandError(error)}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const exitCode = await runOfficialMonthExpansionRefreshCommand(process.argv.slice(2), {
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
    runCommand: createDefaultShellRunner(cwd),
  }, { cwd });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  void main();
}
