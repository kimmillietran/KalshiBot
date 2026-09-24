/**
 * Serialize study artifacts (manifest, samples, by-day, report).
 */

import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { StudyRunResult } from "./runStudy";

export type StudyArtifacts = {
  manifestJson: string;
  samplesJsonl: string;
  byDayJson: string;
  reportMarkdown: string;
  manifestContentSha256: string;
};

export function serializeSettlementFrictionArtifacts(
  result: StudyRunResult,
  extras?: {
    reproductionCommands?: readonly string[];
    inputIdentities?: Record<string, string>;
  },
): StudyArtifacts {
  const manifest = {
    studyId: result.config.studyId,
    analysisVersion: result.config.analysisVersion,
    configurationIdentity: result.config.configurationIdentity,
    disclaimer: result.disclaimer,
    generatedAtUtc: result.generatedAtUtc,
    codeAuthoritySha: result.codeAuthoritySha,
    feeContractIdentity: result.config.feeContractIdentity,
    adapterId: result.config.adapterId,
    adapterIdentity: result.config.adapterIdentity,
    sampling: {
      sampleCadenceMs: result.config.sampleCadenceMs,
      horizonsMs: result.config.horizonsMs,
      responseMatchToleranceMs: result.config.responseMatchToleranceMs,
      maxQuoteAgeMs: result.config.maxQuoteAgeMs,
      minDisplayedSize: result.config.minDisplayedSize,
      timestampBasis: result.config.timestampBasis,
      bucketAlignment: result.config.bucketAlignment,
      quoteOrdering: result.config.quoteOrdering,
      quoteAgeDefinition: result.config.quoteAgeDefinition,
      responseMatching: result.config.responseMatching,
      sessionBoundary: result.config.sessionBoundary,
      crossDayHandling: result.config.crossDayHandling,
    },
    calendar: {
      eligibleUtcDays: result.calendar.eligibleUtcDays,
      eligibleUtcDayCount: result.eligibleUtcDayCount,
      m16ErDaysContentSha256: result.calendar.m16ErDaysContentSha256,
      spentDaysContentSha256: result.calendar.spentDaysContentSha256,
      locallyAvailableUtcDayCount: result.locallyAvailableUtcDayCount,
      successfullyProcessedUtcDayCount: result.successfullyProcessedUtcDayCount,
      missingOrRejectedUtcDays: result.missingOrRejectedUtcDays,
    },
    exclusionCounts: result.exclusionCounts,
    samplesContentSha256: result.samplesContentSha256,
    retainedSamples: result.samples.length,
    pooled: result.pooled,
    equalDay: result.equalDay,
    settlementCoverage: result.settlementCoverage,
    completionStatus: result.completionStatus,
    inputIdentities: extras?.inputIdentities ?? {},
    reproductionCommands: extras?.reproductionCommands ?? [],
    displayedBookCaveat:
      "Displayed-book execution scenarios only — not proof of realized fills "
      + "or latency-adjusted live performance. Round-trip friction excludes mid drift.",
    brtiPathCoverage:
      result.settlementCoverage.brtiPathCoverageNote,
  };

  const manifestJson = `${stableStringify(manifest)}\n`;
  const manifestContentSha256 = createHash("sha256")
    .update(manifestJson)
    .digest("hex");

  const samplesJsonl = `${result.samples.map((s) => JSON.stringify(s)).join("\n")}${
    result.samples.length > 0 ? "\n" : ""
  }`;

  const byDayJson = `${stableStringify({
    studyId: result.config.studyId,
    generatedAtUtc: result.generatedAtUtc,
    days: result.byDay,
    equalDay: result.equalDay,
  })}\n`;

  const reportMarkdown = renderReportMarkdown(result, manifestContentSha256);
  return {
    manifestJson,
    samplesJsonl,
    byDayJson,
    reportMarkdown,
    manifestContentSha256,
  };
}

function pct(num: number, den: number): string {
  if (den <= 0) return "n/a";
  return `${((100 * num) / den).toFixed(1)}% (${num}/${den})`;
}

function renderReportMarkdown(
  result: StudyRunResult,
  manifestSha: string,
): string {
  const cov = result.settlementCoverage;
  const lines = [
    `# Settlement friction + label coverage — ${result.config.studyId}`,
    "",
    `Generated: ${result.generatedAtUtc}`,
    `Configuration identity: \`${result.config.configurationIdentity}\``,
    `Manifest SHA-256: \`${manifestSha}\``,
    `Code SHA: \`${result.codeAuthoritySha ?? "null"}\``,
    `Completion: **${result.completionStatus}**`,
    "",
    result.disclaimer,
    "",
    "## Calendar",
    "",
    `| Set | Count |`,
    `| --- | ---: |`,
    `| Eligible (authoritative 34) | ${result.eligibleUtcDayCount} |`,
    `| Locally available | ${result.locallyAvailableUtcDayCount} |`,
    `| Successfully processed | ${result.successfullyProcessedUtcDayCount} |`,
    `| Missing/rejected | ${result.missingOrRejectedUtcDays.length} |`,
    "",
    "## Pooled entry friction (equal weight per retained sample)",
    "",
    `| Metric | Value |`,
    `| --- | ---: |`,
    `| Retained samples | ${result.pooled.retainedSamples} |`,
    `| Mean entry friction (¢) | ${result.pooled.meanEntryFrictionCents?.toFixed(4) ?? "n/a"} |`,
    "",
    "## Round-trip friction by horizon (excludes mid drift)",
    "",
    `| Horizon | Observable N | Unobservable N | Mean RT friction (¢) |`,
    `| --- | ---: | ---: | ---: |`,
  ];
  for (const h of result.config.horizonsMs) {
    const cell = result.pooled.roundTrip[String(h)];
    lines.push(
      `| ${h}ms | ${cell?.observableN ?? 0} | ${cell?.unobservableN ?? 0} | ${
        cell?.meanRoundTripFrictionCents?.toFixed(4) ?? "n/a"
      } |`,
    );
  }
  lines.push(
    "",
    "## Equal-day aggregate (mean of day means)",
    "",
    `| Metric | Value |`,
    `| --- | ---: |`,
    `| Days with samples | ${result.equalDay.dayCount} |`,
    `| Mean-of-day-mean entry (¢) | ${
      result.equalDay.meanOfDayMeanEntryFrictionCents?.toFixed(4) ?? "n/a"
    } |`,
    "",
    "## Settlement-label coverage (ticker denominator = sampled markets)",
    "",
    `| Metric | Coverage |`,
    `| --- | --- |`,
    `| Finalized result ∈ {yes,no} | ${pct(cov.finalizedResultCount, cov.denominatorTickers)} |`,
    `| Non-empty expiration_value | ${pct(cov.nonEmptyExpirationValueCount, cov.denominatorTickers)} |`,
    `| Valid numeric expiration_value | ${pct(cov.validNumericExpirationValueCount, cov.denominatorTickers)} |`,
    `| Joint finalized + non-empty expiration (v0) | ${pct(cov.jointFinalizedAndNonEmptyExpirationCount, cov.denominatorTickers)} |`,
    `| Finite floor_strike | ${pct(cov.finiteStrikeCount, cov.denominatorTickers)} |`,
    `| Parseable close_time | ${pct(cov.parseableCloseTimeCount, cov.denominatorTickers)} |`,
    `| Parseable settlement_ts | ${pct(cov.parseableSettlementTsCount, cov.denominatorTickers)} |`,
    `| Duplicate label tickers | ${cov.duplicateTickerCount} |`,
    `| Conflicting label tickers | ${cov.conflictingTickerCount} |`,
    "",
    `BRTI-path coverage: ${cov.brtiPathCoverageNote}`,
    "",
    "## Exclusions (quote-gate reason counts)",
    "",
    "```",
    JSON.stringify(result.exclusionCounts, null, 2),
    "```",
    "",
    "## Limitations",
    "",
    "- Partial day coverage must not be read as all 34 days analyzed.",
    "- Settlement labels do not establish BRTI settlement-state reconstructability.",
    "- CryptoStruct single-clock streams use quoteAgeMs=0 by documented definition.",
    "- Session close often derived from ticker HHMM (America/New_York) when expiry is null.",
    "- No confirmatory SPENT reuse; descriptive coverage only.",
    "- Operator M16-P launchctl bootout remains a separate operational follow-up.",
    "- Official Kalshi settlement-label fields were not present in local CryptoStruct day zips; label coverage is therefore zero until a permitted local label source is admitted.",
    "",
    "## Next concrete prerequisite",
    "",
    "Admit a **permitted local Kalshi settlement-label store** for the 34 SPENT tickers",
    "(result / expiration_value / floor_strike / close_time / settlement_ts) without",
    "API purchase/download in this study — or authorize a separate governed label",
    "backfill milestone. Settlement-**state** (BRTI path) remains blocked independently.",
  );
  return `${lines.join("\n")}\n`;
}
