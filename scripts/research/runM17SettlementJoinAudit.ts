/**
 * M17 settlement-join audit CLI.
 *
 * Offline only: reads retained friction samples + PR #114 labels.
 * Does not download, purchase, capture, trade, or tune strategy gates.
 *
 * Modes:
 *   --fixture   hermetic tiny fixtures (CI-safe)
 *   default     local retained M16-ER work artifacts when present
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
  entriesFromFrictionSamples,
  runM17SettlementJoinAudit,
  serializeM17SettlementJoinReportMarkdown,
  type M17EligibleEntryRecord,
} from "@/lib/data/research/m17SettlementJoinAudit";

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
  "data/research-results/external-kalshi-data-audit/m17-prep-settlement-join-audit",
);
const FIXTURE_DIR = join(
  ROOT,
  "src/lib/data/research/m17SettlementJoinAudit/fixtures",
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
  const outDir = argValue(argv, "--out") ?? DEFAULT_OUT;

  if (!existsSync(samplesPath)) {
    throw new Error(`samples not found: ${samplesPath}`);
  }
  if (!existsSync(labelsPath)) {
    throw new Error(`labels not found: ${labelsPath}`);
  }

  const sampleRows = await readJsonl<{
    marketTicker: string;
    utcDayKey: string;
    entryTimestampMs: number;
  }>(samplesPath);
  const labels = await readJsonl<SettlementLabelRecord>(labelsPath);
  const entries: M17EligibleEntryRecord[] = entriesFromFrictionSamples(sampleRows);

  const labelCoverageManifest = join(
    ROOT,
    "data/research-results/external-kalshi-data-audit/m17-prep-settlement-friction-label-coverage/settlement-friction-coverage-manifest.json",
  );
  const incompleteRecordsPath = join(
    ROOT,
    "data/research-results/external-kalshi-data-audit/m17-prep-settlement-friction-label-coverage/incomplete-records.json",
  );

  const inputIdentities: Record<string, string> = {
    samplesPath,
    labelsPath,
    samplesSha256: fileSha256(samplesPath),
    labelsSha256: fileSha256(labelsPath),
    labelBackfillCommit: "0b43ffe186e9246da53047e6a4ffcb08604d52aa",
    frictionCoverageMergeCommit: "b682962e2b34cba5593a5162f781a7b58c86edda",
    datasetRole: "SPENT_VALIDATION (M16-ER)",
    eligibleUniverse:
      "retained settlement-friction-coverage executable samples (exact marketTicker)",
  };
  if (existsSync(labelCoverageManifest)) {
    inputIdentities.frictionLabelCoverageManifestSha256 = fileSha256(
      labelCoverageManifest,
    );
  }
  if (existsSync(incompleteRecordsPath)) {
    inputIdentities.incompleteRecordsSha256 = fileSha256(incompleteRecordsPath);
  }

  const { report } = runM17SettlementJoinAudit({
    entries,
    labels,
    generatedAtUtc: new Date().toISOString(),
    codeAuthoritySha: codeAuthoritySha(),
    inputIdentities,
  });

  mkdirSync(outDir, { recursive: true });
  const reportJsonPath = join(outDir, "settlement-join-audit-report.json");
  const reportMdPath = join(outDir, "settlement-join-audit-report.md");
  const countsPath = join(outDir, "settlement-join-audit-counts.json");

  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportMdPath, serializeM17SettlementJoinReportMarkdown(report));
  writeFileSync(
    countsPath,
    `${JSON.stringify(
      {
        studyId: report.studyId,
        counts: report.counts,
        decision: report.decision,
        spentExploratoryOutcomeCounts: report.spentExploratoryOutcomeCounts,
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
        totalEligibleRecords: report.counts.totalEligibleRecords,
        validOfficialSettlementLabel: report.counts.validOfficialSettlementLabel,
        settlementJoinPercentage: report.decision.settlementJoinPercentage,
        independentMarketsWithValidJoin:
          report.counts.independentMarketsWithValidJoin,
        exploratoryUsability: report.decision.exploratoryUsability,
        confirmatoryValidity: report.decision.confirmatoryValidity,
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
