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
  BidSizeCoverageAuditError,
  DEFAULT_BID_SIZE_COVERAGE_AUDIT_CONFIG,
  DEFAULT_BID_SIZE_COVERAGE_AUDIT_HTML_PATH,
  DEFAULT_BID_SIZE_COVERAGE_AUDIT_OUTPUT_PATH,
  type BidSizeCoverageAuditIo,
  type BidSizeCoverageAuditReport,
} from "./bidSizeCoverageAuditTypes";

/**
 * Resolves selected-run identity from captureRunDir basename and optional summary.runId.
 * Conflicting identities fail closed — never overwrite contradictions into consistency.
 */
export function resolveBidSizeSelectedRunIdentity(input: {
  captureRunDir: string;
  summaryRunId: string | null | undefined;
}): { captureRunDir: string; selectedRunId: string } {
  const captureRunDir = input.captureRunDir.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!captureRunDir || captureRunDir === "." || captureRunDir === "/") {
    throw new BidSizeCoverageAuditError(
      "Bid-size audit captureRunDir is empty or malformed after normalization.",
    );
  }

  const basename = resolveRunIdFromPath(captureRunDir);
  if (!basename || basename === "." || basename === "/" || basename.includes("..")) {
    throw new BidSizeCoverageAuditError(
      `Bid-size audit could not derive a valid run id from captureRunDir "${input.captureRunDir}".`,
    );
  }

  const summaryRunId =
    typeof input.summaryRunId === "string" && input.summaryRunId.trim().length > 0
      ? input.summaryRunId.trim()
      : null;

  if (summaryRunId !== null && summaryRunId !== basename) {
    throw new BidSizeCoverageAuditError(
      `Bid-size audit run identity conflict: summary.runId="${summaryRunId}" does not match captureRunDir basename="${basename}".`,
    );
  }

  return {
    captureRunDir,
    selectedRunId: summaryRunId ?? basename,
  };
}

export async function buildBidSizeCoverageAuditReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: typeof DEFAULT_BID_SIZE_COVERAGE_AUDIT_CONFIG;
  io: BidSizeCoverageAuditIo;
}): Promise<BidSizeCoverageAuditReport> {
  const audit = await auditBidSizeCoverage({ io: input.io, config: input.config });

  const identity = resolveBidSizeSelectedRunIdentity({
    captureRunDir: audit.summary.captureRunDir,
    summaryRunId: audit.summary.runId,
  });
  const selectedRunId = identity.selectedRunId;
  const captureRunDir = identity.captureRunDir;

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
