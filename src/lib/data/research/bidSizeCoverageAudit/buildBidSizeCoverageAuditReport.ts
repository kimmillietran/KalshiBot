import { stableStringify } from "@/lib/trading/config/hashConfig";

import { auditBidSizeCoverage } from "./auditBidSizeCoverage";
import {
  BID_SIZE_COVERAGE_AUDIT_CAVEATS,
  BID_SIZE_COVERAGE_AUDIT_DISCLAIMER,
  DEFAULT_BID_SIZE_COVERAGE_AUDIT_CONFIG,
  DEFAULT_BID_SIZE_COVERAGE_AUDIT_HTML_PATH,
  DEFAULT_BID_SIZE_COVERAGE_AUDIT_OUTPUT_PATH,
  type BidSizeCoverageAuditIo,
  type BidSizeCoverageAuditReport,
} from "./bidSizeCoverageAuditTypes";

export function buildBidSizeCoverageAuditReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: typeof DEFAULT_BID_SIZE_COVERAGE_AUDIT_CONFIG;
  io: BidSizeCoverageAuditIo;
}): BidSizeCoverageAuditReport {
  const audit = auditBidSizeCoverage({ io: input.io, config: input.config });
  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: BID_SIZE_COVERAGE_AUDIT_DISCLAIMER,
    caveats: BID_SIZE_COVERAGE_AUDIT_CAVEATS,
    config: input.config,
    ...audit,
  };
}

export function serializeBidSizeCoverageAuditReport(
  report: BidSizeCoverageAuditReport,
): string {
  return stableStringify(report);
}

export {
  DEFAULT_BID_SIZE_COVERAGE_AUDIT_CONFIG,
  DEFAULT_BID_SIZE_COVERAGE_AUDIT_HTML_PATH,
  DEFAULT_BID_SIZE_COVERAGE_AUDIT_OUTPUT_PATH,
};
