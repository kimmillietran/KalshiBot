import type { KalshiMarketWireShape } from "./kalshiMarketImportDiagnostics";
import type { KalshiMarketSchemaReconciliationResult } from "./kalshiMarketSchemaReconciliation";

export type KalshiHistoricalMarketReconciliationTraceHooks = {
  onDetailMarket?: (input: {
    ticker: string;
    detailMarket: KalshiMarketWireShape;
    listMarketWire?: KalshiMarketWireShape | null;
  }) => void;
  onMerge?: (input: {
    ticker: string;
    reconciliation: KalshiMarketSchemaReconciliationResult;
  }) => void;
  onValidation?: (input: {
    ticker: string;
    wire: KalshiMarketWireShape;
  }) => void;
};
