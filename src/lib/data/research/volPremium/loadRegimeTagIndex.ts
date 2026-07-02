import type { RegimeMarketTags, RegimeTagsReport } from "@/lib/data/research/regimeTagging/regimeTaggingTypes";

import { buildVolPremiumJoinKey } from "./parseVolPremiumObservations";
import { VolPremiumError, VolPremiumErrorCode } from "./volPremiumTypes";

export function parseRegimeTagsReportJson(json: string): RegimeTagsReport {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new VolPremiumError(
      "regime-tags.json contains invalid JSON",
      VolPremiumErrorCode.INVALID_JSON,
    );
  }

  if (
    typeof parsed !== "object"
    || parsed === null
    || !("markets" in parsed)
    || !Array.isArray((parsed as RegimeTagsReport).markets)
  ) {
    throw new VolPremiumError(
      "regime-tags.json is missing markets array",
      VolPremiumErrorCode.INVALID_DOCUMENT,
    );
  }

  return parsed as RegimeTagsReport;
}

export function buildRegimeTagsIndex(
  report: RegimeTagsReport,
): Map<string, RegimeMarketTags> {
  const index = new Map<string, RegimeMarketTags>();

  for (const market of report.markets) {
    index.set(market.joinKey, market.tags);
    index.set(buildVolPremiumJoinKey(market.strategyId, market.marketTicker), market.tags);
  }

  return index;
}

export function resolveRegimeTagsForMarket(
  index: ReadonlyMap<string, RegimeMarketTags> | undefined,
  strategyId: string,
  marketTicker: string,
): RegimeMarketTags | null {
  if (!index) {
    return null;
  }

  return index.get(buildVolPremiumJoinKey(strategyId, marketTicker)) ?? null;
}
