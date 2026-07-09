import { discoverVendorSampleFiles } from "./parseVendorSample";
import {
  auditVendorSampleData,
  sampleHasKxbtc15mCoverage,
  sampleHasKxbtcdCoverage,
} from "./auditVendorSample";
import { buildVendorSampleRequest } from "./buildVendorSampleRequest";
import { evaluateOverallAuditVerdict } from "./evaluateOverallAuditVerdict";
import { evaluateVendorSufficiency } from "./evaluateVendorSufficiency";
import { SEEDED_VENDOR_METADATA } from "./seedVendorMetadata";
import {
  VENDOR_ORDERBOOK_SUFFICIENCY_AUDIT_CAVEATS,
  VENDOR_ORDERBOOK_SUFFICIENCY_AUDIT_DISCLAIMER,
} from "./vendorOrderbookSufficiencyAuditConfig";
import {
  buildDefaultVendorAuditInputPaths,
  loadVendorOrderbookAuditConfig,
} from "./vendorOrderbookAuditUtils";
import type {
  VendorAuditEntry,
  VendorOrderbookAuditConfig,
  VendorOrderbookSufficiencyAuditInputPaths,
  VendorOrderbookSufficiencyAuditIo,
  VendorOrderbookSufficiencyAuditReport,
  VendorOrderbookSourceMetadata,
} from "./vendorOrderbookSufficiencyAuditTypes";

function applyVerifiedCoverage(
  metadata: VendorOrderbookSourceMetadata,
  sampleAudit: ReturnType<typeof auditVendorSampleData> | null,
): VendorOrderbookSourceMetadata {
  if (!sampleAudit || sampleAudit.sampleStatus !== "present") {
    return metadata;
  }

  return {
    ...metadata,
    kxbtc15mCoverageStatus: sampleHasKxbtc15mCoverage(sampleAudit)
      ? "verified"
      : metadata.kxbtc15mCoverageStatus,
    kxbtcdCoverageStatus: sampleHasKxbtcdCoverage(sampleAudit)
      ? "verified"
      : metadata.kxbtcdCoverageStatus,
  };
}

export function buildVendorOrderbookSufficiencyAuditReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: VendorOrderbookSufficiencyAuditInputPaths;
  config: VendorOrderbookAuditConfig;
  io: VendorOrderbookSufficiencyAuditIo;
}): VendorOrderbookSufficiencyAuditReport {
  const vendors: VendorAuditEntry[] = [];

  for (const metadata of SEEDED_VENDOR_METADATA) {
    const vendorDirName =
      input.config.vendorSampleDirs[metadata.vendorId] ?? metadata.vendorId;
    const sampleFilePaths = discoverVendorSampleFiles({
      samplesRoot: input.inputPaths.samplesRoot,
      vendorDirName,
      io: input.io,
    });

    const sampleAudit =
      sampleFilePaths.length > 0
        ? auditVendorSampleData({
          vendorId: metadata.vendorId,
          sampleFilePaths,
          io: input.io,
        })
        : auditVendorSampleData({
          vendorId: metadata.vendorId,
          sampleFilePaths: [],
          io: input.io,
        });

    const enrichedMetadata = applyVerifiedCoverage(metadata, sampleAudit);
    const evaluation = evaluateVendorSufficiency({
      metadata: enrichedMetadata,
      sampleAudit,
      thresholds: input.config.thresholds,
    });

    vendors.push({
      vendorId: metadata.vendorId,
      displayName: metadata.displayName,
      metadata: enrichedMetadata,
      sampleAudit,
      sufficiency: evaluation.sufficiency,
      recommendation: evaluation.recommendation,
      unknowns: evaluation.unknowns,
      blockers: evaluation.blockers,
    });
  }

  const { overallVerdict, recommendedNextAction } = evaluateOverallAuditVerdict({
    vendors,
  });

  const thirdPartyVendors = vendors.filter(
    (vendor) => vendor.vendorId !== "official-kalshi",
  );
  const vendorsWithSamples = thirdPartyVendors.filter(
    (vendor) => vendor.sampleAudit?.sampleStatus === "present",
  ).length;
  const vendorsWithKxbtc15mVerified = vendors.filter(
    (vendor) => vendor.metadata.kxbtc15mCoverageStatus === "verified",
  ).length;
  const vendorsWithKxbtcdVerified = vendors.filter(
    (vendor) => vendor.metadata.kxbtcdCoverageStatus === "verified",
  ).length;

  const warnings: string[] = [];
  if (vendorsWithSamples === 0) {
    warnings.push("No third-party vendor sample files found; audit is metadata-only.");
  }
  warnings.push(
    "KXBTC15M cross-strike ladder remains product-blocked unless sample proves multiple strikes per event.",
  );
  warnings.push(
    "Vendor marketing claims are unverified until sample-proven in this audit.",
  );

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: VENDOR_ORDERBOOK_SUFFICIENCY_AUDIT_DISCLAIMER,
    caveats: [...VENDOR_ORDERBOOK_SUFFICIENCY_AUDIT_CAVEATS],
    config: input.config,
    inputPaths: input.inputPaths,
    summary: {
      vendorCount: vendors.length,
      vendorsWithSamples,
      vendorsWithKxbtc15mVerified,
      vendorsWithKxbtcdVerified,
      overallVerdict,
      recommendedNextAction,
    },
    vendors,
    vendorSampleRequest: buildVendorSampleRequest(),
    warnings,
  };
}

export function loadAndBuildVendorOrderbookSufficiencyAuditReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths?: Partial<VendorOrderbookSufficiencyAuditInputPaths>;
  io: VendorOrderbookSufficiencyAuditIo;
}): VendorOrderbookSufficiencyAuditReport {
  const resolvedInputPaths = buildDefaultVendorAuditInputPaths(input.inputPaths);
  const config = loadVendorOrderbookAuditConfig({
    configPath: resolvedInputPaths.configPath,
    io: input.io,
  });

  return buildVendorOrderbookSufficiencyAuditReport({
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: {
      configPath: resolvedInputPaths.configPath,
      samplesRoot: config.samplesRoot,
    },
    config,
    io: input.io,
  });
}
