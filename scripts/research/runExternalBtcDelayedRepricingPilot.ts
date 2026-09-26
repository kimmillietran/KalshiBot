#!/usr/bin/env npx tsx
/**
 * Preparation runner for external BTC → delayed Kalshi repricing pilot.
 *
 * Default: write frozen spec + data manifest + timing docs (no chargeable download).
 * Optional --fixture-smoke: run synthetic in-memory pilot (never empirical).
 * Optional --run-real: requires local Coinbase ticks already present; still SPENT exploratory.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  buildPilotDataManifest,
  FROZEN_PILOT_SPEC,
  runExternalBtcDelayedRepricingPilot,
  writePreparationArtifacts,
  type BboPoint,
  type ExecutableQuote,
} from "@/lib/data/research/externalBtcDelayedRepricingPilot";

function parseArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function syntheticFixtureDay(): {
  utcDay: string;
  externalBbo: BboPoint[];
  kalshiQuotes: ExecutableQuote[];
} {
  const externalBbo: BboPoint[] = [];
  for (let t = 0; t <= 20_000; t += 1_000) {
    externalBbo.push({
      timestampMs: t,
      timestampSource: "exchange",
      bid: 50_000 - 0.5,
      ask: 50_000 + 0.5,
      bidSize: 1,
      askSize: 1,
      mid: 50_000,
      chainBreak: false,
      failClosed: false,
    });
  }
  externalBbo.push({
    timestampMs: 21_000,
    timestampSource: "exchange",
    bid: 50_040 - 0.5,
    ask: 50_040 + 0.5,
    bidSize: 1,
    askSize: 1,
    mid: 50_040,
    chainBreak: false,
    failClosed: false,
  });

  const kalshiQuotes: ExecutableQuote[] = [];
  for (let t = 0; t <= 60_000; t += 500) {
    kalshiQuotes.push({
      timestampMs: t,
      timestampSource: "exchange",
      yesBidCents: 49,
      yesAskCents: 51,
      yesBidSize: 5,
      yesAskSize: 5,
      noBidCents: 49,
      noAskCents: 51,
      noBidSize: 5,
      noAskSize: 5,
      stale: false,
      chainBreak: false,
    });
  }
  return { utcDay: "2026-08-14", externalBbo, kalshiQuotes };
}

async function main(): Promise<void> {
  const outDir =
    parseArg("--out-dir")
    ?? join(
      process.cwd(),
      "data/research-results/external-kalshi-data-audit/external-btc-delayed-repricing-pilot",
    );
  mkdirSync(outDir, { recursive: true });

  const manifest = buildPilotDataManifest({
    creditBalanceCents: Number(parseArg("--credit-balance-cents") ?? 1600),
    generatedAtIso: parseArg("--generated-at") ?? "2026-09-26T02:30:00.000Z",
  });

  let report = null;
  if (hasFlag("--fixture-smoke")) {
    report = runExternalBtcDelayedRepricingPilot({
      days: [syntheticFixtureDay()],
      inputHashes: { mode: "fixture-smoke-not-empirical" },
    });
  }

  if (hasFlag("--run-real")) {
    if (manifest.totals.missingCoinbaseDays.length > 0) {
      throw new Error(
        `Cannot --run-real: missing Coinbase ticks for ${manifest.totals.missingCoinbaseDays.join(", ")}. `
          + "Acquisition is not authorized by this preparation CLI.",
      );
    }
    throw new Error(
      "--run-real tick loading is prepared for a follow-on authorization prompt; "
        + "Coinbase files are present but this task forbids starting the empirical run.",
    );
  }

  const { paths, hashes } = writePreparationArtifacts({ outDir, manifest, report });

  console.log(
    JSON.stringify(
      {
        studyId: FROZEN_PILOT_SPEC.studyId,
        outDir,
        paths,
        hashes,
        creditQuote: manifest.creditQuote,
        missingCoinbaseDays: manifest.totals.missingCoinbaseDays,
        priorResearch: FROZEN_PILOT_SPEC.priorResearchAlreadyAnswered,
        purchaseAuthorizedInThisTask: false,
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
