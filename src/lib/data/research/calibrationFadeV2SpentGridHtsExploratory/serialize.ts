import type { CfV2SpentGridHtsReport } from "./types";

export function serializeCfV2SpentGridHtsMarkdown(
  report: CfV2SpentGridHtsReport,
): string {
  const e = report.economics;
  const inf = e.inference;
  const lines: string[] = [
    `# ${report.studyId}`,
    ``,
    report.disclaimer,
    ``,
    `## Economic result (primary)`,
    ``,
    `| Metric | Value |`,
    `| --- | ---: |`,
    `| N (evaluable markets) | ${e.n} |`,
    `| G (UTC entry-day clusters) | ${e.g} |`,
    `| Mean net P&L ¢/contract | ${fmt(e.meanNetPnlCents)} |`,
    `| Median net P&L ¢ | ${fmt(e.medianNetPnlCents)} |`,
    `| Total simulated net P&L ¢ | ${fmt(e.totalNetPnlCents)} |`,
    `| Mean gross P&L ¢ | ${fmt(e.meanGrossPnlCents)} |`,
    `| Mean entry fee ¢ | ${fmt(e.meanFeeCents)} |`,
    `| Mean entry price (noAsk) ¢ | ${fmt(e.meanEntryPriceCents)} |`,
    `| NO settlement rate | ${fmt(e.noSettlementRate)} |`,
  ];

  if (inf) {
    lines.push(
      `| CR2 SE ¢ | ${fmt(inf.cr2StandardError)} |`,
      `| Two-sided 95% CI ¢ | [${fmt(inf.ci95LowerCents)}, ${fmt(inf.ci95UpperCents)}] |`,
      `| df (G−1) | ${inf.degreesOfFreedom} |`,
    );
  } else {
    lines.push(`| Two-sided 95% CI ¢ | unavailable |`);
  }

  lines.push(
    ``,
    `### Interpretation`,
    ``,
    `- **Status:** \`${report.interpretation.status}\``,
    `- ${report.interpretation.rationale}`,
    ``,
    `## Coverage`,
    ``,
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Rows scanned | ${report.coverage.rowsScanned} |`,
    `| Eligible rows | ${report.coverage.eligibleRows} |`,
    `| Selected markets | ${report.coverage.selectedMarkets} |`,
    `| Evaluable markets | ${report.coverage.evaluableMarkets} |`,
    `| Unevaluable markets | ${report.coverage.unevaluableMarkets} |`,
    `| Selected with half-spread mismatch | ${report.coverage.selectedWithHalfSpreadMismatch} |`,
    `| Selected Class B uncertain | ${report.coverage.selectedClassBUncertain} |`,
    ``,
    `Exclusion counts: \`${JSON.stringify(report.coverage.exclusionCounts)}\``,
    ``,
    `## Execution limitations`,
    ``,
  );
  for (const lim of report.executionLimitations) {
    lines.push(`- ${lim}`);
  }

  lines.push(``, `## Prior evidence notes`, ``);
  for (const note of report.priorEvidenceNotes) {
    lines.push(`- ${note}`);
  }

  lines.push(
    ``,
    `## Per-day clusters`,
    ``,
    `| UTC day | Markets | Mean net ¢ | Total net ¢ |`,
    `| --- | ---: | ---: | ---: |`,
  );
  for (const day of e.perDay) {
    lines.push(
      `| ${day.utcDayKey} | ${day.marketCount} | ${fmt(day.meanNetPnlCents)} | ${fmt(day.totalNetPnlCents)} |`,
    );
  }

  lines.push(
    ``,
    `## Leave-one-day-out means (descriptive)`,
    ``,
    `| Held-out day | N remaining | Mean net ¢ |`,
    `| --- | ---: | ---: |`,
  );
  for (const row of e.leaveOneDayOutMeansCents) {
    lines.push(
      `| ${row.heldOutUtcDayKey} | ${row.nRemaining} | ${fmt(row.meanNetPnlCents)} |`,
    );
  }

  lines.push(
    ``,
    `## Attestation`,
    ``,
    `- Simulated P&L at observed quotes: ${report.attestation.simulatedPnlAtObservedQuotes}`,
    `- No purchase / subscription / live trade / capture`,
    `- Continuous-first-crossing hypothesis config not modified`,
    `- No threshold sweep / vol ablation / avg_60s strategy feature`,
    ``,
    `Code authority SHA: \`${report.codeAuthoritySha}\``,
    `Generated (UTC): ${report.generatedAtUtc}`,
    ``,
  );
  return lines.join("\n");
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return value.toFixed(4);
}
