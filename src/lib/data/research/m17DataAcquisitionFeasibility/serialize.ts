import type { M17DataAcquisitionFeasibilityReport } from "./types";

export function serializeM17DataAcquisitionFeasibilityMarkdown(
  report: M17DataAcquisitionFeasibilityReport,
): string {
  const lines: string[] = [
    `# M17 data-acquisition feasibility — \`${report.studyId}\``,
    "",
    `Generated: ${report.generatedAtUtc}`,
    `Analysis version: \`${report.analysisVersion}\``,
    `Code SHA: \`${report.codeAuthoritySha ?? "null"}\``,
    `Base main SHA: \`${report.baseMainSha}\``,
    `Decision status: **${report.decisionStatus}**`,
    "",
    report.disclaimer,
    "",
    "## Non-execution attestation",
    "",
    `- Purchase made: **${report.purchaseMade}**`,
    `- Subscription started: **${report.subscriptionStarted}**`,
    `- Capture started: **${report.captureStarted}**`,
    `- Trade or order placed: **${report.tradeOrOrderPlaced}**`,
    `- Network requests incurring cost: **${report.networkRequestsIncurringCost}**`,
    `- Strategy P&L computed: **${report.strategyPnlComputed}**`,
    `- Strategy rule invented/tuned: **${report.strategyRuleInventedOrTuned}**`,
    `- Pristine holdout purchase recommended: **${report.pristineHoldoutPurchaseRecommended}**`,
    "",
    "## Retained dataset (already available)",
    "",
    `| Fact | Value |`,
    `| --- | --- |`,
    `| Valid settlement joins | ${report.retainedDatasetFacts.validSettlementJoins} |`,
    `| SPENT UTC days | ${report.retainedDatasetFacts.spentUtcDayCount} |`,
    `| YES BBO from CryptoStruct | ${report.retainedDatasetFacts.yesBboDerivableFromCryptostruct} |`,
    `| Executable NO ask = 100 − YES bid | ${report.retainedDatasetFacts.executableNoAskAs100MinusYesBid} |`,
    `| Entry / expiration timing | ${report.retainedDatasetFacts.entryTimestampsAndExpirationPresent} |`,
    `| Source / exchange timestamps | ${report.retainedDatasetFacts.sourceAndExchangeTimestampsPresent} |`,
    "",
    "## Per-input classification",
    "",
    "| Input | Class | Summary |",
    "| --- | --- | --- |",
  ];

  for (const c of report.classifications) {
    lines.push(
      `| \`${c.inputId}\` | \`${c.classification}\` | ${c.summary.replace(/\|/g, "\\|")} |`,
    );
  }

  lines.push(
    "",
    "### Classification counts",
    "",
    "| Class | Count |",
    "| --- | ---: |",
  );
  for (const [k, v] of Object.entries(report.classificationCounts)) {
    lines.push(`| \`${k}\` | ${v} |`);
  }

  lines.push(
    "",
    "## Coinbase volatility contract (frozen research identity)",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| Instrument | \`${report.coinbaseVolatilityContract.instrument}\` |`,
    `| Timezone | ${report.coinbaseVolatilityContract.timezone} |`,
    `| Candle convention | ${report.coinbaseVolatilityContract.candleCloseConvention} |`,
    `| lookbackBars | ${report.coinbaseVolatilityContract.lookbackBars} |`,
    `| requiredCloseCount | ${report.coinbaseVolatilityContract.requiredCloseCount} |`,
    `| returnIntervalMs | ${report.coinbaseVolatilityContract.returnIntervalMs} |`,
    `| Exclude in-progress minute | ${report.coinbaseVolatilityContract.excludeInProgressMinute} |`,
    "",
    report.coinbaseVolatilityContract.notes,
    "",
    "## BRTI / banked-path distinctions",
    "",
    `- **Raw BRTI observations:** ${report.brtiPathDistinctions.rawBrtiObservations}`,
    `- **Vendor 1Hz/5Hz series:** ${report.brtiPathDistinctions.vendorComputed1hzOr5hzSeries}`,
    `- **60-sample banked average:** ${report.brtiPathDistinctions.sixtySampleBankedAverage}`,
    `- **Final official settlement:** ${report.brtiPathDistinctions.finalOfficialSettlementValue}`,
    "",
    "## Candidate providers / products",
    "",
    "| Provider | Product / feed | Historical vs prospective | Cost (public) | 5Hz→1Hz docs? | Leakage-safe exploratory? |",
    "| --- | --- | --- | --- | --- | --- |",
  );

  for (const p of report.candidateProducts) {
    lines.push(
      `| ${p.provider} | ${p.productOrFeedName.replace(/\|/g, "\\|")} | ${p.historicalVsProspective} | ${p.expectedCostOrPricing.replace(/\|/g, "\\|")} | ${p.documents5hzTo1hzSemantics.replace(/\|/g, "\\|")} | ${p.supportsLeakageSafeM17Exploratory.replace(/\|/g, "\\|")} |`,
    );
  }

  lines.push(
    "",
    "### Product detail (fields / timestamps / blockers)",
    "",
  );
  for (const p of report.candidateProducts) {
    lines.push(
      `#### ${p.provider} — ${p.productOrFeedName}`,
      "",
      `- Date range: ${p.dateRangeAvailable}`,
      `- Resolution: ${p.resolutionAndSampleRate}`,
      `- Raw fields: ${p.rawFieldsProvided}`,
      `- Source timestamps: ${p.sourceTimestamps}`,
      `- Receipt timestamps: ${p.receiptTimestamps}`,
      `- BRTI/CFB values: ${p.includesBrtiOrCfbValues}`,
      `- Same book adapter as M16-ER: ${p.sameMarketBookAdapterAsM16Er}`,
      `- Licensing: ${p.licensingOrRedistribution}`,
      `- Blockers after acquire:`,
    );
    for (const b of p.blockersRemainingAfterAcquire) {
      lines.push(`  - \`${b}\``);
    }
    lines.push(
      `- Evidence: ${p.evidenceUrlsOrPaths.map((u) => `\`${u}\``).join(", ")}`,
      `- Notes: ${p.notes}`,
      "",
    );
  }

  lines.push(
    "## Estimated minimum acquisition needed",
    "",
  );
  for (const item of report.estimatedMinimumAcquisitionNeeded) {
    lines.push(`- ${item}`);
  }

  lines.push(
    "",
    "## Enablement after acquisition options",
    "",
    `| Capability | Enabled? | Note |`,
    `| --- | --- | --- |`,
    `| Exploratory eval on 34 SPENT days | ${report.enablement.exploratoryEvalOn34SpentDays} | ${report.enablement.exploratoryEvalOn34SpentDaysNote.replace(/\|/g, "\\|")} |`,
    `| New exploratory prospective study | ${report.enablement.newExploratoryProspectiveStudy} | ${report.enablement.newExploratoryProspectiveStudyNote.replace(/\|/g, "\\|")} |`,
    `| Confirmatory holdout evaluation | ${report.enablement.confirmatoryHoldoutEvaluation} | ${report.enablement.confirmatoryHoldoutEvaluationNote.replace(/\|/g, "\\|")} |`,
    "",
    "## Prospective exploratory option (not authorized)",
    "",
    report.prospectiveExploratoryOption.summary,
    "",
    `- Described: **${report.prospectiveExploratoryOption.described}**`,
    `- Authorized: **${report.prospectiveExploratoryOption.authorized}**`,
    `- Executed: **${report.prospectiveExploratoryOption.executed}**`,
    "",
    "## Remaining blockers",
    "",
  );
  for (const b of report.remainingBlockers) {
    lines.push(`- \`${b}\``);
  }

  lines.push(
    "",
    "## Local evidence SHA-256",
    "",
    "| Artifact | SHA-256 |",
    "| --- | --- |",
  );
  for (const [k, v] of Object.entries(report.localEvidenceSha256).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    lines.push(`| \`${k}\` | \`${v}\` |`);
  }

  lines.push(
    "",
    "## Public evidence URLs",
    "",
  );
  for (const u of report.publicEvidenceUrls) {
    lines.push(`- ${u}`);
  }

  lines.push(
    "",
    "## Decision",
    "",
    `**\`${report.decisionStatus}\`** — Coinbase 1m OHLC and raw BRTI observations look historically obtainable (public candles / Kalshi HOUR or licensed CFB), but the banked 60-sample path product and exact 5Hz→1Hz identity remain unverified, and the YES-overpriced→enter-NO mapping is not a data purchase. No pristine holdout purchase is recommended. No purchase, subscription, capture, trade, or order occurred.`,
    "",
  );

  return lines.join("\n");
}
