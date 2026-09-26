#!/usr/bin/env npx tsx
/**
 * External BTC → delayed Kalshi repricing pilot CLI (correction-v1).
 *
 * Default: write frozen spec + manifest + timing + M12.8 reconciliation.
 * --native-fixture: end-to-end native .txt.zst path (not empirical).
 * --run-real: load local files; requires --authorize-empirical-run for strategy output.
 */

import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  buildPilotDataManifest,
  DEFAULT_COINBASE_DEST_ROOT,
  DEFAULT_KALSHI_RAW_ROOT,
  FROZEN_PILOT_SPEC,
  loadPilotDayFromFiles,
  defaultCoinbasePath,
  defaultKalshiZipPath,
  runExternalBtcDelayedRepricingPilot,
  writePreparationArtifacts,
  writeZstdTextFixture,
  PILOT_UTC_DAYS,
  EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
  processOnePilotDay,
  aggregateDayResults,
  loadDayResultFile,
  hashFileSha256,
} from "@/lib/data/research/externalBtcDelayedRepricingPilot";

function parseArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function buildNativeFixtureDay(): Promise<{
  utcDay: string;
  coinbasePath: string;
  kalshiZipPath: string;
  cleanupDir: string;
}> {
  const dir = mkdtempSync(join(tmpdir(), "ext-btc-pilot-"));
  const utcDay = "2026-08-14";
  const coinbasePath = join(dir, `coinbase-BTC-USD-${utcDay}.txt.zst`);

  // Sparse Coinbase book: flat then +8bps mid move.
  const cbLines: string[] = [
    JSON.stringify({
      instrument: { id: 15050, code: "BTC-USD", exchange_code: "coinbase" },
    }),
  ];
  let eventId = 1;
  const pushBook = (
    adapterNs: number,
    exchangeNs: number,
    bid: string,
    ask: string,
    snapshot: boolean,
  ) => {
    const prev = snapshot ? "0" : String(eventId - 1);
    const id = String(eventId);
    eventId += 1;
    cbLines.push(
      JSON.stringify([
        snapshot ? 0 : 1,
        15050,
        prev,
        id,
        adapterNs,
        exchangeNs,
        [
          [0, bid, "1.5", 1],
          [1, ask, "1.5", 1],
        ],
        ...(snapshot ? [true] : []),
      ]),
    );
  };
  // t=0..20s flat at 50000
  for (let s = 0; s <= 20; s += 1) {
    const ns = s * 1_000_000_000;
    pushBook(ns, ns, "49999.5", "50000.5", s === 0);
  }
  // t=21s jump to 50040 (~8bps from t=16)
  pushBook(21_000_000_000, 21_000_000_000, "50039.5", "50040.5", false);

  await writeZstdTextFixture(coinbasePath, cbLines);

  // Kalshi contract member covering the window
  const member = `kalshi-KXBTC15M-26AUG141500-00-${utcDay}.txt.zst`;
  const memberPath = join(dir, member);
  const start = "2026-08-14 00:00:00";
  const expiry = "2026-08-14 23:59:00";
  const kLines: string[] = [
    JSON.stringify({
      instrument: {
        id: 1,
        code: "KXBTC15M-26AUG141500-00",
        start,
        expiry,
        exchange_code: "kalshi",
      },
    }),
  ];
  eventId = 1;
  const pushK = (
    adapterNs: number,
    exchangeNs: number,
    bid: string,
    ask: string,
    snapshot: boolean,
  ) => {
    const prev = snapshot ? "0" : String(eventId - 1);
    const id = String(eventId);
    eventId += 1;
    kLines.push(
      JSON.stringify([
        snapshot ? 0 : 1,
        1,
        prev,
        id,
        adapterNs,
        exchangeNs,
        [
          [0, bid, "10", 1],
          [1, ask, "10", 1],
        ],
        ...(snapshot ? [true] : []),
      ]),
    );
  };
  for (let s = 0; s <= 60; s += 1) {
    const ns = s * 1_000_000_000;
    const favorable = s >= 22;
    pushK(
      ns,
      ns,
      favorable ? "0.54" : "0.49",
      favorable ? "0.56" : "0.51",
      s === 0,
    );
  }
  await writeZstdTextFixture(memberPath, kLines);

  const kalshiZipPath = join(dir, `kalshi-btc-15m_${utcDay}.zip`);
  const zip = spawnSync("zip", ["-q", kalshiZipPath, member], { cwd: dir });
  if (zip.status !== 0) {
    throw new Error(`zip fixture failed: ${zip.stderr?.toString()}`);
  }
  writeFileSync(join(dir, "MANIFEST.txt"), `${member}\n`, "utf8");

  return { utcDay, coinbasePath, kalshiZipPath, cleanupDir: dir };
}

async function main(): Promise<void> {
  const outDir =
    parseArg("--out-dir")
    ?? join(
      process.cwd(),
      "data/research-results/external-kalshi-data-audit/external-btc-delayed-repricing-pilot",
    );
  mkdirSync(outDir, { recursive: true });

  // Child-worker entry: process exactly one day and exit (memory reclaim).
  const oneDay = parseArg("--process-one-day");
  if (oneDay) {
    if (!(PILOT_UTC_DAYS as readonly string[]).includes(oneDay)) {
      throw new Error(`--process-one-day ${oneDay} is not in frozen Friday set`);
    }
    const result = await processOnePilotDay({
      utcDay: oneDay,
      coinbaseTickPath: defaultCoinbasePath(DEFAULT_COINBASE_DEST_ROOT, oneDay),
      kalshiZipPath: defaultKalshiZipPath(DEFAULT_KALSHI_RAW_ROOT, oneDay),
      outDir,
    });
    const inputHashes = {
      [`coinbase:${oneDay}`]: await hashFileSha256(
        defaultCoinbasePath(DEFAULT_COINBASE_DEST_ROOT, oneDay),
      ),
      [`kalshi-zip:${oneDay}`]: await hashFileSha256(
        defaultKalshiZipPath(DEFAULT_KALSHI_RAW_ROOT, oneDay),
      ),
    };
    console.log(
      JSON.stringify({
        utcDay: oneDay,
        dayResultPath: result.path,
        dayResultKey: result.dayResultKey,
        reused: result.reused,
        inputHashes,
      }),
    );
    return;
  }

  const manifest = buildPilotDataManifest({
    creditBalanceCents: Number(parseArg("--credit-balance-cents") ?? 1600),
    generatedAtIso: parseArg("--generated-at") ?? "2026-09-26T03:00:00.000Z",
  });

  let report = null;

  if (hasFlag("--native-fixture")) {
    const fixture = await buildNativeFixtureDay();
    const day = await loadPilotDayFromFiles({
      utcDay: fixture.utcDay,
      coinbaseTickPath: fixture.coinbasePath,
      kalshiZipPath: fixture.kalshiZipPath,
    });
    report = runExternalBtcDelayedRepricingPilot({
      days: [
        {
          utcDay: day.utcDay,
          externalBbo: day.externalBbo,
          contracts: day.contracts,
          quotesByTicker: day.quotesByTicker,
        },
      ],
      inputHashes: { ...day.inputHashes, mode: "native-fixture-not-empirical" },
      codeVersions: {
        analysisVersion: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
      },
    });
  }

  if (hasFlag("--run-real")) {
    const missing = [...PILOT_UTC_DAYS].filter(
      (d) => !existsSync(defaultCoinbasePath(DEFAULT_COINBASE_DEST_ROOT, d)),
    );
    if (missing.length > 0) {
      throw new Error(
        `Cannot --run-real: missing Coinbase ticks for ${missing.join(", ")}. `
          + "Acquisition is not authorized by this preparation CLI.",
      );
    }
    if (!hasFlag("--authorize-empirical-run")) {
      // Path is implemented; empirics remain gated. Smoke-load day 0 only.
      const smokeDay = PILOT_UTC_DAYS[0];
      const day = await loadPilotDayFromFiles({
        utcDay: smokeDay,
        coinbaseTickPath: defaultCoinbasePath(DEFAULT_COINBASE_DEST_ROOT, smokeDay),
        kalshiZipPath: defaultKalshiZipPath(DEFAULT_KALSHI_RAW_ROOT, smokeDay),
      });
      console.log(
        JSON.stringify(
          {
            runRealPath: "implemented-per-day-child-v1",
            empiricalAuthorized: false,
            loadedDay: smokeDay,
            externalBboPoints: day.externalBbo.length,
            contracts: day.contracts.length,
            inputHashes: day.inputHashes,
            note:
              "Re-run with --authorize-empirical-run after explicit authorization to "
              + "emit SPENT exploratory strategy P&L.",
          },
          null,
          2,
        ),
      );
      const { paths, hashes } = writePreparationArtifacts({ outDir, manifest, report: null });
      console.log(JSON.stringify({ outDir, paths, hashes, purchaseAuthorizedInThisTask: false }, null, 2));
      return;
    }

    // Memory-bounded empirical path: one sequential child process per day.
    const hashes: Record<string, string> = {};
    const dayResultPaths: string[] = [];
    const nodeOptions = process.env.NODE_OPTIONS ?? "--max-old-space-size=8192";

    for (const utcDay of PILOT_UTC_DAYS) {
      const child = spawnSync(
        "npx",
        [
          "tsx",
          "scripts/research/runExternalBtcDelayedRepricingPilot.ts",
          "--process-one-day",
          utcDay,
          "--out-dir",
          outDir,
          "--credit-balance-cents",
          String(parseArg("--credit-balance-cents") ?? 1100),
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, NODE_OPTIONS: nodeOptions },
          encoding: "utf8",
          maxBuffer: 32 * 1024 * 1024,
        },
      );
      if (child.status !== 0) {
        console.error(child.stderr || child.stdout);
        throw new Error(
          `Day worker failed for ${utcDay}: status=${child.status} signal=${child.signal}`,
        );
      }
      const lines = (child.stdout || "").trim().split("\n").filter(Boolean);
      const last = lines[lines.length - 1];
      if (!last) throw new Error(`Day worker produced no stdout for ${utcDay}`);
      const parsed = JSON.parse(last) as {
        utcDay: string;
        dayResultPath: string;
        dayResultKey: string;
        reused: boolean;
        inputHashes: Record<string, string>;
      };
      Object.assign(hashes, parsed.inputHashes);
      dayResultPaths.push(parsed.dayResultPath);
      console.error(
        JSON.stringify({
          parentProgress: "day-complete",
          utcDay,
          reused: parsed.reused,
          dayResultKey: parsed.dayResultKey.slice(0, 16),
        }),
      );
    }

    const dayResults = dayResultPaths.map((p) => loadDayResultFile(p));
    report = aggregateDayResults({ dayResults, inputHashes: hashes });
  }

  const { paths, hashes } = writePreparationArtifacts({ outDir, manifest, report });

  console.log(
    JSON.stringify(
      {
        studyId: FROZEN_PILOT_SPEC.studyId,
        analysisVersion: FROZEN_PILOT_SPEC.analysisVersion,
        outDir,
        paths,
        hashes,
        creditQuote: manifest.creditQuote,
        missingCoinbaseDays: manifest.totals.missingCoinbaseDays,
        fridayOnly: true,
        m128Decision: FROZEN_PILOT_SPEC.m128Reconciliation.decision,
        purchaseAuthorizedInThisTask: false,
        empiricalRunEmitted: Boolean(report && hasFlag("--authorize-empirical-run")),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
