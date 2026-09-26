/**
 * Artifact serialization for the preparation pilot.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { sha256HexOfUtf8 } from "./dataManifest";
import type { PilotDataManifest } from "./dataManifest";
import { FROZEN_PILOT_SPEC } from "./pilotSpec";
import { TIMING_QUALITY } from "./timingQuality";
import type { PilotRunReport } from "./types";

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
  write("data-manifest.json", input.manifest);
  write("timing-quality.json", TIMING_QUALITY);

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
    write("timing-exclusions.json", input.report.timingExclusions);
  }

  write(
    "README.md",
    [
      "# External BTC → delayed Kalshi repricing pilot (preparation)",
      "",
      FROZEN_PILOT_SPEC.disclaimer,
      "",
      "## Status",
      "",
      "- Spec + manifest + runner prepared.",
      "- Coinbase tick acquisition is **not** authorized in this task.",
      "- Do not interpret fixture/synthetic runs as empirical results.",
      "",
      "## Next authorization prompt",
      "",
      "Authorize only: (1) CryptoStruct credit purchase of Coinbase BTC-USD",
      `instrument_id=${input.manifest.venue.instrumentId} for dates`,
      input.manifest.utcDates.join(", "),
      `(€${input.manifest.creditQuote.totalEur}, approval_required), download to`,
      `${input.manifest.downloadMethod.localDestination}, then (2) run`,
      "`npm run research:external-btc-delayed-repricing-pilot` on those days.",
      "",
    ].join("\n"),
  );

  return { paths, hashes };
}
