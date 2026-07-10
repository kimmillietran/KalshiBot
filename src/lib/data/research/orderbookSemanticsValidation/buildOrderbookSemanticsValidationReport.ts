import { validateOrderbookSemantics } from "./validateOrderbookSemantics";
import {
  DEFAULT_ORDERBOOK_SEMANTICS_VALIDATION_CONFIG,
  DEFAULT_ORDERBOOK_SEMANTICS_VALIDATION_HTML_PATH,
  DEFAULT_ORDERBOOK_SEMANTICS_VALIDATION_OUTPUT_PATH,
  ORDERBOOK_SEMANTICS_VALIDATION_CAVEATS,
  ORDERBOOK_SEMANTICS_VALIDATION_DISCLAIMER,
  type OrderbookSemanticsValidationIo,
  type OrderbookSemanticsValidationReport,
} from "./orderbookSemanticsValidationTypes";

export function buildOrderbookSemanticsValidationReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: typeof DEFAULT_ORDERBOOK_SEMANTICS_VALIDATION_CONFIG;
  io: OrderbookSemanticsValidationIo;
}): OrderbookSemanticsValidationReport {
  const validation = validateOrderbookSemantics({
    io: input.io,
    config: input.config,
  });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: ORDERBOOK_SEMANTICS_VALIDATION_DISCLAIMER,
    caveats: ORDERBOOK_SEMANTICS_VALIDATION_CAVEATS,
    config: input.config,
    ...validation,
  };
}

export {
  DEFAULT_ORDERBOOK_SEMANTICS_VALIDATION_CONFIG,
  DEFAULT_ORDERBOOK_SEMANTICS_VALIDATION_HTML_PATH,
  DEFAULT_ORDERBOOK_SEMANTICS_VALIDATION_OUTPUT_PATH,
};
