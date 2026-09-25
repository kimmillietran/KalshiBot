/**
 * M17 SPENT hold-to-settlement exploratory evaluation CLI.
 *
 * Offline only. Stops before P&L when frozen entry decisions are missing.
 * Does not download, purchase, capture, trade, or place orders.
 *
 * Modes:
 *   --fixture   hermetic fixtures (CI-safe; writes under --out only)
 *   default     local retained M16-ER friction samples + PR #114 labels
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import type { SettlementLabelRecord } from "@/lib/data/research/settlementFrictionCoverage";
import {
  runM17SpentHoldToSettlementEval,
  serializeM17SpentHoldToSettlementMarkdown,
  type RetainedFrictionSampleRow,
} from "@/lib/data/research/m17SpentHoldToSettlementEval";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "../.."));

const DEFAULT_SAMPLES = join(
  ROOT,
  "data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl",
);
const DEFAULT_LABELS = join(
  ROOT,
  "data/external-samples/cryptostruct/m16-er/work/settlement-friction-label-backfill/settlement-labels.jsonl",
);
const DEFAULT_OUT = join(
  ROOT,
  "data/research-results/external-kalshi-data-audit/m17-prep-spent-hold-to-settlement-eval",
);
const FIXTURE_DIR = join(
  ROOT,
  "src/lib/data/research/m17SpentHoldToSettlementEval/fixtures",
);

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

function argValue(argv: readonly string[], name: string): string | null {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  return argv[i + 1] ?? null;
}

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function codeAuthoritySha(): string | null {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function readJsonl<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  const rl = readline.createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(JSON.parse(trimmed) as T);
  }
  return out;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const fixture = hasFlag(argv, "--fixture");
  const samplesPath = fixture
    ? join(FIXTURE_DIR, "samples.jsonl")
    : (argValue(argv, "--samples-jsonl") ?? DEFAULT_SAMPLES);
  const labelsPath = fixture
    ? join(FIXTURE_DIR, "labels.jsonl")
    : (argValue(argv, "--labels-jsonl") ?? DEFAULT_LABELS);
  // Fixture mode must not clobber retained empirical reports.
  const outDir = argValue(argv, "--out")
    ?? (fixture ? join(FIXTURE_DIR, "out") : DEFAULT_OUT);

  if (!existsSync(samplesPath)) {
    throw new Error(`samples not found: ${samplesPath}`);
  }
  if (!existsSync(labelsPath)) {
    throw new Error(`labels not found: ${labelsPath}`);
  }

  const samples = await readJsonl<RetainedFrictionSampleRow>(samplesPath);
  const labels = await readJsonl<SettlementLabelRecord>(labelsPath);

  const inputIdentities: Record<string, string> = {
    samplesPath,
    labelsPath,
    samplesSha256: fileSha256(samplesPath),
    labelsSha256: fileSha256(labelsPath),
    datasetProvenance: "SPENT_VALIDATION (M16-ER)",
    settlementJoinAuditMergeSha: "1bd0d631eea173445a919207772b6141af28a26f",
    claimedPriorEntryArtifact: "unavailable-not-found-in-retained-artifacts",
    mode: fixture ? "fixture" : "retained-local",
  };

  const report = runM17SpentHoldToSettlementEval({
    samples,
    labels,
    generatedAtUtc: new Date().toISOString(),
    codeAuthoritySha: codeAuthoritySha(),
    inputIdentities,
  });

  mkdirSync(outDir, { recursive: true });
  const reportJsonPath = join(outDir, "spent-hold-to-settlement-eval-report.json");
  const reportMdPath = join(outDir, "spent-hold-to-settlement-eval-report.md");
  const summaryPath = join(outDir, "spent-hold-to-settlement-eval-summary.json");

  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMdPath, serializeM17SpentHoldToSettlementMarkdown(report));
  writeFileSync(
    summaryPath,
    `${JSON.stringify(
      {
        studyId: report.studyId,
        completionStatus: report.completionStatus,
        datasetProvenance: report.datasetProvenance,
        missingFrozenDecisionsBlockingPnl: report.missingFrozenDecisionsBlockingPnl,
        featureAvailability: report.featureAvailability,
        candidatePopulation: report.candidatePopulation,
        performance: report.performance,
        pristinePurchaseRecommendation: report.pristinePurchaseRecommendation,
        zeroNetworkConfirmation: report.zeroNetworkConfirmation,
        reportSha256: fileSha256(reportJsonPath),
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        outDir,
        completionStatus: report.completionStatus,
        retainedExecutableSamples:
          report.candidatePopulation.retainedExecutableSamples,
        completeRequiredFeaturesForEntry:
          report.featureAvailability.completeRequiredFeaturesForEntry,
        noEntriesSimulated: report.performance.noEntriesSimulated,
        pristinePurchaseJustifiedNow:
          report.pristinePurchaseRecommendation.justifiedNow,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
