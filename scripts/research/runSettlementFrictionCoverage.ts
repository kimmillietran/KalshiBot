/**
 * Settlement friction + label coverage CLI.
 *
 * Modes:
 *   --fixture     hermetic fixtures (CI-safe)
 *   --quotes-jsonl + --labels-jsonl  operator-normalized inputs
 *
 * Does not download, purchase, open sealed M16-P outcomes, or fit alpha.
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

import {
  M16_ER_ADAPTER_IDENTITY,
  buildM16ErFeeContract,
} from "@/lib/data/research/m16ExternalReplication";
import {
  assembleSettlementFrictionStudyFromSamples,
  loadEligibleCalendarAuthority,
  runSettlementFrictionCoverageStudy,
  serializeSettlementFrictionArtifacts,
  type DayAvailability,
  type FrictionSampleRow,
  type NormalizedQuoteEvent,
  type SettlementLabelRecord,
} from "@/lib/data/research/settlementFrictionCoverage";
import type { ExclusionReason } from "@/lib/data/research/settlementFrictionCoverage";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const FIXTURE_DIR = join(
  ROOT,
  "src/lib/data/research/settlementFrictionCoverage/fixtures",
);
const DEFAULT_OUT = join(
  ROOT,
  "data/research-results/external-kalshi-data-audit/m17-prep-settlement-friction-coverage",
);

function argValue(argv: readonly string[], name: string): string | null {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  return argv[i + 1] ?? null;
}

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

async function readJsonl<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  const rl = readline.createInterface({
    input: createReadStream(path, "utf8"),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(JSON.parse(trimmed) as T);
  }
  return out;
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

export async function runSettlementFrictionCoverageCommand(
  argv: readonly string[],
): Promise<number> {
  try {
    const outDir = resolve(argValue(argv, "--out-dir") ?? DEFAULT_OUT);
    const fixture = hasFlag(argv, "--fixture");
    const dayClustersPath = argValue(argv, "--day-clusters");
    const reservoirPath = argValue(argv, "--reservoir-status");
    const quotesPath = argValue(argv, "--quotes-jsonl");
    const samplesPath = argValue(argv, "--samples-jsonl");
    const labelsPath = argValue(argv, "--labels-jsonl");
    const availableDaysPath = argValue(argv, "--available-days-json");
    const dayNotesPath = argValue(argv, "--day-notes-json");
    const exclusionsPath = argValue(argv, "--exclusions-json");

    const calendar = loadEligibleCalendarAuthority({
      repoRoot: ROOT,
      dayClustersPath: dayClustersPath
        ? resolve(dayClustersPath)
        : fixture
          ? join(FIXTURE_DIR, "day-clusters.json")
          : undefined,
      reservoirStatusPath: reservoirPath
        ? resolve(reservoirPath)
        : fixture
          ? join(FIXTURE_DIR, "reservoir-status.json")
          : undefined,
    });

    let quotes: NormalizedQuoteEvent[] = [];
    let samples: FrictionSampleRow[] | null = null;
    let labels: SettlementLabelRecord[];
    let locallyAvailable: string[];
    let dayNotes: DayAvailability[] | undefined;
    let exclusionCounts: Partial<Record<ExclusionReason, number>> = {};

    const clustersResolved = dayClustersPath
      ? resolve(dayClustersPath)
      : fixture
        ? join(FIXTURE_DIR, "day-clusters.json")
        : calendar.m16ErDayClustersPath;
    const reservoirResolved = reservoirPath
      ? resolve(reservoirPath)
      : fixture
        ? join(FIXTURE_DIR, "reservoir-status.json")
        : calendar.reservoirStatusPath;
    const inputIdentities: Record<string, string> = {
      dayClustersSha256: fileSha256(clustersResolved),
      reservoirStatusSha256: fileSha256(reservoirResolved),
    };

    if (fixture) {
      quotes = await readJsonl(join(FIXTURE_DIR, "quotes.jsonl"));
      labels = await readJsonl(join(FIXTURE_DIR, "labels.jsonl"));
      locallyAvailable = ["2026-08-14"];
      inputIdentities.quotesSha256 = fileSha256(join(FIXTURE_DIR, "quotes.jsonl"));
      inputIdentities.labelsSha256 = fileSha256(join(FIXTURE_DIR, "labels.jsonl"));
    } else if (samplesPath) {
      samples = await readJsonl(resolve(samplesPath));
      labels = labelsPath ? await readJsonl(resolve(labelsPath)) : [];
      inputIdentities.samplesSha256 = fileSha256(resolve(samplesPath));
      if (labelsPath) {
        inputIdentities.labelsSha256 = fileSha256(resolve(labelsPath));
      }
      if (availableDaysPath && existsSync(resolve(availableDaysPath))) {
        locallyAvailable = JSON.parse(
          readFileSync(resolve(availableDaysPath), "utf8"),
        ) as string[];
      } else {
        locallyAvailable = [...new Set((samples ?? []).map((s) => s.utcDayKey))].sort();
      }
      if (dayNotesPath && existsSync(resolve(dayNotesPath))) {
        dayNotes = JSON.parse(
          readFileSync(resolve(dayNotesPath), "utf8"),
        ) as DayAvailability[];
      }
      if (exclusionsPath && existsSync(resolve(exclusionsPath))) {
        exclusionCounts = JSON.parse(
          readFileSync(resolve(exclusionsPath), "utf8"),
        ) as Partial<Record<ExclusionReason, number>>;
      }
    } else {
      if (!quotesPath) {
        throw new Error("require --fixture, --quotes-jsonl, or --samples-jsonl");
      }
      quotes = await readJsonl(resolve(quotesPath));
      labels = labelsPath ? await readJsonl(resolve(labelsPath)) : [];
      inputIdentities.quotesSha256 = fileSha256(resolve(quotesPath));
      if (labelsPath) {
        inputIdentities.labelsSha256 = fileSha256(resolve(labelsPath));
      }
      if (availableDaysPath && existsSync(resolve(availableDaysPath))) {
        locallyAvailable = JSON.parse(
          readFileSync(resolve(availableDaysPath), "utf8"),
        ) as string[];
      } else {
        locallyAvailable = [...new Set(quotes.map((q) => q.utcDayKey))].sort();
      }
      if (dayNotesPath && existsSync(resolve(dayNotesPath))) {
        dayNotes = JSON.parse(
          readFileSync(resolve(dayNotesPath), "utf8"),
        ) as DayAvailability[];
      }
    }

    const fee = buildM16ErFeeContract();
    const result = samples
      ? assembleSettlementFrictionStudyFromSamples({
          calendar,
          samples,
          labels,
          exclusionCounts,
          expectedFeeContractIdentity: fee.feeContractIdentity,
          expectedAdapterIdentity: M16_ER_ADAPTER_IDENTITY,
          codeAuthoritySha: codeAuthoritySha(),
          generatedAtUtc: new Date().toISOString(),
          locallyAvailableUtcDays: locallyAvailable,
          dayNotes,
        })
      : runSettlementFrictionCoverageStudy({
          calendar,
          quotes,
          labels,
          expectedFeeContractIdentity: fee.feeContractIdentity,
          expectedAdapterIdentity: M16_ER_ADAPTER_IDENTITY,
          codeAuthoritySha: codeAuthoritySha(),
          generatedAtUtc: new Date().toISOString(),
          locallyAvailableUtcDays: locallyAvailable,
          dayNotes,
        });

    const artifacts = serializeSettlementFrictionArtifacts(result, {
      inputIdentities,
      reproductionCommands: [
        "npm run research:settlement-friction-coverage -- --fixture",
        quotesPath
          ? `npm run research:settlement-friction-coverage -- --quotes-jsonl ${quotesPath}${
            labelsPath ? ` --labels-jsonl ${labelsPath}` : ""
          }`
          : "npm run research:settlement-friction-coverage -- --fixture",
      ],
    });

    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, "settlement-friction-coverage-manifest.json"),
      artifacts.manifestJson,
      "utf8",
    );
    const writeSamples = hasFlag(argv, "--write-samples") || fixture;
    if (writeSamples) {
      writeFileSync(
        join(outDir, "settlement-friction-coverage-samples.jsonl"),
        artifacts.samplesJsonl,
        "utf8",
      );
    } else {
      writeFileSync(
        join(outDir, "settlement-friction-coverage-samples-provenance.json"),
        `${JSON.stringify({
          samplesLocalOnly: true,
          retainedSamples: result.samples.length,
          samplesContentSha256: result.samplesContentSha256,
          note:
            "Sample-level JSONL omitted from out-dir by default for empirical runs; "
            + "pass --write-samples to emit it. Local streamer path: "
            + "data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl",
        }, null, 2)}\n`,
        "utf8",
      );
    }
    writeFileSync(
      join(outDir, "settlement-friction-coverage-by-day.json"),
      artifacts.byDayJson,
      "utf8",
    );
    writeFileSync(
      join(outDir, "settlement-friction-coverage-report.md"),
      artifacts.reportMarkdown,
      "utf8",
    );

    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        completionStatus: result.completionStatus,
        outDir,
        retainedSamples: result.samples.length,
        processedDays: result.successfullyProcessedUtcDayCount,
        eligibleDays: result.eligibleUtcDayCount,
        manifestContentSha256: artifacts.manifestContentSha256,
        configurationIdentity: result.config.configurationIdentity,
      })}\n`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`settlement-friction-coverage failed: ${message}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runSettlementFrictionCoverageCommand(
    process.argv.slice(2),
  );
}

if (
  import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith("runSettlementFrictionCoverage.ts")
) {
  void main();
}
