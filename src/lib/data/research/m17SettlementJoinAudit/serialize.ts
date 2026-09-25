/**
 * Markdown serialization for the M17 settlement-join audit report.
 */

import type { M17SettlementJoinAuditReport } from "./types";

function pct(n: number): string {
  return `${(n * 100).toFixed(4)}%`;
}

export function serializeM17SettlementJoinReportMarkdown(
  report: M17SettlementJoinAuditReport,
): string {
  const c = report.counts;
  const d = report.decision;
  const lines: string[] = [
    `# M17 settlement-join audit — \`${report.studyId}\``,
    "",
    `Generated: ${report.generatedAtUtc}`,
    `Analysis version: \`${report.analysisVersion}\``,
    `Code SHA: \`${report.codeAuthoritySha ?? "null"}\``,
    "",
    report.disclaimer,
    "",
    "## Strategy definition (fixed — not tuned here)",
    "",
    `- Name: \`${report.strategyDefinitionFixed.name}\``,
    `- Side: ${report.strategyDefinitionFixed.side}`,
    `- Fee: ${report.strategyDefinitionFixed.fee}`,
    `- Outcome label: ${report.strategyDefinitionFixed.outcomeLabel}`,
    `- \`avg_60s_data\` wired into strategy gates: **${report.strategyDefinitionFixed.avg60sDataWiredIntoGates}**`,
    "",
    "## Input identities",
    "",
    "| Key | Value |",
    "| --- | --- |",
  ];
  for (const [k, v] of Object.entries(report.inputIdentities).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    lines.push(`| \`${k}\` | \`${v}\` |`);
  }
  lines.push(
    "",
    `Excluded known-incomplete ticker: \`${report.excludedKnownIncompleteTicker}\``,
    "",
    "## Decision-relevant answers",
    "",
    `1. **M17-eligible entries with valid official settlement outcomes:** ${c.validOfficialSettlementLabel.toLocaleString()}`,
    `2. **Settlement-join percentage:** ${pct(d.settlementJoinPercentage)} (${c.validOfficialSettlementLabel.toLocaleString()} / ${c.totalEligibleRecords.toLocaleString()})`,
    `3. **Independent markets / dates remaining (valid join):** ${c.independentMarketsWithValidJoin.toLocaleString()} markets / ${c.eligibleDatesWithValidJoin.toLocaleString()} dates (eligible universe: ${c.independentMarketsRepresented.toLocaleString()} markets / ${c.eligibleDatesRepresented.toLocaleString()} dates)`,
    `4. **Meets minimum of ${d.minimumIndependentMarketsRequired} independent markets:** **${d.meetsMinimumIndependentMarkets ? "yes" : "no"}**`,
    `5. **Exploratory usability:** \`${d.exploratoryUsability}\``,
    `6. **Confirmatory limitation:** ${d.confirmatoryLimitation}`,
    `7. **Pristine validation/holdout purchase needs:**`,
    "",
  );
  for (const need of d.pristineValidationPurchaseNeeds) {
    lines.push(`   - ${need}`);
  }
  lines.push(
    "",
    "## Separated verdicts",
    "",
    `| Axis | Verdict |`,
    `| --- | --- |`,
    `| Data availability | \`${d.dataAvailability}\` |`,
    `| Exploratory usability | \`${d.exploratoryUsability}\` |`,
    `| Confirmatory validity | \`${d.confirmatoryValidity}\` |`,
    "",
    "### Claimed prior entry-audit note",
    "",
    d.claimedPriorEntryAuditNote,
    "",
    "## Counts",
    "",
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Total eligible records | ${c.totalEligibleRecords} |`,
    `| Unambiguous market/ticker identity | ${c.unambiguousMarketIdentity} |`,
    `| Ambiguous market identity | ${c.ambiguousMarketIdentity} |`,
    `| Valid official settlement label | ${c.validOfficialSettlementLabel} |`,
    `| Missing labels | ${c.missingLabels} |`,
    `| Normalization / import-validation failures | ${c.normalizationOrImportValidationFailures} |`,
    `| Conflicting or duplicate labels | ${c.conflictingOrDuplicateLabels} |`,
    `| Excluded known-incomplete ticker | ${c.excludedKnownIncompleteTicker} |`,
    `| Non-numeric expiration_value | ${c.nonNumericExpirationValue} |`,
    `| Valid executable-book inputs | ${c.validExecutableBookInputs} |`,
    `| Valid BTC settlement-path inputs | ${c.validBtcSettlementPathInputs} (not measured / absent on CS books) |`,
    `| Independent markets (eligible) | ${c.independentMarketsRepresented} |`,
    `| Eligible dates | ${c.eligibleDatesRepresented} |`,
    `| Independent markets with valid join | ${c.independentMarketsWithValidJoin} |`,
    `| Dates with valid join | ${c.eligibleDatesWithValidJoin} |`,
    "",
    "## SPENT/exploratory descriptive outcome counts",
    "",
    `_${report.spentExploratoryOutcomeCounts.label}_`,
    "",
    `| Result | Count |`,
    `| --- | ---: |`,
    `| yes | ${report.spentExploratoryOutcomeCounts.yes} |`,
    `| no | ${report.spentExploratoryOutcomeCounts.no} |`,
    `| unlabeled / excluded | ${report.spentExploratoryOutcomeCounts.unlabeledOrExcluded} |`,
    "",
    "## Zero network / capture confirmation",
    "",
    `| Channel | Count |`,
    `| --- | ---: |`,
    `| Market-data requests | ${report.zeroNetworkConfirmation.marketDataRequests} |`,
    `| WebSocket captures | ${report.zeroNetworkConfirmation.websocketCaptures} |`,
    `| CryptoStruct purchases | ${report.zeroNetworkConfirmation.cryptostructPurchases} |`,
    `| Trades | ${report.zeroNetworkConfirmation.trades} |`,
    "",
    "## Coverage by date",
    "",
    `| UTC day | Eligible | Valid join | Join % | Markets |`,
    `| --- | ---: | ---: | ---: | ---: |`,
  );
  for (const row of report.coverageByDate) {
    lines.push(
      `| ${row.utcDayKey} | ${row.eligibleRecords} | ${row.validJoinedRecords} | ${pct(row.joinPercentage)} | ${row.independentMarkets} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}
