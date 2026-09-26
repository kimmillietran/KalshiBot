/**
 * One-shot CPU profile target for deep-book baseline (benchmark only).
 * Run: node --cpu-prof --cpu-prof-dir=DIR --cpu-prof-name=NAME --import tsx scripts/research/profileExternalBtcIngestionOnce.ts
 */
import { join } from "node:path";

import { replayBaselineAsync } from "@/lib/data/research/externalBtcIngestionBenchmark/baselineReplay";

async function main(): Promise<void> {
  const root = process.cwd();
  const path = join(
    root,
    "data/research-results/external-kalshi-data-audit/external-btc-ingestion-benchmark/work/deep-book-high-update.txt.zst",
  );
  const r = await replayBaselineAsync(path, {
    profiled: false,
    hashInputSeparately: true,
  });
  console.log(
    JSON.stringify({
      quotes: r.quotes.length,
      msgs: r.counters.linesSeen,
      decomp: r.decompressedBytes,
      scans: r.counters.bestScans,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
