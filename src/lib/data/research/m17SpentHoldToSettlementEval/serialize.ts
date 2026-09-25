/**
 * Markdown serialization for M17 SPENT hold-to-settlement exploratory report.
 */

import type { M17SpentHoldToSettlementReport } from "./types";

function pct(n: number): string {
  return `${(n * 100).toFixed(4)}%`;
}

export function serializeM17SpentHoldToSettlementMarkdown(
  report: M17SpentHoldToSettlementReport,
): string {
  const lines: string[] = [
    `# M17 SPENT hold-to-settlement exploratory eval — \`${report.studyId}\``,
    "",
    `Generated: ${report.generatedAtUtc}`,
    `Analysis version: \`${report.analysisVersion}\``,
    `Code SHA: \`${report.codeAuthoritySha ?? "null"}\``,
    `Completion: **${report.completionStatus}**`,
    `Dataset provenance: **${report.datasetProvenance}**`,
    "",
    report.disclaimer,
    "",
    "## Frozen strategy definition actually used",
    "",
    `- Name: \`${report.strategyDefinitionUsed.name}\``,
    `- Side: ${report.strategyDefinitionUsed.side}`,
    `- Fee: ${report.strategyDefinitionUsed.fee}`,
    `- Outcome label: ${report.strategyDefinitionUsed.outcomeLabel}`,
    `- \`avg_60s_data\` wired into gates: **${report.strategyDefinitionUsed.avg60sDataWiredIntoGates}**`,
    `- Cited regime filters: YES mid ∈ [${report.strategyDefinitionUsed.citedRegimeFilters.yesMidpointInclusiveMin}, ${report.strategyDefinitionUsed.citedRegimeFilters.yesMidpointExclusiveMax}), time remaining < ${report.strategyDefinitionUsed.citedRegimeFilters.timeRemainingMsExclusiveMax} ms, vol ≥ ${report.strategyDefinitionUsed.citedRegimeFilters.volatilityMinInclusive}, direction ${report.strategyDefinitionUsed.citedRegimeFilters.calibrationDirection}`,
    "",
    "### SettlementEstimate semantics (PR #123)",
    "",
    `- expiration_value: ${report.strategyDefinitionUsed.settlementEstimateSemantics.expirationValue}`,
    `- avg_60s_data: ${report.strategyDefinitionUsed.settlementEstimateSemantics.avg60sData}`,
    `- last_60s_windowed_average_15min: ${report.strategyDefinitionUsed.settlementEstimateSemantics.last60sWindowedAverage15min}`,
    "",
    "## Frozen decision inventory",
    "",
    "| Id | Status | Summary |",
    "| --- | --- | --- |",
  ];
  for (const item of report.frozenDecisionInventory) {
    lines.push(
      `| \`${item.id}\` | \`${item.status}\` | ${item.summary.replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push(
    "",
    "### Missing decisions blocking P&L",
    "",
  );
  for (const id of report.missingFrozenDecisionsBlockingPnl) {
    lines.push(`- \`${id}\``);
  }
  const f = report.featureAvailability;
  const c = report.candidatePopulation;
  const p = report.performance;
  lines.push(
    "",
    "## Candidate population and feature completeness",
    "",
    `| Metric | Value |`,
    `| --- | ---: |`,
    `| Retained executable samples | ${c.retainedExecutableSamples} |`,
    `| Claimed prior 20,923/72 artifact | \`${c.claimedPriorEntryArtifact}\` |`,
    `| Recomputed under frozen regime filters | ${c.recomputedUnderFrozenRegimeFilters ?? "null"} |`,
    `| Independent markets (retained executable) | ${c.independentMarketsInRetainedExecutable} |`,
    `| Dates (retained executable) | ${c.datesInRetainedExecutable} |`,
    `| Valid settlement-label coverage | ${pct(c.validSettlementLabelCoverageShare)} |`,
    `| Unambiguous market identity | ${f.unambiguousMarketIdentity} |`,
    `| Valid official settlement join | ${f.validOfficialSettlementJoin} |`,
    `| Incomplete ticker excluded | ${f.incompleteTickerExcluded} |`,
    `| Non-numeric expiration excluded | ${f.nonNumericExpirationExcluded} |`,
    `| YES midpoint present | ${f.yesMidpointPresent} |`,
    `| High-volatility feature present | ${f.highVolatilityFeaturePresent} |`,
    `| Time-remaining feature present | ${f.timeRemainingFeaturePresent} |`,
    `| Settlement-state path present | ${f.settlementStatePathPresent} |`,
    `| Remaining-average threshold present | ${f.remainingAverageThresholdPresent} |`,
    `| Complete required features for entry | ${f.completeRequiredFeaturesForEntry} |`,
    "",
    c.recomputedRegimeFilterNote,
    "",
    "## Exploratory performance",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| Status | \`${p.status}\` |`,
    `| Reason | ${p.reason ?? "—"} |`,
    `| NO entries simulated | ${p.noEntriesSimulated} |`,
    `| Gross terminal outcome sum (¢) | ${p.grossTerminalOutcomeCentsSum ?? "null"} |`,
    `| One-taker-fee-adjusted return sum (¢) | ${p.oneTakerFeeAdjustedReturnCentsSum ?? "null"} |`,
    `| Win rate | ${p.winRate ?? "null"} |`,
    `| Average return (¢) | ${p.averageReturnCents ?? "null"} |`,
    `| Median return (¢) | ${p.medianReturnCents ?? "null"} |`,
    `| Variance (¢²) | ${p.varianceReturnCents ?? "null"} |`,
    `| Max drawdown (¢) | ${p.maxDrawdownCents ?? "null"} |`,
    "",
    "## Baselines",
    "",
    `- No-trade: mean fee-adjusted return = ${report.baselines.noTrade.meanFeeAdjustedReturnCents}¢ (${report.baselines.noTrade.note})`,
    `- Market-implied: \`${report.baselines.marketImplied.status}\` — ${report.baselines.marketImplied.reason}`,
    `- Fixed settlement-threshold: \`${report.baselines.fixedSettlementThreshold.status}\` — ${report.baselines.fixedSettlementThreshold.reason}`,
    "",
    "## Leakage controls",
    "",
  );
  for (const s of report.leakageControlsApplied) {
    lines.push(`- ${s}`);
  }
  lines.push(
    "",
    "## Confirmatory boundary (explicit)",
    "",
    `- This is exploratory analysis on M16-ER SPENT data.`,
    `- It cannot establish out-of-sample performance: **${report.confirmatoryBoundary.canEstablishOutOfSamplePerformance}**.`,
    `- It cannot justify live trading: **${report.confirmatoryBoundary.canJustifyLiveTrading}**.`,
    `- Later confirmatory test requires:`,
    "",
  );
  for (const need of report.confirmatoryBoundary.pristinePurchaseNeeds) {
    lines.push(`  - ${need}`);
  }
  lines.push(
    "",
    "## Pristine validation/holdout purchase recommendation",
    "",
    `**Justified now: ${report.pristinePurchaseRecommendation.justifiedNow ? "yes" : "no"}**`,
    "",
    report.pristinePurchaseRecommendation.rationale,
    "",
    "## Zero network / capture confirmation",
    "",
    `| Channel | Count |`,
    `| --- | ---: |`,
    `| Market-data requests | ${report.zeroNetworkConfirmation.marketDataRequests} |`,
    `| WebSocket captures | ${report.zeroNetworkConfirmation.websocketCaptures} |`,
    `| CryptoStruct purchases | ${report.zeroNetworkConfirmation.cryptostructPurchases} |`,
    `| Trades | ${report.zeroNetworkConfirmation.trades} |`,
    `| Order placements | ${report.zeroNetworkConfirmation.orderPlacements} |`,
    "",
    "## Input identities",
    "",
    "| Key | Value |",
    "| --- | --- |",
  );
  for (const [k, v] of Object.entries(report.inputIdentities).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    lines.push(`| \`${k}\` | \`${v}\` |`);
  }
  return `${lines.join("\n")}\n`;
}
