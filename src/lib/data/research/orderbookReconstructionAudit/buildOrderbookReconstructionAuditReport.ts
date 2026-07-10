import { auditOrderbookReconstruction } from "./auditOrderbookReconstruction";
import {
  DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_CONFIG,
  DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_HTML_PATH,
  DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_OUTPUT_PATH,
  ORDERBOOK_RECONSTRUCTION_AUDIT_CAVEATS,
  ORDERBOOK_RECONSTRUCTION_AUDIT_DISCLAIMER,
  type OrderbookReconstructionAuditIo,
  type OrderbookReconstructionAuditReport,
} from "./orderbookReconstructionAuditTypes";

export function buildOrderbookReconstructionAuditReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: typeof DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_CONFIG;
  io: OrderbookReconstructionAuditIo;
}): OrderbookReconstructionAuditReport {
  const audit = auditOrderbookReconstruction({
    io: input.io,
    config: input.config,
  });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: ORDERBOOK_RECONSTRUCTION_AUDIT_DISCLAIMER,
    caveats: ORDERBOOK_RECONSTRUCTION_AUDIT_CAVEATS,
    config: input.config,
    ...audit,
  };
}

export {
  DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_CONFIG,
  DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_HTML_PATH,
  DEFAULT_ORDERBOOK_RECONSTRUCTION_AUDIT_OUTPUT_PATH,
};
