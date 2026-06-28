import type {
  BtcHistoricalImporter,
  BtcHistoricalInterval,
} from "@/lib/data/importers/btc";

export type CreateBtcHistoricalBronzeProviderFromImporterInput = {
  importer: BtcHistoricalImporter;
  symbol: string;
  interval: BtcHistoricalInterval;
};

export const BtcImporterBronzeProviderAdapterErrorCode = {
  INVALID_INPUT: "invalid-input",
  ASYNC_IMPORTER_RESULT: "async-importer-result",
} as const;

export type BtcImporterBronzeProviderAdapterErrorCode =
  (typeof BtcImporterBronzeProviderAdapterErrorCode)[keyof typeof BtcImporterBronzeProviderAdapterErrorCode];

export class BtcImporterBronzeProviderAdapterError extends Error {
  readonly code: BtcImporterBronzeProviderAdapterErrorCode;

  constructor(message: string, code: BtcImporterBronzeProviderAdapterErrorCode) {
    super(message);
    this.name = "BtcImporterBronzeProviderAdapterError";
    this.code = code;
  }
}
