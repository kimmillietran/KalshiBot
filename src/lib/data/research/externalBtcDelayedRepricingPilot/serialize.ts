/**
 * Artifact serialization for the corrected preparation pilot.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { sha256HexOfUtf8, type PilotDataManifest } from "./dataManifest";
import { FROZEN_PILOT_SPEC } from "./pilotSpec";
import { TIMING_QUALITY } from "./timingQuality";
import type { PilotRunReport } from "./types";
import { M128_RECONCILIATION } from "./m128Reconciliation";

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function writePreparationArtifacts(input: {
  outDir: string;
  manifest: PilotDataManifest;
  report?: PilotRunReport | null;
}): {
  paths: Record<string, string>;
  hashes: Record<string, string>;
} {
  mkdirSync(input.outDir, { recursive: true });
  const paths: Record<string, string> = {};
  const hashes: Record<string, string> = {};

  const write = (name: string, value: unknown) => {
    const path = join(input.outDir, name);
    const body = typeof value === "string" ? value : stableStringify(value);
    writeFileSync(path, body, "utf8");
    paths[name] = path;
    hashes[name] = sha256HexOfUtf8(body);
  };

  write("pilot-spec.json", FROZEN_PILOT_SPEC);
  write("data-manifest.json", {
    ...input.manifest,
    fridayOnly: true,
    analysisVersion: FROZEN_PILOT_SPEC.analysisVersion,
    priorAnalysisVersion: FROZEN_PILOT_SPEC.priorAnalysisVersion,
    correctionsFromPrepV0: FROZEN_PILOT_SPEC.correctionsFromPrepV0,
  });
  write("timing-quality.json", TIMING_QUALITY);
  write("m128-reconciliation.json", M128_RECONCILIATION);

  if (input.report) {
    write("pilot-report.json", input.report);
    write(
      "events.jsonl",
      `${input.report.events.map((e) => JSON.stringify(e)).join("\n")}${
        input.report.events.length ? "\n" : ""
      }`,
    );
    write(
      "trades.jsonl",
      `${input.report.trades.map((t) => JSON.stringify(t)).join("\n")}${
        input.report.trades.length ? "\n" : ""
      }`,
    );
    write("day-summaries.json", input.report.daySummaries);
    write("by-delay.json", input.report.byDelay);
  }

  write(
    "README.md",
    [
      "# External BTC → delayed Kalshi repricing pilot (correction-v1)",
      "",
      FROZEN_PILOT_SPEC.disclaimer,
      "",
      "## Corrections from prep-v0",
      "",
      ...FROZEN_PILOT_SPEC.correctionsFromPrepV0.map((c) => `- ${c}`),
      "",
      "## Status",
      "",
      "- Spec + manifest + streaming runner + fixture path verified.",
      "- Coinbase tick acquisition is **not** authorized in this task.",
      "- Friday-only exploratory days; fragile G≤5 CI.",
      "- Do not interpret fixture runs as empirical results.",
      "",
      "## Runner",
      "",
      "```bash",
      "npm run research:external-btc-delayed-repricing-pilot",
      "npm run research:external-btc-delayed-repricing-pilot -- --native-fixture",
      "# Empirical (separate authorization + local Coinbase files):",
      "npm run research:external-btc-delayed-repricing-pilot -- --run-real --authorize-empirical-run",
      "```",
      "",
      "## Next authorization prompt",
      "",
      "Authorize only: (1) CryptoStruct credit purchase of Coinbase BTC-USD",
      `instrument_id=${input.manifest.venue.instrumentId} for Friday dates`,
      input.manifest.utcDates.join(", "),
      `(€${input.manifest.creditQuote.totalEur}, approval_required), download to`,
      `${input.manifest.downloadMethod.localDestination}; (2) run`,
      "`--run-real --authorize-empirical-run` and report complete vs incomplete economics",
      "for all delays without selecting the best delay. Do not claim verified tradability.",
      "",
    ].join("\n"),
  );

  return { paths, hashes };
}
