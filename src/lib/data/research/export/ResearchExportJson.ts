import { stableStringify } from "@/lib/trading/config/hashConfig";

import { serializeResearchExportDocument } from "./ResearchExport";
import {
  ResearchExportType,
} from "./researchExportTypes";
import type {
  ResearchExportDocument,
  ResearchExportSummaryMetrics,
} from "./researchExportTypes";

export type ResearchExportJsonFormatOptions = {
  pretty: boolean;
  trailingNewline: boolean;
};

export const DEFAULT_RESEARCH_EXPORT_JSON_FORMAT_OPTIONS: ResearchExportJsonFormatOptions =
  {
    pretty: false,
    trailingNewline: false,
  };

export const ResearchExportJsonErrorCode = {
  INVALID_EXPORT_DOCUMENT: "invalid-export-document",
} as const;

export type ResearchExportJsonErrorCode =
  (typeof ResearchExportJsonErrorCode)[keyof typeof ResearchExportJsonErrorCode];

export class ResearchExportJsonError extends Error {
  readonly code: ResearchExportJsonErrorCode;

  constructor(code: ResearchExportJsonErrorCode) {
    super(
      code === ResearchExportJsonErrorCode.INVALID_EXPORT_DOCUMENT
        ? "Research export document is invalid for JSON formatting"
        : "Research export JSON formatting failed",
    );
    this.name = "ResearchExportJsonError";
    this.code = code;
  }
}

export type ResearchExportSummaryJsonPayload = {
  exportId: string;
  exportType: ResearchExportDocument["exportType"];
  generated: ResearchExportDocument["generated"];
  strategyId: string | null;
  datasetId: string | null;
  summary: ResearchExportSummaryMetrics;
  winnerExperimentId: string | null;
  rankingCount: number | null;
};

function isExportType(value: string): value is ResearchExportDocument["exportType"] {
  return (
    value === ResearchExportType.RESEARCH_RUN ||
    value === ResearchExportType.RESEARCH_COMPARISON
  );
}

function validateSummaryMetrics(summary: ResearchExportSummaryMetrics): boolean {
  const required = [
    summary.finalEquityCents,
    summary.totalReturnPct,
    summary.maxDrawdownPct,
    summary.winRatePct,
    summary.tradeCount,
  ];

  if (required.some((value) => !Number.isFinite(value))) {
    return false;
  }

  if (
    summary.totalPnlCents !== null &&
    !Number.isFinite(summary.totalPnlCents)
  ) {
    return false;
  }

  if (
    summary.sharpeRatio !== null &&
    !Number.isFinite(summary.sharpeRatio)
  ) {
    return false;
  }

  return true;
}

function validateExportDocument(document: ResearchExportDocument): void {
  if (
    document === null ||
    typeof document !== "object" ||
    Array.isArray(document)
  ) {
    throw new ResearchExportJsonError(
      ResearchExportJsonErrorCode.INVALID_EXPORT_DOCUMENT,
    );
  }

  if (!document.exportId.trim()) {
    throw new ResearchExportJsonError(
      ResearchExportJsonErrorCode.INVALID_EXPORT_DOCUMENT,
    );
  }

  if (!isExportType(document.exportType)) {
    throw new ResearchExportJsonError(
      ResearchExportJsonErrorCode.INVALID_EXPORT_DOCUMENT,
    );
  }

  if (!document.generated?.generatedAt.trim()) {
    throw new ResearchExportJsonError(
      ResearchExportJsonErrorCode.INVALID_EXPORT_DOCUMENT,
    );
  }

  if (!validateSummaryMetrics(document.summary)) {
    throw new ResearchExportJsonError(
      ResearchExportJsonErrorCode.INVALID_EXPORT_DOCUMENT,
    );
  }

  if (!Array.isArray(document.tableRows)) {
    throw new ResearchExportJsonError(
      ResearchExportJsonErrorCode.INVALID_EXPORT_DOCUMENT,
    );
  }
}

function resolveFormatOptions(
  options: Partial<ResearchExportJsonFormatOptions>,
): ResearchExportJsonFormatOptions {
  return {
    pretty: options.pretty ?? DEFAULT_RESEARCH_EXPORT_JSON_FORMAT_OPTIONS.pretty,
    trailingNewline:
      options.trailingNewline ??
      DEFAULT_RESEARCH_EXPORT_JSON_FORMAT_OPTIONS.trailingNewline,
  };
}

function applyTrailingNewline(
  json: string,
  trailingNewline: boolean,
): string {
  return trailingNewline ? `${json}\n` : json;
}

function stablePrettyStringify(value: unknown, indentLevel = 0): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  const indent = "  ".repeat(indentLevel);
  const childIndent = "  ".repeat(indentLevel + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    const items = value.map(
      (item) => `${childIndent}${stablePrettyStringify(item, indentLevel + 1)}`,
    );
    return `[\n${items.join(",\n")}\n${indent}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  if (keys.length === 0) {
    return "{}";
  }

  const entries = keys.map((key) => {
    const formattedValue = stablePrettyStringify(record[key], indentLevel + 1);
    return `${childIndent}${JSON.stringify(key)}: ${formattedValue}`;
  });

  return `{\n${entries.join(",\n")}\n${indent}}`;
}

function buildSummaryPayload(
  document: ResearchExportDocument,
): ResearchExportSummaryJsonPayload {
  return {
    exportId: document.exportId,
    exportType: document.exportType,
    generated: document.generated,
    strategyId: document.strategyId,
    datasetId: document.datasetMetadata?.datasetId ?? null,
    summary: document.summary,
    winnerExperimentId: document.rankings?.[0]?.experimentId ?? null,
    rankingCount: document.rankings?.length ?? null,
  };
}

function formatStableJson(
  value: unknown,
  options: ResearchExportJsonFormatOptions,
): string {
  const json = options.pretty ? stablePrettyStringify(value) : stableStringify(value);
  return applyTrailingNewline(json, options.trailingNewline);
}

/** Formats a research export document as deterministic JSON text. */
export function formatResearchExportJson(
  document: ResearchExportDocument,
  options: Partial<ResearchExportJsonFormatOptions> = {},
): string {
  validateExportDocument(document);
  const resolved = resolveFormatOptions(options);

  if (resolved.pretty) {
    return formatStableJson(document, resolved);
  }

  return applyTrailingNewline(
    serializeResearchExportDocument(document),
    resolved.trailingNewline,
  );
}

/** Formats a compact summary view of a research export document as JSON text. */
export function formatResearchExportSummaryJson(
  document: ResearchExportDocument,
  options: Partial<ResearchExportJsonFormatOptions> = {},
): string {
  validateExportDocument(document);
  const resolved = resolveFormatOptions(options);
  return formatStableJson(buildSummaryPayload(document), resolved);
}
