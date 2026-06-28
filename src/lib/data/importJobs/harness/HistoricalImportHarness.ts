import { runHistoricalBronzeImportJob } from "../HistoricalBronzeImportJob";

import type {
  HistoricalBronzeImportJobResult,
  RunConfiguredHistoricalBronzeImportInput,
} from "./historicalImportHarnessTypes";

/**
 * Wires a validated import config and provider implementations into
 * {@link runHistoricalBronzeImportJob}.
 */
export function runConfiguredHistoricalBronzeImport(
  input: RunConfiguredHistoricalBronzeImportInput,
): HistoricalBronzeImportJobResult {
  const { config, kalshiProvider, btcProvider } = input;

  return runHistoricalBronzeImportJob({
    jobId: config.jobId,
    marketTicker: config.marketTicker,
    startTime: config.startTime,
    endTime: config.endTime,
    collectionTime: config.collectionTime,
    observedAt: config.observedAt,
    kalshiProvider,
    btcProvider,
  });
}

export type {
  HistoricalBronzeImportJobResult,
  RunConfiguredHistoricalBronzeImportInput,
} from "./historicalImportHarnessTypes";
