import { stableStringify } from "@/lib/trading/config/hashConfig";
import { loadAndBuildVendorOrderbookSufficiencyAuditReport } from "@/lib/data/research/vendorOrderbookSufficiencyAudit";
import {
  DEFAULT_VENDOR_ORDERBOOK_AUDIT_CONFIG_PATH,
  DEFAULT_VENDOR_ORDERBOOK_SAMPLES_ROOT,
} from "@/lib/data/research/vendorOrderbookSufficiencyAudit/vendorOrderbookSufficiencyAuditTypes";

import {
  evaluateVendorIntakeEntry,
  evaluateVendorIntakeVerdict,
} from "./evaluateVendorIntake";
import type {
  BuildVendorSampleIntakeReportInput,
  VendorSampleIntakeReport,
  VendorSampleIntakeReAuditReadiness,
} from "./vendorSampleIntakeTypes";
import {
  DEFAULT_VENDOR_SAMPLE_PREVIEW_LIMIT,
  VENDOR_INTAKE_VENDOR_IDS,
} from "./vendorSampleIntakeTypes";

function buildReAuditReadiness(input: {
  samplesRoot: string;
  io: BuildVendorSampleIntakeReportInput["io"];
  vendorsUsable: number;
}): VendorSampleIntakeReAuditReadiness {
  if (input.vendorsUsable === 0) {
    return {
      canRunM12_1A: true,
      vendorsWithSamples: 0,
      m12_1AOverallVerdict: "request-vendor-samples",
      m12_1ARecommendedAction: "request-vendor-samples",
      notes: [
        "M12.1A can run but will remain metadata-only until usable samples are present.",
      ],
    };
  }

  try {
    const auditReport = loadAndBuildVendorOrderbookSufficiencyAuditReport({
      generatedAt: new Date(0).toISOString(),
      outputPath: "data/research-results/vendor-orderbook-sufficiency-audit.json",
      htmlOutputPath: "data/reports/vendor-orderbook-sufficiency-audit.html",
      inputPaths: {
        configPath: DEFAULT_VENDOR_ORDERBOOK_AUDIT_CONFIG_PATH,
        samplesRoot: input.samplesRoot,
      },
      io: input.io,
    });

    return {
      canRunM12_1A: true,
      vendorsWithSamples: auditReport.summary.vendorsWithSamples,
      m12_1AOverallVerdict: auditReport.summary.overallVerdict,
      m12_1ARecommendedAction: auditReport.summary.recommendedNextAction,
      notes:
        auditReport.summary.vendorsWithSamples > 0
          ? ["M12.1A can now produce sample-proven verdicts for at least one vendor."]
          : ["Samples present but M12.1A still reports zero parsed vendor samples."],
    };
  } catch (error) {
    return {
      canRunM12_1A: false,
      vendorsWithSamples: 0,
      m12_1AOverallVerdict: null,
      m12_1ARecommendedAction: null,
      notes: [
        error instanceof Error ? error.message : "M12.1A re-audit failed",
      ],
    };
  }
}

function buildNextSteps(
  verdict: VendorSampleIntakeReport["summary"]["overallVerdict"],
  reAudit: VendorSampleIntakeReAuditReadiness,
): string[] {
  const steps: string[] = [];

  if (verdict === "no-samples") {
    steps.push("Request vendor samples into data/vendor-orderbook-samples/{vendor}/.");
    steps.push("Re-run npm run research:vendor-sample-intake after files arrive.");
    return steps;
  }

  if (verdict === "samples-present-not-usable") {
    steps.push("Fix sample format: ensure JSON/JSONL/CSV with market ticker and timestamp fields.");
    steps.push("Include YES/NO bid/ask and size fields where available.");
    return steps;
  }

  steps.push("Run npm run research:vendor-orderbook-audit for full sufficiency scoring.");
  if (reAudit.m12_1AOverallVerdict === "vendor-data-sufficient-for-backfill") {
    steps.push("Consider build-vendor-backfill-importer-spike for promising vendors.");
  } else {
    steps.push("Continue own forward capture until overlap validation passes.");
  }

  return steps;
}

/** Builds vendor sample intake report with optional M12.1A re-audit. */
export function buildVendorSampleIntakeReport(
  input: BuildVendorSampleIntakeReportInput,
): VendorSampleIntakeReport {
  const previewLimit = input.previewLimit ?? DEFAULT_VENDOR_SAMPLE_PREVIEW_LIMIT;
  const samplesRoot = input.samplesRoot || DEFAULT_VENDOR_ORDERBOOK_SAMPLES_ROOT;

  const vendors = VENDOR_INTAKE_VENDOR_IDS.map((vendorId) =>
    evaluateVendorIntakeEntry({
      vendorId,
      samplesRoot,
      previewLimit,
      io: input.io,
    }),
  );

  const { overallVerdict, recommendedAction } = evaluateVendorIntakeVerdict(vendors);
  const vendorsUsable = vendors.filter(
    (vendor) => vendor.status === "sample-usable" || vendor.status === "sample-promising",
  ).length;

  const reAuditReadiness = buildReAuditReadiness({
    samplesRoot,
    io: input.io,
    vendorsUsable,
  });

  const warnings: string[] = [];
  if (samplesRoot === DEFAULT_VENDOR_ORDERBOOK_SAMPLES_ROOT) {
    warnings.push("Using default sample root data/vendor-orderbook-samples/.");
  }

  const report: VendorSampleIntakeReport = {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    samplesRoot,
    previewLimit,
    summary: {
      vendorFolderCount: vendors.length,
      vendorsWithFiles: vendors.filter((vendor) => vendor.files.length > 0).length,
      vendorsUsable,
      vendorsPromising: vendors.filter((vendor) => vendor.status === "sample-promising").length,
      totalFilesDetected: vendors.reduce((sum, vendor) => sum + vendor.files.length, 0),
      totalPreviewRecords: vendors.reduce((sum, vendor) => sum + vendor.previewRecords.length, 0),
      overallVerdict,
      recommendedAction,
    },
    vendors,
    reAuditReadiness,
    nextSteps: buildNextSteps(overallVerdict, reAuditReadiness),
    warnings,
  };

  return report;
}

export function serializeVendorSampleIntakeReport(report: VendorSampleIntakeReport): string {
  return stableStringify(report);
}
