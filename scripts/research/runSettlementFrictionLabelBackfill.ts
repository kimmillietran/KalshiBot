/**
 * CLI for manifest-based settlement-label backfill (friction coverage study).
 *
 * Reuses SETTLEMENT_ONLY historical import. Does not invent a capture-run dir.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createFilesystemForwardSettlementCoverageIo } from "@/lib/data/research/forwardSettlementCoverage";
import { loadEligibleCalendarAuthority } from "@/lib/data/research/settlementFrictionCoverage";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  EXPECTED_SAMPLES_CONTENT_SHA256,
  LABEL_BACKFILL_ANALYSIS_VERSION,
  LABEL_BACKFILL_STUDY_ID,
  buildTickerManifest,
  exportLabelsFromSummary,
  hashFileContent,
  parseSettlementFrictionLabelBackfillArgv,
  runSettlementFrictionLabelBackfill,
  serializeSettlementLabelsJsonl,
  SettlementFrictionLabelBackfillError,
} from "@/lib/data/research/settlementFrictionLabelBackfill";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const FIXTURE_DIR = join(
  ROOT,
  "src/lib/data/research/settlementFrictionLabelBackfill/fixtures",
);

function codeAuthoritySha(): string | null {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function createFixtureFetchImpl(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (
      url.includes("/candlesticks")
      || url.includes("/trades")
      || url.includes("/klines")
      || url.includes("coinbase")
    ) {
      throw new Error(`fixture fetch must not request unrelated data: ${url}`);
    }

    const marketMatch =
      /\/(?:historical\/)?markets\/([^/?]+)/.exec(url);
    if (marketMatch) {
      const ticker = decodeURIComponent(marketMatch[1]!);
      const body = {
        market: {
          ticker,
          event_ticker: ticker.replace(/-[^-]+$/, ""),
          status: "determined",
          result: "yes",
          open_time: "2026-08-14T12:00:00.000Z",
          close_time: "2026-08-14T12:15:00.000Z",
          settlement_ts: "2026-08-14T12:20:00.000Z",
          expiration_value: "65000.25",
          floor_strike: 64980.5,
          strike_type: "greater",
          series_ticker: "KXBTC15M",
          title: "fixture",
          yes_sub_title: null,
          subtitle: null,
          settlement_value_dollars: "1.0000",
        },
      };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }) as typeof fetch;
}

function buildManifestForRun(input: {
  samplesPath: string;
  samplesContent: string;
  eligibleUtcDays: readonly string[];
  fixture: boolean;
}) {
  if (input.fixture) {
    const lines = input.samplesContent.split(/\r?\n/).filter((l) => l.trim());
    const tickers = new Set(
      lines.map((l) => (JSON.parse(l) as { marketTicker: string }).marketTicker),
    );
    return buildTickerManifest({
      samplesPath: input.samplesPath,
      samplesContent: input.samplesContent,
      eligibleUtcDays: input.eligibleUtcDays,
      expectedSamplesContentSha256: hashFileContent(input.samplesContent),
      expectedRetainedSamples: lines.length,
      expectedDistinctTickers: tickers.size,
    });
  }

  return buildTickerManifest({
    samplesPath: input.samplesPath,
    samplesContent: input.samplesContent,
    eligibleUtcDays: input.eligibleUtcDays,
    expectedSamplesContentSha256: EXPECTED_SAMPLES_CONTENT_SHA256,
  });
}

export async function runSettlementFrictionLabelBackfillCommand(
  argv: readonly string[],
): Promise<number> {
  try {
    const parsed = parseSettlementFrictionLabelBackfillArgv(argv);
    const evaluatedAt = new Date().toISOString();
    const samplesPath = resolve(ROOT, parsed.samplesPath);
    const workDir = resolve(ROOT, parsed.workDir);
    const importsDir = resolve(ROOT, parsed.importsDir);
    const checkpointPath = resolve(ROOT, parsed.checkpointPath);
    const labelsOutPath = resolve(ROOT, parsed.labelsOutPath);
    const coverageOutDir = resolve(ROOT, parsed.coverageOutDir);

    mkdirSync(workDir, { recursive: true });

    const calendar = loadEligibleCalendarAuthority({
      repoRoot: ROOT,
      dayClustersPath: parsed.fixture
        ? join(FIXTURE_DIR, "day-clusters.json")
        : undefined,
      reservoirStatusPath: parsed.fixture
        ? join(FIXTURE_DIR, "reservoir-status.json")
        : undefined,
    });

    if (!existsSync(samplesPath)) {
      throw new SettlementFrictionLabelBackfillError(
        `samples.jsonl missing at ${samplesPath}`,
      );
    }
    const samplesContent = readFileSync(samplesPath, "utf8");
    const manifest = buildManifestForRun({
      samplesPath: parsed.samplesPath,
      samplesContent,
      eligibleUtcDays: calendar.eligibleUtcDays,
      fixture: parsed.fixture,
    });

    writeFileSync(
      join(workDir, "ticker-manifest.json"),
      stableStringify({
        ...manifest,
        codeAuthoritySha: codeAuthoritySha(),
        analysisVersion: LABEL_BACKFILL_ANALYSIS_VERSION,
        generatedAtUtc: evaluatedAt,
      }),
      "utf8",
    );

    const io = createFilesystemForwardSettlementCoverageIo();
    const summary = await runSettlementFrictionLabelBackfill({
      manifest,
      config: {
        importsDir,
        checkpointPath,
        dryRun: parsed.dryRun,
        concurrency: parsed.concurrency,
        maxRetries: parsed.maxRetries,
        retryBaseDelayMs: parsed.retryBaseDelayMs,
        limit: parsed.limit ?? undefined,
      },
      io,
      evaluatedAt,
      fetchImpl: parsed.fixture ? createFixtureFetchImpl() : undefined,
    });

    writeFileSync(
      join(workDir, "label-backfill-plan.json"),
      stableStringify(summary.plan),
      "utf8",
    );

    process.stdout.write(
      `${stableStringify({
        studyId: LABEL_BACKFILL_STUDY_ID,
        dryRun: parsed.dryRun,
        fixture: parsed.fixture,
        plan: summary.plan,
        fetched: summary.fetched,
        failed: summary.failed,
        dryRunPlanned: summary.dryRunPlanned,
        sourceCounts: summary.sourceCounts,
        unresolvedReasons: summary.unresolvedReasons,
      })}\n`,
    );

    if (parsed.dryRun) {
      return 0;
    }

    const labelRecords = exportLabelsFromSummary(summary);
    const labelsJsonl = serializeSettlementLabelsJsonl(labelRecords);
    mkdirSync(dirname(labelsOutPath), { recursive: true });
    writeFileSync(labelsOutPath, labelsJsonl, "utf8");

    writeFileSync(
      join(workDir, "label-backfill-summary.json"),
      stableStringify({
        studyId: LABEL_BACKFILL_STUDY_ID,
        analysisVersion: LABEL_BACKFILL_ANALYSIS_VERSION,
        codeAuthoritySha: codeAuthoritySha(),
        generatedAtUtc: evaluatedAt,
        tickerManifestIdentity: manifest.tickerManifestIdentity,
        samplesContentSha256: manifest.samplesContentSha256,
        retainedSamples: manifest.retainedSamples,
        distinctTickers: manifest.distinctTickers,
        plan: summary.plan,
        fetched: summary.fetched,
        skippedComplete: summary.skippedComplete,
        skippedConflict: summary.skippedConflict,
        failed: summary.failed,
        dryRunPlanned: summary.dryRunPlanned,
        sourceCounts: summary.sourceCounts,
        unresolvedReasons: summary.unresolvedReasons,
        labelsExported: labelRecords.length,
        labelsOutPath: parsed.labelsOutPath,
        labelsSha256: createHash("sha256").update(labelsJsonl).digest("hex"),
        completeness: {
          complete: summary.labels.filter((l) => l.completeness === "complete").length,
          partial: summary.labels.filter((l) => l.completeness === "partial").length,
          missing: summary.labels.filter((l) => l.completeness === "missing").length,
        },
      }),
      "utf8",
    );

    if (!parsed.skipCoverageRefresh && !parsed.fixture) {
      const samplesDir = dirname(samplesPath);
      const coverageArgs = [
        "npx",
        "tsx",
        "scripts/research/runSettlementFrictionCoverage.ts",
        "--samples-jsonl",
        samplesPath,
        "--labels-jsonl",
        labelsOutPath,
        "--out-dir",
        coverageOutDir,
      ];
      const exclusionsPath = join(samplesDir, "exclusions.json");
      const availableDaysPath = join(samplesDir, "available-days.json");
      const dayNotesPath = join(samplesDir, "day-notes.json");
      if (existsSync(exclusionsPath)) {
        coverageArgs.push("--exclusions-json", exclusionsPath);
      }
      if (existsSync(availableDaysPath)) {
        coverageArgs.push("--available-days-json", availableDaysPath);
      }
      if (existsSync(dayNotesPath)) {
        coverageArgs.push("--day-notes-json", dayNotesPath);
      }
      execSync(coverageArgs.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" "), {
        cwd: ROOT,
        stdio: "inherit",
        env: process.env,
      });
    } else if (parsed.fixture) {
      writeFileSync(
        join(workDir, "coverage-refresh-note.json"),
        stableStringify({
          note:
            "Fixture mode exports labels only. Production coverage refresh uses "
            + "npm run research:settlement-friction-coverage with "
            + "--samples-jsonl and --labels-jsonl.",
          labelsOutPath: parsed.labelsOutPath,
        }),
        "utf8",
      );
    }

    return summary.failed > 0 ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }
}

const isMain =
  process.argv[1]?.endsWith("runSettlementFrictionLabelBackfill.ts")
  || process.argv[1]?.includes("runSettlementFrictionLabelBackfill");

if (isMain) {
  void runSettlementFrictionLabelBackfillCommand(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
