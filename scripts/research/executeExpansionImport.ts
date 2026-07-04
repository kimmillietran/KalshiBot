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
  createKalshiHistoricalMarketDiscoveryFromFetch,
  discoverKalshiHistoricalMarkets,
} from "@/lib/data/discovery";
import { runHistoricalImportFromConfig } from "@/lib/data/importJobs";
import type { HistoricalImportFetchLike } from "@/lib/data/importJobs";
import { buildExpansionImportReconciliationTraceCallbacks } from "@/lib/data/importJobs/expansionExecutor/expansionImportReconciliationTrace";
import type { FetchLike } from "@/lib/data/importers/kalshi";
import type { ExpansionExecutorDeps } from "@/lib/data/importJobs/expansionExecutor";
import {
  createSingleMarketExpansionImportDebugDepsFromFetch,
  ExpansionExecutorError,
  ExpansionExecutorErrorCode,
  runHistoricalExpansionImport,
  runSingleMarketExpansionImportDebug,
  serializeHistoricalExpansionImportSummary,
  serializeHistoricalExpansionImportSummaryHtml,
  serializeSingleMarketExpansionImportDebugHtml,
  serializeSingleMarketExpansionImportDebugReport,
} from "@/lib/data/importJobs/expansionExecutor";

import {
  createExpansionImportProgressReporter,
  isCliProgressTty,
} from "@/lib/cli/progress/expansionImportProgress";

import { normalizeExecuteExpansionImportArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseExecuteExpansionImportConfigFromArgv,
} from "./executeExpansionImportTypes";
import type { ExecuteExpansionImportCommandIo } from "./executeExpansionImportTypes";

function resolveFetchImpl(fetchImpl?: HistoricalImportFetchLike): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof globalThis.fetch !== "function") {
    throw new ExpansionExecutorError(
      "fetchImpl is required when global fetch is unavailable",
      ExpansionExecutorErrorCode.MISSING_EXPANSION_CONFIG,
    );
  }

  return globalThis.fetch.bind(globalThis);
}

function createProductionDeps(fetchImpl?: HistoricalImportFetchLike): ExpansionExecutorDeps {
  const discoveryOptions = createKalshiHistoricalMarketDiscoveryFromFetch(
    resolveFetchImpl(fetchImpl),
  );

  return {
    discoverMarkets: async (
      seriesTicker: string,
      sampling: { after: string; before: string },
    ) => {
      const result = await discoverKalshiHistoricalMarkets(
        {
          seriesTicker,
          sampling: {
            after: sampling.after,
            before: sampling.before,
          },
        },
        discoveryOptions,
      );

      return result.markets.map((market) => ({
        marketTicker: market.marketTicker,
        seriesTicker: market.seriesTicker,
        eventTicker: market.eventTicker,
        status: market.status,
        openTime: market.openTime,
        closeTime: market.closeTime,
        settlementTime: market.settlementTime,
        expirationValue: market.expirationValue,
        title: market.title,
        subtitle: market.subtitle,
        listMarketWire: market.listMarketWire,
        provenance: market.provenance,
      }));
    },
    runImport: (config, options) =>
      runHistoricalImportFromConfig({
        config,
        fetchImpl,
        reconciliationTrace: buildExpansionImportReconciliationTraceCallbacks(
          options?.reconciliationTrace ?? null,
        ),
      }),
  };
}

export async function runExecuteExpansionImportCommand(
  argv: readonly string[],
  io: ExecuteExpansionImportCommandIo,
  options?: {
    generatedAt?: string;
    fetchImpl?: HistoricalImportFetchLike;
    deps?: ExpansionExecutorDeps;
  },
): Promise<number> {
  try {
    const normalizedArgv = normalizeExecuteExpansionImportArgv(argv);
    const config = parseExecuteExpansionImportConfigFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const startedAtMs = Date.now();
    const progress = createExpansionImportProgressReporter({
      startedAtMs,
      isTty: isCliProgressTty(),
      write: (message) => io.writeStderr(message),
    });

    if (!io.fileExists(config.inputPath)) {
      throw new ExpansionExecutorError(
        `Missing historical expansion import config: ${config.inputPath}`,
        ExpansionExecutorErrorCode.MISSING_EXPANSION_CONFIG,
      );
    }

    if (config.marketTicker) {
      const report = await runSingleMarketExpansionImportDebug({
        generatedAt,
        config: {
          marketTicker: config.marketTicker,
          inputPath: config.inputPath,
          outputPath: config.singleMarketOutputPath,
          htmlOutputPath: config.singleMarketHtmlOutputPath,
          importConfigsDir: config.importConfigsDir,
          importsDir: config.importsDir,
          execute: config.execute,
          jobId: config.jobId,
        },
        expansionConfigJson: io.readFile(config.inputPath),
        io: {
          readFile: io.readFile,
          fileExists: io.fileExists,
          writeFile: io.writeFile,
          mkdirSync: io.mkdirSync,
        },
        deps: createSingleMarketExpansionImportDebugDepsFromFetch(
          resolveFetchImpl(options?.fetchImpl),
          {
            runImport:
              options?.deps?.runImport
              ?? ((importConfig) =>
                runHistoricalImportFromConfig({
                  config: importConfig,
                  fetchImpl: options?.fetchImpl,
                })),
          },
        ),
      });

      io.mkdirSync(dirname(config.singleMarketOutputPath), { recursive: true });
      io.mkdirSync(dirname(config.singleMarketHtmlOutputPath), { recursive: true });
      io.writeFile(
        config.singleMarketOutputPath,
        serializeSingleMarketExpansionImportDebugReport(report),
      );
      io.writeFile(
        config.singleMarketHtmlOutputPath,
        serializeSingleMarketExpansionImportDebugHtml(report),
      );

      io.writeStdout(
        formatStdoutOutput(
          JSON.stringify({
            mode: "single-market-smoke",
            marketTicker: report.marketTicker,
            execute: report.execute,
            importStatus: report.importStatus,
            outputPath: report.outputPath,
            htmlOutputPath: report.htmlOutputPath,
            expirationValueSource: report.expirationValueSource,
            reconciliationSuccess: report.reconciliation.success,
            failureReason: report.failureReason,
          }),
        ),
      );

      return 0;
    }

    const summary = await runHistoricalExpansionImport({
      generatedAt,
      config,
      expansionConfigJson: io.readFile(config.inputPath),
      io: {
        readdir: io.readdir,
        readFile: io.readFile,
        fileExists: io.fileExists,
        isDirectory: io.isDirectory,
        writeFile: io.writeFile,
        mkdirSync: io.mkdirSync,
      },
      deps: options?.deps ?? createProductionDeps(options?.fetchImpl),
      progress,
    });

    io.mkdirSync(dirname(config.outputPath), { recursive: true });
    io.mkdirSync(dirname(config.htmlOutputPath), { recursive: true });
    io.mkdirSync(dirname(config.checkpointPath), { recursive: true });
    io.writeFile(config.outputPath, serializeHistoricalExpansionImportSummary(summary));
    io.writeFile(
      config.htmlOutputPath,
      serializeHistoricalExpansionImportSummaryHtml(summary),
    );

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          execute: summary.execute,
          inputPath: summary.inputPath,
          outputPath: summary.outputPath,
          htmlOutputPath: summary.htmlOutputPath,
          checkpointPath: summary.checkpointPath,
          runStatus: summary.runStatus,
          resume: summary.resume,
          importedCount: summary.summary.importedCount,
          skippedCount: summary.summary.skippedCount,
          failedCount: summary.summary.failedCount,
          plannedCount: summary.summary.plannedCount,
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
  void runExecuteExpansionImportCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
    readdir: (path) => readdirSync(path),
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
