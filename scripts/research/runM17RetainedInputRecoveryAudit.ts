/**
 * Offline M17 retained-input recovery audit CLI.
 * No downloads, purchases, captures, trades, or P&L.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

import {
  buildM17RetainedInputRecoveryReport,
  serializeM17RetainedInputRecoveryMarkdown,
} from "@/lib/data/research/m17RetainedInputRecoveryAudit";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "../.."));

const SAMPLES = join(
  ROOT,
  "data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl",
);
const LABELS = join(
  ROOT,
  "data/external-samples/cryptostruct/m16-er/work/settlement-friction-label-backfill/settlement-labels.jsonl",
);
const RAW = join(ROOT, "data/external-samples/cryptostruct/m16-er/raw");
const ACQUISITION = join(
  ROOT,
  "data/research-results/external-kalshi-data-audit/m16-er-acquisition-manifest.json",
);
const JOIN_COUNTS = join(
  ROOT,
  "data/research-results/external-kalshi-data-audit/m17-prep-settlement-join-audit/settlement-join-audit-counts.json",
);
const DEFAULT_OUT = join(
  ROOT,
  "data/research-results/external-kalshi-data-audit/m17-prep-retained-input-recovery-audit",
);
const COINBASE_CANDLES = join(
  ROOT,
  "data/live-capture/forward-quotes/2026-09-22T18-00-05-364Z/btc-candles-1m.jsonl",
);

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

function countJsonlLines(path: string): number {
  const text = readFileSync(path, "utf8");
  let n = 0;
  for (const line of text.split("\n")) {
    if (line.trim()) n += 1;
  }
  return n;
}

function rel(path: string): string {
  return relative(ROOT, path).split("\\").join("/");
}

function listOneCloseCaptures(): string[] {
  const arch = join(
    homedir(),
    "Documents/KalshiResearchArchive/one-close-settlement-fidelity",
  );
  if (!existsSync(arch)) return [];
  const out: string[] = [];
  for (const name of readdirSync(arch)) {
    if (!name.includes("one-close-settlement-fidelity-v")) continue;
    const base = join(arch, name);
    if (!statSync(base).isDirectory()) continue;
    for (const stamp of readdirSync(base)) {
      const raw = join(base, stamp, "raw", "synchronized-capture.jsonl");
      if (existsSync(raw)) out.push(raw);
    }
  }
  return out;
}

function main(): void {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf("--out");
  const outDir = outIdx >= 0 ? resolve(argv[outIdx + 1]!) : DEFAULT_OUT;

  for (const p of [SAMPLES, LABELS, ACQUISITION]) {
    if (!existsSync(p)) throw new Error(`required retained artifact missing: ${p}`);
  }

  const acquisition = JSON.parse(readFileSync(ACQUISITION, "utf8")) as {
    days: Array<{ utcDate: string; sha256: string }>;
  };
  const rawZipSha256ByDay: Record<string, string> = {};
  for (const d of acquisition.days) {
    rawZipSha256ByDay[d.utcDate] = d.sha256;
  }

  let validJoin = 47263;
  if (existsSync(JOIN_COUNTS)) {
    const counts = JSON.parse(readFileSync(JOIN_COUNTS, "utf8")) as {
      counts?: { validOfficialSettlementLabel?: number };
    };
    validJoin = counts.counts?.validOfficialSettlementLabel ?? validJoin;
  }

  const rawDays = existsSync(RAW)
    ? readdirSync(RAW).filter((n) => n.endsWith(".zip")).length
    : 0;

  const candlesBytes = existsSync(COINBASE_CANDLES)
    ? statSync(COINBASE_CANDLES).size
    : 0;
  const brtiPaths = listOneCloseCaptures();

  const report = buildM17RetainedInputRecoveryReport({
    generatedAtUtc: new Date().toISOString(),
    codeAuthoritySha: codeAuthoritySha(),
    facts: {
      retainedFrictionSampleCount: countJsonlLines(SAMPLES),
      validSettlementJoinCount: validJoin,
      rawZipDayCount: rawDays,
      rawZipSha256ByDay,
      samplesSha256: fileSha256(SAMPLES),
      labelsSha256: fileSha256(LABELS),
      frictionSamplesPath: rel(SAMPLES),
      labelsPath: rel(LABELS),
      rawStorePath: rel(RAW),
      acquisitionManifestPath: rel(ACQUISITION),
      acquisitionManifestSha256: fileSha256(ACQUISITION),
      coinbaseCandlesPath: existsSync(COINBASE_CANDLES) ? rel(COINBASE_CANDLES) : null,
      coinbaseCandlesByteSize: candlesBytes,
      brtiOneCloseCaptureCount: brtiPaths.length,
      brtiOneClosePaths: brtiPaths.map((p) =>
        p.replace(homedir(), "~").split("\\").join("/")
      ),
      settlementJoinMergeSha: "1bd0d631eea173445a919207772b6141af28a26f",
    },
  });

  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, "retained-input-recovery-report.json");
  const mdPath = join(outDir, "retained-input-recovery-report.md");
  const summaryPath = join(outDir, "retained-input-recovery-summary.json");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(mdPath, serializeM17RetainedInputRecoveryMarkdown(report));
  writeFileSync(
    summaryPath,
    `${JSON.stringify(
      {
        studyId: report.studyId,
        finalStatus: report.finalStatus,
        purchaseMade: report.purchaseMade,
        networkRequestsMade: report.networkRequestsMade,
        strategyPnlComputed: report.strategyPnlComputed,
        classificationCounts: report.classificationCounts,
        remainingBlockers: report.remainingBlockers,
        exploratoryEvalExecutableWithoutPurchase:
          report.exploratoryEvalExecutableWithoutPurchase,
        reportSha256: fileSha256(jsonPath),
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        outDir: rel(outDir),
        finalStatus: report.finalStatus,
        purchaseMade: report.purchaseMade,
        strategyPnlComputed: report.strategyPnlComputed,
        classificationCounts: report.classificationCounts,
      },
      null,
      2,
    ),
  );
}

main();
