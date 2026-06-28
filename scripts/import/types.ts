import type {
  BtcHistoricalBronzeProvider,
  KalshiHistoricalBronzeProvider,
} from "@/lib/data/importJobs";
import {
  buildHistoricalBronzeImportConfig,
  HistoricalBronzeImportConfigError,
  serializeHistoricalBronzeImportConfig,
} from "@/lib/data/importJobs/config";
import type {
  BuildHistoricalBronzeImportConfigInput,
  HistoricalBronzeImportBtcConfig,
  HistoricalBronzeImportConfig,
  HistoricalBronzeImportKalshiConfig,
  HistoricalBronzeImportOutputConfig,
} from "@/lib/data/importJobs/config";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type HistoricalBronzeImportPlan = {
  jobId: string;
  marketTicker: string;
  startTime: string;
  endTime: string;
  providerSelections: {
    kalshi: HistoricalBronzeImportKalshiConfig;
    btc: HistoricalBronzeImportBtcConfig;
  };
  outputSelections: HistoricalBronzeImportOutputConfig;
  serializedConfig: string;
  dryRun: boolean;
};

export class HistoricalImportCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoricalImportCommandError";
  }
}

export type HistoricalImportCommandDeps = {
  kalshiProvider: KalshiHistoricalBronzeProvider;
  btcProvider: BtcHistoricalBronzeProvider;
};

export type HistoricalImportCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile?: (path: string, data: string) => void;
};

export function parseDryRunFromArgv(argv: readonly string[]): boolean {
  return argv.includes("--dry-run");
}

export function buildHistoricalBronzeImportPlan(
  config: HistoricalBronzeImportConfig,
  options: { dryRun: boolean },
): HistoricalBronzeImportPlan {
  return {
    jobId: config.jobId,
    marketTicker: config.marketTicker,
    startTime: config.startTime,
    endTime: config.endTime,
    providerSelections: {
      kalshi: {
        marketSource: config.kalshi.marketSource,
        candleSource: config.kalshi.candleSource,
        settlementSource: config.kalshi.settlementSource,
      },
      btc: {
        provider: config.btc.provider,
        symbol: config.btc.symbol,
        interval: config.btc.interval,
      },
    },
    outputSelections: {
      format: config.output.format,
      includeValidationReport: config.output.includeValidationReport,
      includeFixture: config.output.includeFixture,
    },
    serializedConfig: serializeHistoricalBronzeImportConfig(config),
    dryRun: options.dryRun,
  };
}

export function serializeHistoricalBronzeImportPlan(
  plan: HistoricalBronzeImportPlan,
): string {
  return stableStringify({
    jobId: plan.jobId,
    marketTicker: plan.marketTicker,
    startTime: plan.startTime,
    endTime: plan.endTime,
    providerSelections: {
      kalshi: {
        marketSource: plan.providerSelections.kalshi.marketSource,
        candleSource: plan.providerSelections.kalshi.candleSource,
        settlementSource: plan.providerSelections.kalshi.settlementSource,
      },
      btc: {
        provider: plan.providerSelections.btc.provider,
        symbol: plan.providerSelections.btc.symbol,
        interval: plan.providerSelections.btc.interval,
      },
    },
    outputSelections: {
      format: plan.outputSelections.format,
      includeValidationReport: plan.outputSelections.includeValidationReport,
      includeFixture: plan.outputSelections.includeFixture,
    },
    serializedConfig: plan.serializedConfig,
    dryRun: plan.dryRun,
  });
}

export function parseHistoricalImportInputJson(
  json: string,
): HistoricalBronzeImportConfig {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new HistoricalImportCommandError("Input file contains invalid JSON");
  }

  try {
    return buildHistoricalBronzeImportConfig(
      parsed as BuildHistoricalBronzeImportConfigInput,
    );
  } catch (error) {
    if (error instanceof HistoricalBronzeImportConfigError) {
      throw new HistoricalImportCommandError(error.message);
    }

    throw error;
  }
}
