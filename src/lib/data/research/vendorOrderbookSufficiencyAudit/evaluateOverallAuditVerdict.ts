import type {
  OverallAuditVerdict,
  VendorAuditEntry,
  VendorAuditRecommendedNextAction,
} from "./vendorOrderbookSufficiencyAuditTypes";
import { isPromisingVerdict, isSufficientVerdict } from "./evaluateVendorSufficiency";

export function evaluateOverallAuditVerdict(input: {
  vendors: readonly VendorAuditEntry[];
}): {
  overallVerdict: OverallAuditVerdict;
  recommendedNextAction: VendorAuditRecommendedNextAction;
} {
  const thirdPartyVendors = input.vendors.filter(
    (vendor) => vendor.vendorId !== "official-kalshi",
  );

  const vendorsWithSamples = thirdPartyVendors.filter(
    (vendor) => vendor.sampleAudit?.sampleStatus === "present",
  );

  if (vendorsWithSamples.length === 0) {
    return {
      overallVerdict: "request-vendor-samples",
      recommendedNextAction: "request-vendor-samples",
    };
  }

  const sufficientLeadLag = thirdPartyVendors.filter((vendor) =>
    isSufficientVerdict(vendor.sufficiency.kxbtc15mLeadLag),
  );
  const promisingLeadLag = thirdPartyVendors.filter((vendor) =>
    isPromisingVerdict(vendor.sufficiency.kxbtc15mLeadLag),
  );

  if (sufficientLeadLag.length > 0) {
    return {
      overallVerdict: "vendor-data-sufficient-for-backfill",
      recommendedNextAction: "build-overlap-validation",
    };
  }

  if (promisingLeadLag.length > 0) {
    return {
      overallVerdict: "vendor-data-promising-needs-overlap-validation",
      recommendedNextAction: "request-vendor-samples",
    };
  }

  const allInsufficient = thirdPartyVendors.every((vendor) =>
    vendor.sampleAudit?.sampleStatus === "present"
    && vendor.sufficiency.kxbtc15mLeadLag.startsWith("insufficient"),
  );

  if (allInsufficient && vendorsWithSamples.length > 0) {
    return {
      overallVerdict: "vendor-data-insufficient",
      recommendedNextAction: "continue-own-forward-capture",
    };
  }

  return {
    overallVerdict: "vendor-data-unknown",
    recommendedNextAction: "request-vendor-samples",
  };
}
