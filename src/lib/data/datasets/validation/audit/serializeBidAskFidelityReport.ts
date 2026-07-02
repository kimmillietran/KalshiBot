import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { BidAskFidelityReport } from "./bidAskFidelityTypes";

/** Deterministic JSON serialization for bid/ask fidelity reports. */
export function serializeBidAskFidelityReport(report: BidAskFidelityReport): string {
  return stableStringify({
    generatedAt: report.generatedAt,
    inputDir: report.inputDir,
    outputPath: report.outputPath,
    series: report.series.map((series) => ({
      seriesTicker: series.seriesTicker,
      marketCount: series.marketCount,
      candleCount: series.candleCount,
      suspiciousZeroSpreadMarketCount: series.suspiciousZeroSpreadMarketCount,
      statistics: series.statistics,
      warnings: [...series.warnings],
      markets: series.markets.map((market) => ({
        seriesTicker: market.seriesTicker,
        marketTicker: market.marketTicker,
        sourcePath: market.sourcePath,
        statistics: market.statistics,
        warnings: [...market.warnings],
        suspiciousZeroSpread: market.suspiciousZeroSpread,
      })),
    })),
    summary: {
      seriesCount: report.summary.seriesCount,
      marketCount: report.summary.marketCount,
      candleCount: report.summary.candleCount,
      suspiciousZeroSpreadMarketCount:
        report.summary.suspiciousZeroSpreadMarketCount,
      statistics: report.summary.statistics,
      warnings: [...report.summary.warnings],
    },
  });
}
