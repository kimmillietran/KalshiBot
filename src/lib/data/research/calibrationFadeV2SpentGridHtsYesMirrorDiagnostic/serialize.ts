import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

import type { PairedMirrorRow, YesMirrorDiagnosticReport } from "./types";

export function sha256HexOfUtf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function renderYesMirrorReportMarkdown(report: YesMirrorDiagnosticReport): string {
  const lines: string[] = [];
  const e = report.economics;
  const a = report.accounting;
  const c = report.cohort;
  const inf = e.inference;

  lines.push("# CF-v2 SPENT grid HTS — YES-side mirror diagnostic");
  lines.push("");
  lines.push(`- Study: \`${report.studyId}\` / \`${report.analysisVersion}\``);
  lines.push(`- Generated (UTC): ${report.generatedAtUtc}`);
  lines.push(`- Code authority SHA: \`${report.codeAuthoritySha}\``);
  lines.push("");
  lines.push("## Framing");
  lines.push("");
  lines.push(report.disclaimer);
  lines.push("");
  lines.push(
    "This is a **paired accounting / execution diagnostic** of the opposite side of "
      + "PR #134’s selected cohort — not a new independent mechanism test and not "
      + "confirmation of a YES-fade thesis.",
  );
  lines.push("");
  lines.push("## Prior exposure");
  lines.push("");
  lines.push(`- Prior study: \`${report.priorExposure.noGridStudyId}\``);
  lines.push(`- ${report.priorExposure.noGridResultSummary}`);
  lines.push(
    `- YES mirror selected after observing NO result: `
      + `${report.priorExposure.yesMirrorSelectedAfterObservingNoResult}`,
  );
  lines.push(
    `- Independent mechanism test: ${report.priorExposure.isIndependentMechanismTest}`,
  );
  lines.push(
    `- Pre-outcome preregistration: ${report.priorExposure.isPreOutcomePreregistration}`,
  );
  lines.push(
    `- Attempted history: ${report.priorExposure.attemptedHistory.join(" → ")}`,
  );
  lines.push("");
  lines.push("## Cohort preservation");
  lines.push("");
  lines.push(
    `- Source selected-entries SHA-256: \`${c.sourceSelectedEntriesSha256}\``,
  );
  lines.push(
    `- Source per-market-trades SHA-256: \`${c.sourcePerMarketTradesSha256}\``,
  );
  lines.push(`- Hashes verified: **${c.hashesVerified}**`);
  lines.push(
    `- Original N/G: ${c.originalN} / ${c.originalG}; reproduced NO mean: `
      + `${c.reproducedNoMeanNetPnlCents.toFixed(6)}¢ `
      + `(matches recorded: **${c.noMeanMatchesRecordedPrecision}**)`,
  );
  lines.push(
    `- Paired evaluable N/G: **${c.pairedN} / ${c.pairedG}** `
      + `(unevaluable ${c.unevaluableCount}; differs from 321: `
      + `${c.cohortDiffersFromOriginal321})`,
  );
  if (Object.keys(c.unevaluableReasons).length > 0) {
    lines.push("- Unevaluable reasons:");
    for (const [k, v] of Object.entries(c.unevaluableReasons)) {
      lines.push(`  - ${k}: ${v}`);
    }
  }
  lines.push("");
  lines.push("## Accounting identity");
  lines.push("");
  lines.push(`- Formula: \`${a.identityFormula}\``);
  lines.push(
    `- Holds for all paired rows: **${a.identityHoldsForAllPairedRows}** `
      + `(violations: ${a.identityViolationCount})`,
  );
  lines.push(`- Mean NO net (paired): ${a.meanNoNetPnlCents.toFixed(6)}¢`);
  lines.push(`- Mean YES spread: ${a.meanYesSpreadCents.toFixed(6)}¢`);
  lines.push(
    `- Mean YES fee / NO fee: ${a.meanYesFeeCents.toFixed(6)}¢ / `
      + `${a.meanNoFeeCents.toFixed(6)}¢`,
  );
  lines.push(
    `- YES mean from identity: ${a.meanYesNetFromIdentityCents.toFixed(6)}¢`,
  );
  lines.push(
    `- YES mean direct (settlements): ${a.meanYesNetDirectCents.toFixed(6)}¢`,
  );
  lines.push(
    `- Identity-derived vs direct residual: `
      + `${a.identityDerivedVsDirectResidualCents.toExponential(3)}`,
  );
  lines.push("");
  lines.push("## YES economics (simulated P&L at observed quotes)");
  lines.push("");
  lines.push(`- N / G: **${e.n} / ${e.g}**`);
  lines.push(
    `- Mean / median net: **${e.meanNetPnlCents.toFixed(4)}¢** / `
      + `${e.medianNetPnlCents.toFixed(4)}¢`,
  );
  lines.push(`- Total net: ${e.totalNetPnlCents.toFixed(2)}¢`);
  lines.push(`- Mean gross: ${e.meanGrossPnlCents.toFixed(4)}¢`);
  lines.push(`- Mean YES ask (entry): ${e.meanEntryPriceCents.toFixed(4)}¢`);
  lines.push(
    `- YES settlement rate: ${(e.yesSettlementRate * 100).toFixed(2)}%`,
  );
  if (inf) {
    lines.push(
      `- CR2 SE: ${inf.cr2StandardError.toFixed(6)}¢; df=${inf.degreesOfFreedom}; `
        + `t=${inf.tStatistic.toFixed(4)}; tcrit=${inf.tCriticalTwoSided95.toFixed(4)}`,
    );
    lines.push(
      `- CR2 two-sided 95% CI: `
        + `**[${inf.ci95LowerCents.toFixed(4)}, ${inf.ci95UpperCents.toFixed(4)}]¢**`,
    );
    lines.push(
      "- Note: YES CI is recomputed from YES day clusters — not the negated NO interval.",
    );
  } else {
    lines.push("- CR2 inference: unavailable (need N≥2 and G≥2)");
  }
  lines.push("");
  lines.push("### Per UTC entry day");
  lines.push("");
  lines.push("| utcDay | n | meanNet¢ | totalNet¢ |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const d of e.perDay) {
    lines.push(
      `| ${d.utcDayKey} | ${d.marketCount} | ${d.meanNetPnlCents.toFixed(4)} | `
        + `${d.totalNetPnlCents.toFixed(2)} |`,
    );
  }
  lines.push("");
  lines.push("### Leave-one-day-out means (descriptive)");
  lines.push("");
  for (const m of e.leaveOneDayOutMeansCents) {
    lines.push(`- omit ${m.heldOutUtcDayKey}: ${m.meanNetPnlCents.toFixed(4)}¢`);
  }
  lines.push("");
  lines.push("## YES ask liquidity (separate from accounting cohort)");
  lines.push("");
  lines.push(report.liquidity.note);
  lines.push("");
  lines.push(
    `- yesAskSize ≥ 1: ${report.liquidity.yesAskSizeGe1} / ${e.n}`,
  );
  lines.push(
    `- known insufficient (size present, &lt; 1): `
      + `${report.liquidity.yesAskSizeKnownInsufficient}`,
  );
  lines.push(`- size missing/invalid: ${report.liquidity.yesAskSizeMissing}`);
  if (report.liquidity.sensitivityAskSizeGe1) {
    const s = report.liquidity.sensitivityAskSizeGe1;
    lines.push(
      `- Sensitivity (askSize≥1 only): N=${s.n}, G=${s.g}, `
        + `mean ${s.meanNetPnlCents.toFixed(4)}¢`
        + (s.ci95LowerCents != null && s.ci95UpperCents != null
          ? `, CI [${s.ci95LowerCents.toFixed(4)}, ${s.ci95UpperCents.toFixed(4)}]¢`
          : " (CI unavailable)"),
    );
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push(`- Status: **${report.interpretation.status}**`);
  lines.push(`- ${report.interpretation.rationale}`);
  lines.push(
    `- Merits designing a fresh-period test: `
      + `**${report.interpretation.meritsFreshPeriodTestDesign}**`,
  );
  lines.push("");
  lines.push("## Execution limitations");
  lines.push("");
  for (const item of report.executionLimitations) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("## Attestation");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.attestation, null, 2));
  lines.push("```");
  return `${lines.join("\n")}\n`;
}

export async function writeYesMirrorArtifacts(args: {
  outDir: string;
  report: YesMirrorDiagnosticReport;
  pairedRows: readonly PairedMirrorRow[];
}): Promise<{
  reportJsonSha256: string;
  reportMdSha256: string;
  pairedSha256: string;
  manifestSha256: string;
}> {
  const reportJsonText = stableStringify(args.report);
  const reportMdText = renderYesMirrorReportMarkdown(args.report);
  const pairedText = stableStringify(args.pairedRows);

  const reportJsonSha256 = sha256HexOfUtf8(reportJsonText);
  const reportMdSha256 = sha256HexOfUtf8(reportMdText);
  const pairedSha256 = sha256HexOfUtf8(pairedText);

  const manifest = {
    studyId: args.report.studyId,
    analysisVersion: args.report.analysisVersion,
    generatedAtUtc: args.report.generatedAtUtc,
    codeAuthoritySha: args.report.codeAuthoritySha,
    priorExposure: args.report.priorExposure,
    cohort: {
      sourceSelectedEntriesSha256: args.report.cohort.sourceSelectedEntriesSha256,
      sourcePerMarketTradesSha256: args.report.cohort.sourcePerMarketTradesSha256,
      hashesVerified: args.report.cohort.hashesVerified,
      pairedN: args.report.cohort.pairedN,
      pairedG: args.report.cohort.pairedG,
    },
    economics: {
      meanNetPnlCents: args.report.economics.meanNetPnlCents,
      ci95LowerCents: args.report.economics.inference?.ci95LowerCents ?? null,
      ci95UpperCents: args.report.economics.inference?.ci95UpperCents ?? null,
      interpretationStatus: args.report.interpretation.status,
      meritsFreshPeriodTestDesign:
        args.report.interpretation.meritsFreshPeriodTestDesign,
    },
    accountingIdentityHolds: args.report.accounting.identityHoldsForAllPairedRows,
    artifactSha256: {
      "report.json": reportJsonSha256,
      "report.md": reportMdSha256,
      "paired-markets.json": pairedSha256,
    },
    reproductionCommand:
      "npm run research:calibration-fade-v2-spent-grid-hts-yes-mirror-diagnostic",
    attestation: args.report.attestation,
  };
  const manifestText = stableStringify(manifest);
  const manifestSha256 = sha256HexOfUtf8(manifestText);

  await mkdir(args.outDir, { recursive: true });
  await writeFile(`${args.outDir}/report.json`, reportJsonText, "utf8");
  await writeFile(`${args.outDir}/report.md`, reportMdText, "utf8");
  await writeFile(`${args.outDir}/paired-markets.json`, pairedText, "utf8");
  await writeFile(`${args.outDir}/diagnostic-manifest.json`, manifestText, "utf8");

  return {
    reportJsonSha256,
    reportMdSha256,
    pairedSha256,
    manifestSha256,
  };
}
