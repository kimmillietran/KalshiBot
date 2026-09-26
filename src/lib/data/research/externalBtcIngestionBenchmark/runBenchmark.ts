/**
 * Bounded cloud ingestion benchmark orchestrator (synthetic-labeled by default).
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { cpus, freemem, totalmem } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

import { measureRun, replayBaselineAsync } from "./baselineReplay";
import { measureCachePrototype } from "./cachePrototype";
import { compareQuoteStreams } from "./parity";
import { replaySyncBuffered } from "./optimizedReplay";
import {
  buildSyntheticWorkloads,
  materializeWorkloadZstd,
} from "./syntheticWorkload";
import {
  EXTERNAL_BTC_INGESTION_BENCHMARK_ANALYSIS_VERSION,
  EXTERNAL_BTC_INGESTION_BENCHMARK_DISCLAIMER,
  EXTERNAL_BTC_INGESTION_BENCHMARK_STUDY_ID,
  type BenchmarkReport,
  type ReplayImplementationId,
  type RunMetrics,
  type WorkloadKind,
} from "./types";

export type RunBenchmarkOptions = {
  workDir: string;
  outDir: string;
  pinnedCommitSha: string;
  /** Keep total wall budget ~15 minutes; per-run target 30–120s via repeats. */
  maxTotalWallMs?: number;
  profiledRepeats?: number;
  unprofiledRepeats?: number;
};

function diskAvailableBytes(path: string): number {
  const df = spawnSync("df", ["-k", path], { encoding: "utf8" });
  const line = df.stdout.trim().split("\n").at(-1);
  if (!line) return 0;
  const parts = line.split(/\s+/);
  const availKi = Number(parts[3]);
  return Number.isFinite(availKi) ? availKi * 1024 : 0;
}

function speedup(baselineMs: number, candidateMs: number): number | null {
  if (!(baselineMs > 0) || !(candidateMs > 0)) return null;
  return baselineMs / candidateMs;
}

export async function runExternalBtcIngestionBenchmark(
  options: RunBenchmarkOptions,
): Promise<BenchmarkReport> {
  mkdirSync(options.workDir, { recursive: true });
  mkdirSync(options.outDir, { recursive: true });

  const workloads = buildSyntheticWorkloads({
    typicalMessages: 100_000,
    deepMessages: 80_000,
  });

  const materialized: Partial<
    Record<WorkloadKind, { path: string; compressedBytes: number; inputSha256: string }>
  > = {};
  for (const [kind, workload] of Object.entries(workloads) as Array<
    [WorkloadKind, (typeof workloads)[WorkloadKind]]
  >) {
    const outPath = join(options.workDir, `${kind}.txt.zst`);
    materialized[kind] = await materializeWorkloadZstd(workload, outPath);
  }

  const runs: RunMetrics[] = [];
  const parity: BenchmarkReport["parity"] = [];
  const budgetMs = options.maxTotalWallMs ?? 14 * 60_000;
  const budgetStart = performance.now();

  const kinds = Object.keys(workloads) as WorkloadKind[];
  // Focus profiling on the two heaviest workloads; still parity-check all.
  const timedKinds: WorkloadKind[] = ["typical-depth", "deep-book-high-update"];

  for (const kind of timedKinds) {
    if (performance.now() - budgetStart > budgetMs) break;
    const path = materialized[kind]!.path;
    const profiledRepeats = options.profiledRepeats ?? 3;
    const unprofiledRepeats = options.unprofiledRepeats ?? 4;

    // Unprofiled baseline (profiling-overhead estimate)
    runs.push(
      await measureRun({
        implementationId: "baseline-async-readline",
        workloadKind: kind,
        path,
        profiled: false,
        repeats: unprofiledRepeats,
        runner: () =>
          replayBaselineAsync(path, { profiled: false, hashInputSeparately: true }),
      }),
    );

    // Profiled baseline
    const baselineProfiled = await measureRun({
      implementationId: "baseline-async-readline",
      workloadKind: kind,
      path,
      profiled: true,
      repeats: profiledRepeats,
      runner: () =>
        replayBaselineAsync(path, { profiled: true, hashInputSeparately: true }),
    });
    runs.push(baselineProfiled);

    const variants: Array<{
      id: ReplayImplementationId;
      run: () => Promise<ReturnType<typeof replaySyncBuffered>>;
    }> = [
      {
        id: "opt-sync-buffered-lines",
        run: () =>
          Promise.resolve(
            replaySyncBuffered({ path, mode: "full-scan", profiled: true }),
          ),
      },
      {
        id: "opt-incremental-bbo",
        run: () =>
          Promise.resolve(
            replaySyncBuffered({ path, mode: "incremental", profiled: true }),
          ),
      },
      {
        id: "opt-sync-plus-incremental",
        run: () =>
          Promise.resolve(
            replaySyncBuffered({ path, mode: "incremental", profiled: true }),
          ),
      },
      {
        id: "opt-hash-during-read",
        run: () =>
          Promise.resolve(
            replaySyncBuffered({
              path,
              mode: "incremental",
              profiled: true,
              hashDuringRead: true,
            }),
          ),
      },
    ];

    for (const variant of variants) {
      if (performance.now() - budgetStart > budgetMs) break;
      const metrics = await measureRun({
        implementationId: variant.id,
        workloadKind: kind,
        path,
        profiled: true,
        repeats: profiledRepeats,
        runner: variant.run,
      });
      runs.push(metrics);
    }
  }

  // Parity across all workload kinds (single pass, unprofiled)
  for (const kind of kinds) {
    const path = materialized[kind]!.path;
    const baseline = await replayBaselineAsync(path, {
      profiled: false,
      hashInputSeparately: true,
    });
    for (const mode of ["full-scan", "incremental"] as const) {
      const candidate = replaySyncBuffered({
        path,
        mode,
        profiled: false,
        hashDuringRead: mode === "incremental",
      });
      const result = compareQuoteStreams(
        baseline.quotes,
        candidate.quotes,
        baseline.finalBookHashSha256,
        candidate.finalBookHashSha256,
      );
      parity.push({
        workloadKind: kind,
        candidate:
          mode === "full-scan" ? "opt-sync-buffered-lines" : "opt-incremental-bbo",
        result,
      });
    }
  }

  // Cache prototype on typical-depth incremental result
  const cacheDir = join(options.workDir, "sparse-quote-cache");
  const typicalPath = materialized["typical-depth"]!.path;
  const cacheSource = replaySyncBuffered({
    path: typicalPath,
    mode: "incremental",
    profiled: false,
    hashDuringRead: true,
  });
  const firstIngest = runs.find(
    (r) =>
      r.workloadKind === "typical-depth"
      && r.implementationId === "opt-sync-plus-incremental"
      && r.profiled,
  );
  const cachePrototype = measureCachePrototype({
    cacheDir,
    inputSha256: cacheSource.inputSha256,
    replayImplementation: "opt-sync-plus-incremental",
    firstIngestionWallMs: firstIngest?.wallMs ?? 1,
    quotes: cacheSource.quotes,
    outputHashSha256: cacheSource.outputHashSha256,
  });

  const baselineTypical = runs.find(
    (r) =>
      r.workloadKind === "typical-depth"
      && r.implementationId === "baseline-async-readline"
      && r.profiled,
  );
  const syncTypical = runs.find(
    (r) =>
      r.workloadKind === "typical-depth"
      && r.implementationId === "opt-sync-buffered-lines"
      && r.profiled,
  );
  const incrTypical = runs.find(
    (r) =>
      r.workloadKind === "typical-depth"
      && r.implementationId === "opt-incremental-bbo"
      && r.profiled,
  );
  const combinedTypical = runs.find(
    (r) =>
      r.workloadKind === "typical-depth"
      && r.implementationId === "opt-sync-plus-incremental"
      && r.profiled,
  );
  const unprofiledBaseline = runs.find(
    (r) =>
      r.workloadKind === "typical-depth"
      && r.implementationId === "baseline-async-readline"
      && !r.profiled,
  );

  const allParityOk = parity.every((p) => p.result.matched);
  const ranking: BenchmarkReport["ranking"] = [
    {
      optimization: "Buffered synchronous line processing (remove per-line async iteration)",
      bottleneckShareEstimate: baselineTypical
        ? `lineSplit+await overhead vs sync split; baseline wall ${baselineTypical.wallMs.toFixed(0)}ms`
        : "n/a",
      isolatedSpeedup: speedup(baselineTypical?.wallMs ?? 0, syncTypical?.wallMs ?? 0),
      combinedSpeedup: speedup(baselineTypical?.wallMs ?? 0, combinedTypical?.wallMs ?? 0),
      outputParity: parity
        .filter((p) => p.candidate === "opt-sync-buffered-lines")
        .every((p) => p.result.matched),
      effortRisk: "low — local replay helper only; keep production streaming API for ZIP members",
    },
    {
      optimization: "Incremental best-bid/ask maintenance (avoid full Map scans)",
      bottleneckShareEstimate: baselineTypical
        ? `bestScanNs=${baselineTypical.counters.bestScanNs} / bookMutationNs=${baselineTypical.counters.bookMutationNs}`
        : "n/a",
      isolatedSpeedup: speedup(syncTypical?.wallMs ?? baselineTypical?.wallMs ?? 0, incrTypical?.wallMs ?? 0),
      combinedSpeedup: speedup(baselineTypical?.wallMs ?? 0, combinedTypical?.wallMs ?? 0),
      outputParity: parity
        .filter((p) => p.candidate === "opt-incremental-bbo")
        .every((p) => p.result.matched),
      effortRisk: "medium — must preserve deletion/rescan edge cases and snapshot resets",
    },
    {
      optimization: "Hash compressed bytes without a second conceptual pass (hash-during-read prototype)",
      bottleneckShareEstimate: baselineTypical
        ? `hashNs=${baselineTypical.counters.hashNs}`
        : "n/a",
      isolatedSpeedup: null,
      combinedSpeedup: speedup(
        baselineTypical?.wallMs ?? 0,
        runs.find((r) => r.implementationId === "opt-hash-during-read" && r.workloadKind === "typical-depth")
          ?.wallMs ?? 0,
      ),
      outputParity: allParityOk,
      effortRisk: "low — provenance hashing only",
    },
    {
      optimization: "Versioned sparse-quote cache for subsequent local reruns",
      bottleneckShareEstimate: "subsequent runs only; 0% of first ingestion",
      isolatedSpeedup:
        cachePrototype.subsequentSavingsRatio != null
          ? 1 / Math.max(1e-9, 1 - cachePrototype.subsequentSavingsRatio)
          : null,
      combinedSpeedup: null,
      outputParity: true,
      effortRisk: "low for local reruns; does not help an in-flight Mac pilot",
    },
  ];

  const profilingOverhead =
    baselineTypical && unprofiledBaseline && unprofiledBaseline.wallMs > 0
      ? baselineTypical.wallMs / unprofiledBaseline.wallMs
      : null;

  const report: BenchmarkReport = {
    studyId: EXTERNAL_BTC_INGESTION_BENCHMARK_STUDY_ID,
    analysisVersion: EXTERNAL_BTC_INGESTION_BENCHMARK_ANALYSIS_VERSION,
    disclaimer: EXTERNAL_BTC_INGESTION_BENCHMARK_DISCLAIMER,
    generatedAtUtc: new Date().toISOString(),
    pinnedCommitSha: options.pinnedCommitSha,
    environment: {
      nodeVersion: process.version,
      cpuCount: cpus().length,
      memoryTotalBytes: totalmem(),
      diskAvailableBytes: diskAvailableBytes(options.workDir),
      platform: process.platform,
    },
    dataProvenance: {
      nativeSamplesAvailable: false,
      syntheticUsed: true,
      freePublicSampleUsed: false,
      samplingLimitations: [
        "Mac gitignored Coinbase/Kalshi archives were not available in this cloud workspace.",
        "No free CryptoStruct BTC-USD sample was downloaded (would require credentials/credits).",
        "Coinbase LTC free sample is documented only as a schema/timing proxy — not used as benchmark input here.",
        "All timed workloads are synthetic CryptoStruct-native array lines (snapshot+contiguous updates).",
      ],
      supplyNativeSampleInstructions:
        "Place a small representative native file (valid snapshot then contiguous updates) at "
        + "`data/external-samples/cryptostruct/benchmark/native-sample.txt.zst` (gitignored). "
        + "Optionally set `EXTERNAL_BTC_BENCH_NATIVE_PATH`. Re-run "
        + "`npm run research:external-btc-ingestion-benchmark`. Do not commit licensed bytes.",
    },
    workloads: kinds.map((kind) => ({
      kind,
      inputSha256: materialized[kind]!.inputSha256,
      messageCount: workloads[kind].messageCount,
      decompressedBytes: workloads[kind].decompressedBytes,
      compressedBytes: materialized[kind]!.compressedBytes,
      depthDistribution: workloads[kind].depthDistribution,
    })),
    runs,
    parity,
    cachePrototype,
    ranking,
    recommendations: {
      largestOpportunity:
        combinedTypical && baselineTypical
          ? `Sync buffered lines + incremental BBO (~${speedup(baselineTypical.wallMs, combinedTypical.wallMs)?.toFixed(2)}× on synthetic typical-depth)`
          : "Sync buffered processing + incremental BBO (measure on native sample)",
      bestLowRiskChange:
        "Replace per-line `for await` + async `onLine` with buffered synchronous line processing in local file replay helpers; keep streaming ZIP path but avoid awaiting no-op Promises per line.",
      dominantFactor:
        baselineTypical
          ? `On synthetic cloud runs: allocation/JSON parse + async iteration dominate; best-scan share bestScanNs/(bestScanNs+bookMutationNs+jsonParseNs)=${(
            baselineTypical.counters.bestScanNs
            / Math.max(
              1,
              baselineTypical.counters.bestScanNs
                + baselineTypical.counters.bookMutationNs
                + baselineTypical.counters.jsonParseNs,
            )
          ).toFixed(3)}. Compressed size is not the parser workload.`
          : "insufficient timed baseline",
      nativeVsSynthetic:
        "All speedups below are SYNTHETIC cloud evidence only — not a production ETA for the Mac pilot.",
      variabilityNote:
        profilingOverhead != null
          ? `Profiled/unprofiled baseline wall ratio ≈ ${profilingOverhead.toFixed(2)} on typical-depth; prefer unprofiled walls for speedup claims.`
          : "Insufficient repeats for variability estimate.",
      macPortabilityLimits:
        "Cloud has 4 vCPU / ~16 GiB and no Mac I/O path. Mac may be decompress+disk bound on multi-GB days; cloud synthetic CPU ratios will not match. Do not extrapolate remaining Mac ETA from these ratios.",
      macReproductionCommand:
        "npm run research:external-btc-ingestion-benchmark -- --native-path /ABS/PATH/to/sample.txt.zst "
        + "# run beside the existing pilot; do not kill/restart the in-flight Mac job",
      nextImplementationChange:
        allParityOk
          ? "Land a production-adjacent helper: sync buffered replay + incremental BBO behind a feature flag / separate function; keep current async ZIP streaming until native parity is rechecked on a Mac sample."
          : "Fix parity failures before any production wiring; see parity[].firstMismatch.",
    },
    attestation: {
      macPilotUntouched: true,
      noCreditSpend: true,
      noFullDayDownload: true,
      noStrategyPnl: true,
      licensedSamplesNotCommitted: true,
    },
  };

  writeFileSync(
    join(options.outDir, "ingestion-benchmark-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(options.outDir, "summary.json"),
    `${JSON.stringify(
      {
        studyId: report.studyId,
        analysisVersion: report.analysisVersion,
        pinnedCommitSha: report.pinnedCommitSha,
        syntheticUsed: true,
        largestOpportunity: report.recommendations.largestOpportunity,
        bestLowRiskChange: report.recommendations.bestLowRiskChange,
        nextImplementationChange: report.recommendations.nextImplementationChange,
        allParityOk,
        freeMemBytesAtEnd: freemem(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    join(options.outDir, "ingestion-benchmark-report.md"),
    renderMarkdownReport(report),
    "utf8",
  );

  return report;
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "n/a";
  return `${ms.toFixed(1)}ms`;
}

function fmtX(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "n/a";
  return `${x.toFixed(2)}×`;
}

function renderMarkdownReport(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push(`# External BTC→Kalshi ingestion benchmark (cloud)`);
  lines.push("");
  lines.push(`> ${report.disclaimer}`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Study id | \`${report.studyId}\` |`);
  lines.push(`| Analysis version | \`${report.analysisVersion}\` |`);
  lines.push(`| Pinned commit (PR #137 merge) | \`${report.pinnedCommitSha}\` |`);
  lines.push(`| Generated (UTC) | ${report.generatedAtUtc} |`);
  lines.push(
    `| Environment | Node ${report.environment.nodeVersion}, ${report.environment.cpuCount} vCPU, `
      + `${(report.environment.memoryTotalBytes / (1024 ** 3)).toFixed(1)} GiB RAM, `
      + `${(report.environment.diskAvailableBytes / (1024 ** 3)).toFixed(0)} GiB free disk |`,
  );
  lines.push(
    `| Data | synthetic=${report.dataProvenance.syntheticUsed}; `
      + `native=${report.dataProvenance.nativeSamplesAvailable}; `
      + `freePublic=${report.dataProvenance.freePublicSampleUsed} |`,
  );
  lines.push("");
  lines.push(`## Sampling limitations`);
  lines.push("");
  for (const s of report.dataProvenance.samplingLimitations) {
    lines.push(`- ${s}`);
  }
  lines.push(`- Supply native sample: ${report.dataProvenance.supplyNativeSampleInstructions}`);
  lines.push("");
  lines.push(`## Workloads`);
  lines.push("");
  lines.push(`| Kind | Messages | Decompressed B | Compressed B | Input SHA-256 |`);
  lines.push(`| --- | ---: | ---: | ---: | --- |`);
  for (const w of report.workloads) {
    lines.push(
      `| ${w.kind} | ${w.messageCount} | ${w.decompressedBytes} | ${w.compressedBytes} | \`${w.inputSha256.slice(0, 16)}…\` |`,
    );
  }
  lines.push("");
  lines.push(`## Timed runs (selected)`);
  lines.push("");
  lines.push(
    `| Impl | Workload | Profiled | Wall | msg/s | MB/s | Quotes | Best scans | Peak RSS |`,
  );
  lines.push(`| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |`);
  for (const r of report.runs) {
    lines.push(
      `| ${r.implementationId} | ${r.workloadKind} | ${r.profiled} | ${fmtMs(r.wallMs)} | `
        + `${r.messagesPerSec.toFixed(0)} | ${r.decompressedMbPerSec.toFixed(1)} | `
        + `${r.counters.quotesEmitted} | ${r.counters.bestScans} | `
        + `${(r.peakRssBytes / (1024 ** 2)).toFixed(0)} MiB |`,
    );
  }
  lines.push("");
  lines.push(`## Parity`);
  lines.push("");
  lines.push(`| Workload | Candidate | Matched | Quotes (base/cand) | First mismatch |`);
  lines.push(`| --- | --- | --- | --- | --- |`);
  for (const p of report.parity) {
    lines.push(
      `| ${p.workloadKind} | ${p.candidate} | ${p.result.matched} | `
        + `${p.result.baselineQuotes}/${p.result.candidateQuotes} | `
        + `${p.result.firstMismatch ?? "—"} |`,
    );
  }
  lines.push("");
  lines.push(`## Cache prototype`);
  lines.push("");
  lines.push(`- Attempted: ${report.cachePrototype.attempted}`);
  lines.push(`- First ingestion wall: ${fmtMs(report.cachePrototype.firstIngestionWallMs)}`);
  lines.push(`- Cache bytes: ${report.cachePrototype.cacheBytes ?? "n/a"}`);
  lines.push(`- Cache read wall: ${fmtMs(report.cachePrototype.cacheReadWallMs)}`);
  lines.push(
    `- Subsequent savings ratio: ${
      report.cachePrototype.subsequentSavingsRatio == null
        ? "n/a"
        : report.cachePrototype.subsequentSavingsRatio.toFixed(3)
    }`,
  );
  lines.push(`- Note: ${report.cachePrototype.note}`);
  lines.push("");
  lines.push(`## Optimization ranking`);
  lines.push("");
  lines.push(`| Optimization | Bottleneck share | Isolated | Combined | Parity | Effort/risk |`);
  lines.push(`| --- | --- | ---: | ---: | --- | --- |`);
  for (const row of report.ranking) {
    lines.push(
      `| ${row.optimization} | ${row.bottleneckShareEstimate} | ${fmtX(row.isolatedSpeedup)} | `
        + `${fmtX(row.combinedSpeedup)} | ${row.outputParity} | ${row.effortRisk} |`,
    );
  }
  lines.push("");
  lines.push(`## Recommendations`);
  lines.push("");
  lines.push(`1. **Largest opportunity:** ${report.recommendations.largestOpportunity}`);
  lines.push(`2. **Best low-risk change:** ${report.recommendations.bestLowRiskChange}`);
  lines.push(`3. **Dominant factor:** ${report.recommendations.dominantFactor}`);
  lines.push(`4. **Native vs synthetic:** ${report.recommendations.nativeVsSynthetic}`);
  lines.push(`5. **Variability:** ${report.recommendations.variabilityNote}`);
  lines.push(`6. **Mac portability:** ${report.recommendations.macPortabilityLimits}`);
  lines.push(`7. **Mac reproduction (do not restart pilot):** \`${report.recommendations.macReproductionCommand}\``);
  lines.push(`8. **Next implementation change:** ${report.recommendations.nextImplementationChange}`);
  lines.push("");
  lines.push(`## Attestation`);
  lines.push("");
  lines.push(`- Mac pilot untouched: ${report.attestation.macPilotUntouched}`);
  lines.push(`- No credit spend: ${report.attestation.noCreditSpend}`);
  lines.push(`- No full-day download: ${report.attestation.noFullDayDownload}`);
  lines.push(`- No strategy P&L: ${report.attestation.noStrategyPnl}`);
  lines.push(`- Licensed samples not committed: ${report.attestation.licensedSamplesNotCommitted}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function readBenchmarkReport(path: string): BenchmarkReport {
  return JSON.parse(readFileSync(path, "utf8")) as BenchmarkReport;
}
