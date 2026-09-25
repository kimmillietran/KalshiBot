import type { M17PreentryFeatureRecoveryReport } from "./types";

export function serializeM17PreentryFeatureRecoveryMarkdown(
  report: M17PreentryFeatureRecoveryReport,
): string {
  const lines: string[] = [
    `# M17 pre-entry feature recovery`,
    ``,
    report.disclaimer,
    ``,
    `## Status`,
    ``,
    `- Study: \`${report.studyId}\``,
    `- Analysis version: \`${report.analysisVersion}\``,
    `- Generated (UTC): ${report.generatedAtUtc}`,
    `- Code authority SHA: \`${report.codeAuthoritySha}\``,
    `- Base main SHA: \`${report.baseMainSha}\``,
    ``,
    `## Attestation`,
    ``,
    `- No purchase, subscription, trade, order, or strategy P&L occurred.`,
    `- Feature coverage is **not** a strategy result.`,
    `- M17 entry rule was not modified or frozen.`,
    `- O6 settlement-fidelity questions were not resolved.`,
    `- Settlement outcomes were not used to rank, select, or tune candidates.`,
    `- No live capture was started.`,
    `- BRTI, banked samples, and 5Hz→1Hz identity were not inferred.`,
    ``,
    `## Inputs`,
    ``,
    `| Input | Path / value | SHA-256 |`,
    `| --- | --- | --- |`,
    `| Retained friction samples | \`${report.inputs.samplesPath}\` | \`${report.inputs.samplesSha256}\` |`,
    `| Sample rows | ${report.inputs.samplesRowCount} | |`,
    `| CryptoStruct raw ZIP dir | \`${report.inputs.rawZipDir}\` | (${report.inputs.rawZipCount} day ZIPs) |`,
    `| Adapter | ${report.inputs.adapterId} | \`${report.inputs.adapterIdentity}\` |`,
    `| Regenerated book features | \`${report.inputs.bookFeaturesPath ?? "n/a"}\` | \`${report.inputs.bookFeaturesSha256 ?? "n/a"}\` |`,
    `| Coinbase candles dir | \`${report.inputs.candlesDir ?? "n/a"}\` | (gitignored) |`,
    ``,
    `## Coinbase public source`,
    ``,
    `- Base: \`${report.coinbasePublicSource.baseUrl}\``,
    `- Path: \`${report.coinbasePublicSource.path}?granularity=${report.coinbasePublicSource.granularitySeconds}\``,
    `- Docs: ${report.coinbasePublicSource.docsUrl}`,
    `- Auth required: ${report.coinbasePublicSource.authenticationRequired}`,
    `- Purchase required: ${report.coinbasePublicSource.purchaseRequired}`,
    `- Noted in PR: #${report.coinbasePublicSource.notedInPr}`,
    `- Retrieval attempted: ${report.coinbaseRetrieval.attempted}`,
    `- Usable without cost: ${report.coinbaseRetrieval.usableWithoutCost}`,
    `- Purchase/subscription encountered: ${report.coinbaseRetrieval.purchaseOrSubscriptionEncountered}`,
    `- Blocker: ${report.coinbaseRetrieval.blocker ?? "none"}`,
    `- Retrieved UTC days: ${report.coinbaseRetrieval.retrievedUtcDays}`,
    `- Total candles: ${report.coinbaseRetrieval.totalCandles}`,
    `- Timestamp convention: ${report.coinbaseRetrieval.timestampConvention}`,
    ``,
    `## Frozen volatility contract`,
    ``,
    `| Field | Value |`,
    `| --- | --- |`,
    `| Instrument | ${report.volatilityContract.instrument} |`,
    `| lookbackBars | ${report.volatilityContract.lookbackBars} |`,
    `| requiredCloseCount | ${report.volatilityContract.requiredCloseCount} |`,
    `| Candle close offset | ${report.volatilityContract.candleCloseOffsetMs} ms |`,
    `| Eligibility | ${report.volatilityContract.completedCandleEligibility} |`,
    `| Annualization | ${report.volatilityContract.annualization} |`,
    `| Cited high-vol ≥ | ${report.volatilityContract.citedHighVolMinInclusive} |`,
    `| Regime authority | \`${report.volatilityContract.regimeThresholdAuthority}\` |`,
    ``,
    `## Coverage summary`,
    ``,
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Rows | ${report.coverage.rows} |`,
    `| Markets | ${report.coverage.markets} |`,
    `| UTC days | ${report.coverage.utcDays} |`,
    `| Book features OK | ${report.coverage.bookOk} |`,
    `| Half-spread mismatches vs retained | ${report.coverage.halfSpreadMismatch} |`,
    `| Time remaining present | ${report.coverage.timeRemainingPresent} |`,
    `| Volatility OK | ${report.coverage.volatilityOk} |`,
    `| Market + time + volatility complete | ${report.coverage.marketTimeVolComplete} |`,
    `| Cited high-vol true / false / unknown | ${report.coverage.citedHighVolTrue} / ${report.coverage.citedHighVolFalse} / ${report.coverage.citedHighVolUnknown} |`,
    ``,
    `## Missingness`,
    ``,
    `- Book status counts: ${JSON.stringify(report.missingness.bookStatusCounts)}`,
    `- Volatility status counts: ${JSON.stringify(report.missingness.volatilityStatusCounts)}`,
    `- Exclusions: ${report.missingness.exclusions.length === 0 ? "none" : report.missingness.exclusions.join("; ")}`,
    ``,
    `## Candle coverage by UTC day`,
    ``,
    `| UTC day | Candles | Expected minutes | Gaps | SHA-256 |`,
    `| --- | ---: | ---: | ---: | --- |`,
  ];

  for (const day of report.candleCoverageByDay) {
    lines.push(
      `| ${day.utcDayKey} | ${day.candleCount} | ${day.expectedMinuteCount} | ${day.gapCount} | \`${day.sha256 ?? "n/a"}\` |`,
    );
  }

  lines.push(
    ``,
    `## Feature coverage by UTC day`,
    ``,
    `| UTC day | Rows | Book OK | Half-spread mismatch | Vol OK | Market+time+vol complete |`,
    `| --- | ---: | ---: | ---: | ---: | ---: |`,
  );

  for (const day of report.coverageByUtcDay) {
    lines.push(
      `| ${day.utcDayKey} | ${day.rows} | ${day.bookOk} | ${day.halfSpreadMismatch} | ${day.volatilityOk} | ${day.marketTimeVolComplete} |`,
    );
  }

  lines.push(``);
  return lines.join("\n");
}
