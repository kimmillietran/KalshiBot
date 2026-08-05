import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  buildDownstreamScopeMetadata,
  resolveRunIdFromPath,
  spreadDownstreamScopeFields,
} from "../downstreamAnalysisScope";
import type { CaptureRunSelection } from "../downstreamAnalysisScope/downstreamAnalysisScopeTypes";

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

export async function buildBidSizeCoverageAuditReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: typeof DEFAULT_BID_SIZE_COVERAGE_AUDIT_CONFIG;
  io: BidSizeCoverageAuditIo;
}): Promise<BidSizeCoverageAuditReport> {
  const audit = await auditBidSizeCoverage({ io: input.io, config: input.config });

  const captureRunDir = audit.summary.captureRunDir.replace(/\\/g, "/").replace(/\/$/, "");
  const selectedRunId =
    audit.summary.runId
    ?? resolveRunIdFromPath(captureRunDir);
  const selection: CaptureRunSelection = {
    analysisScope: "selected-run",
    forwardQuotesDir: captureRunDir.replace(/\/[^/]+$/, "") || captureRunDir,
    captureRunDir,
    selectedRunId,
  };
  const scope = buildDownstreamScopeMetadata({
    selection,
    generatedAt: input.generatedAt,
    recordsScanned: audit.summary.topOfBookRecordsCompared,
    artifactValidation: {
      identities: [],
      staleArtifacts: [],
      mismatchedArtifacts: [],
      malformedArtifacts: [],
      missingArtifacts: [],
      warnings: [],
      usablePaths: [],
    },
  });
  const scopeFields = spreadDownstreamScopeFields(scope, {
    sourceRunIds: [selectedRunId],
  });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: BID_SIZE_COVERAGE_AUDIT_DISCLAIMER,
    caveats: BID_SIZE_COVERAGE_AUDIT_CAVEATS,
    config: input.config,
    ...audit,
    summary: {
      ...audit.summary,
      // Keep summary identity aligned with downstream selected-run contract.
      runId: selectedRunId,
      captureRunDir,
    },
    captureRunDir,
    ...scopeFields,
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
