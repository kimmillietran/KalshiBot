import { parseVendorSampleFile } from "@/lib/data/research/vendorOrderbookSufficiencyAudit/parseVendorSample";
import type { NormalizedVendorSampleRow } from "@/lib/data/research/vendorOrderbookSufficiencyAudit/parseVendorSample";

import { buildVendorSamplePreviewRecords } from "./buildVendorSamplePreview";
import {
  fieldAvailabilityFromNormalizedRows,
  flattenRawRecordsFromParsed,
  inferVendorSampleSchema,
} from "./inferVendorSampleSchema";
import { adaptVendorSampleRows } from "./vendorSampleAdapters";
import type {
  VendorDetectedFile,
  VendorIntakeEntry,
  VendorIntakeOverallVerdict,
  VendorIntakeRecommendedAction,
  VendorIntakeStatus,
  VendorIntakeVendorId,
  VendorOrderbookSamplePreview,
  VendorSampleIntakeIo,
} from "./vendorSampleIntakeTypes";

function fileExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index).toLowerCase() : "";
}

function discoverVendorIntakeFiles(input: {
  samplesRoot: string;
  vendorDirName: string;
  io: VendorSampleIntakeIo;
}): readonly string[] {
  const vendorDir = `${input.samplesRoot.replace(/\\/g, "/").replace(/\/$/, "")}/${input.vendorDirName}`;

  if (!input.io.fileExists(vendorDir) || !input.io.isDirectory(vendorDir)) {
    return [];
  }

  return input.io
    .readdir(vendorDir)
    .filter((entry) => entry !== "." && entry !== "..")
    .map((entry) => `${vendorDir}/${entry}`)
    .filter((fullPath) => input.io.fileExists(fullPath) && !input.io.isDirectory(fullPath))
    .sort();
}

function parseVendorIntakeFile(input: {
  filePath: string;
  raw: string;
}): {
  format: VendorDetectedFile["format"];
  rows: NormalizedVendorSampleRow[];
  error: string | null;
} {
  const lower = input.filePath.toLowerCase();

  if (lower.endsWith(".parquet")) {
    return {
      format: "parquet",
      rows: [],
      error: "Parquet is not supported in this harness",
    };
  }

  if (lower.endsWith(".jsonl")) {
    try {
      const records = input.raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      return {
        format: "jsonl",
        rows: [],
        error: records.length === 0 ? "JSONL contained no data rows" : null,
      };
    } catch {
      return {
        format: "jsonl",
        rows: [],
        error: "Invalid JSONL",
      };
    }
  }

  const parsed = parseVendorSampleFile(input);
  return {
    format: parsed.format === "unsupported" ? "unsupported" : parsed.format,
    rows: [...parsed.rows],
    error: parsed.error,
  };
}

function classifyVendorStatus(input: {
  folderExists: boolean;
  files: readonly VendorDetectedFile[];
  fieldAvailability: ReturnType<typeof fieldAvailabilityFromNormalizedRows> | null;
  hasParseErrorsOnly: boolean;
}): VendorIntakeStatus {
  if (!input.folderExists) {
    return "missing-folder";
  }

  if (input.files.length === 0) {
    return "no-files";
  }

  if (input.files.every((file) => file.format === "unsupported" || file.format === "parquet")) {
    return "unsupported-file-type";
  }

  if (input.hasParseErrorsOnly) {
    return "parse-error";
  }

  if (!input.fieldAvailability?.hasMarketTicker || !input.fieldAvailability.hasTimestamp) {
    return "unsupported-schema";
  }

  const promising =
    input.fieldAvailability.hasYesBidAsk
    && input.fieldAvailability.hasSizes
    && input.fieldAvailability.hasSequenceOrUpdate;

  return promising ? "sample-promising" : "sample-usable";
}

export function evaluateVendorIntakeEntry(input: {
  vendorId: VendorIntakeVendorId;
  samplesRoot: string;
  previewLimit: number;
  io: VendorSampleIntakeIo;
}): VendorIntakeEntry {
  const folderPath = `${input.samplesRoot.replace(/\\/g, "/").replace(/\/$/, "")}/${input.vendorId}`;
  const folderExists = input.io.fileExists(folderPath) && input.io.isDirectory(folderPath);
  const filePaths = folderExists
    ? discoverVendorIntakeFiles({
        samplesRoot: input.samplesRoot,
        vendorDirName: input.vendorId,
        io: input.io,
      })
    : [];

  const files: VendorDetectedFile[] = [];
  const warnings: string[] = [];
  const diagnosticExamples: string[] = [];
  const allRawRecords: Record<string, unknown>[] = [];
  const allNormalizedRows: NormalizedVendorSampleRow[] = [];
  const previewRecords: VendorOrderbookSamplePreview[] = [];

  for (const filePath of filePaths) {
    const fileName = filePath.split("/").pop() ?? filePath;
    const parsed = parseVendorIntakeFile({
      filePath,
      raw: input.io.readFile(filePath),
    });

    files.push({
      filePath,
      fileName,
      extension: fileExtension(fileName),
      format: parsed.format,
      rowCount: parsed.rows.length,
      parseError: parsed.error,
    });

    if (parsed.error) {
      diagnosticExamples.push(`${fileName}: ${parsed.error}`);
      continue;
    }

    let rawRecords: Record<string, unknown>[] = [];
    try {
      if (parsed.format === "json") {
        rawRecords = flattenRawRecordsFromParsed(JSON.parse(input.io.readFile(filePath)));
      } else if (parsed.format === "jsonl") {
        rawRecords = input.io
          .readFile(filePath)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => JSON.parse(line) as Record<string, unknown>);
      } else if (parsed.format === "csv") {
        rawRecords = parsed.rows.map((row) => ({ ...row }));
      }
    } catch {
      diagnosticExamples.push(`${fileName}: failed to recover raw records for schema inference`);
    }

    allRawRecords.push(...rawRecords);
    const adaptedRows = adaptVendorSampleRows({
      vendorId: input.vendorId,
      rawRecords,
    });
    allNormalizedRows.push(...adaptedRows);
    previewRecords.push(
      ...buildVendorSamplePreviewRecords({
        vendorId: input.vendorId,
        sourceFile: filePath,
        rows: adaptedRows,
        rawRecords,
        limit: input.previewLimit,
      }),
    );
  }

  const schemaDetection =
    allRawRecords.length > 0 ? inferVendorSampleSchema(allRawRecords) : null;
  const fieldAvailability =
    allNormalizedRows.length > 0 ? fieldAvailabilityFromNormalizedRows(allNormalizedRows) : null;

  const hasParseErrorsOnly =
    files.length > 0
    && files.every((file) => file.parseError !== null || file.format === "unsupported");

  const status = classifyVendorStatus({
    folderExists,
    files,
    fieldAvailability,
    hasParseErrorsOnly,
  });

  if (status === "unsupported-schema" && schemaDetection) {
    warnings.push("Missing required market ticker and/or timestamp fields after normalization.");
    diagnosticExamples.push(
      `Detected keys: market=${schemaDetection.marketTickerFields.join(",") || "none"}, timestamp=${schemaDetection.timestampFields.join(",") || "none"}`,
    );
  }

  return {
    vendorId: input.vendorId,
    folderPath,
    status,
    files,
    schemaDetection,
    fieldAvailability,
    previewRecords: previewRecords.slice(0, input.previewLimit),
    warnings,
    diagnosticExamples,
  };
}

export function evaluateVendorIntakeVerdict(
  vendors: readonly VendorIntakeEntry[],
): {
  overallVerdict: VendorIntakeOverallVerdict;
  recommendedAction: VendorIntakeRecommendedAction;
} {
  const withFiles = vendors.filter(
    (vendor) => vendor.status !== "missing-folder" && vendor.status !== "no-files",
  );

  if (withFiles.length === 0) {
    return {
      overallVerdict: "no-samples",
      recommendedAction: "request-vendor-samples",
    };
  }

  const promising = vendors.filter((vendor) => vendor.status === "sample-promising");
  const usable = vendors.filter((vendor) => vendor.status === "sample-usable");

  if (promising.length > 0) {
    return {
      overallVerdict: "samples-promising",
      recommendedAction: "rerun-vendor-orderbook-audit",
    };
  }

  if (usable.length > 0) {
    return {
      overallVerdict: "samples-usable-run-vendor-audit",
      recommendedAction: "rerun-vendor-orderbook-audit",
    };
  }

  const onlyUnsupported = withFiles.every(
    (vendor) =>
      vendor.status === "unsupported-file-type"
      || vendor.status === "unsupported-schema"
      || vendor.status === "parse-error",
  );

  if (onlyUnsupported) {
    return {
      overallVerdict: "samples-present-not-usable",
      recommendedAction: "fix-sample-format",
    };
  }

  return {
    overallVerdict: "samples-present-not-usable",
    recommendedAction: "fix-sample-format",
  };
}
