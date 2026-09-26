/**
 * Run exploratory calibration-fade v2 SPENT grid hold-to-settlement study.
 * Offline retained inputs only. Simulated P&L at observed quotes.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CF_V2_SPENT_GRID_EXPECTED_INPUTS,
  runCalibrationFadeV2SpentGridHtsStudy,
  serializeCfV2SpentGridHtsMarkdown,
  type PreentryFeatureRow,
  type SettlementLabelRow,
} from "@/lib/data/research/calibrationFadeV2SpentGridHtsExploratory";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "../.."));

const OUT_DIR = join(
  ROOT,
  "data/research-results/external-kalshi-data-audit/calibration-fade-v2-spent-grid-hts-exploratory",
);

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadJsonl<T>(path: string): T[] {
  const rows: T[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as T);
  }
  return rows;
}

function main(): void {
  const featurePath = join(ROOT, CF_V2_SPENT_GRID_EXPECTED_INPUTS.preentryFeaturesRelativePath);
  const labelPath = join(ROOT, CF_V2_SPENT_GRID_EXPECTED_INPUTS.settlementLabelsRelativePath);

  if (!existsSync(featurePath) || !existsSync(labelPath)) {
    console.error(
      "Retained inputs missing. Expected:\n"
        + `  ${featurePath}\n`
        + `  ${labelPath}\n`
        + "Runner and fixture tests can still run; real-data P&L was not executed.",
    );
    process.exitCode = 2;
    return;
  }

  const featureSha = sha256File(featurePath);
  const labelSha = sha256File(labelPath);
  const hashesOk =
    featureSha === CF_V2_SPENT_GRID_EXPECTED_INPUTS.preentryFeaturesSha256
    && labelSha === CF_V2_SPENT_GRID_EXPECTED_INPUTS.settlementLabelsSha256;

  if (!hashesOk) {
    console.error("Input hash mismatch — refusing to compute P&L.");
    console.error("features", featureSha);
    console.error("labels", labelSha);
    process.exitCode = 3;
    return;
  }

  // Optional related hashes (informational)
  for (const [rel, expected] of [
    [
      CF_V2_SPENT_GRID_EXPECTED_INPUTS.bookFeaturesRelativePath,
      CF_V2_SPENT_GRID_EXPECTED_INPUTS.bookFeaturesSha256,
    ],
    [
      CF_V2_SPENT_GRID_EXPECTED_INPUTS.samplesRelativePath,
      CF_V2_SPENT_GRID_EXPECTED_INPUTS.samplesSha256,
    ],
  ] as const) {
    const p = join(ROOT, rel);
    if (existsSync(p)) {
      const actual = sha256File(p);
      if (actual !== expected) {
        console.warn(`related hash drift ${rel}: ${actual}`);
      }
    }
  }

  const codeAuthoritySha = execSync("git rev-parse HEAD", {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();

  const features = loadJsonl<PreentryFeatureRow>(featurePath);
  const labels = loadJsonl<SettlementLabelRow>(labelPath);

  const sealedPresent = existsSync(
    join(ROOT, "data/research-results/calibration-fade-v2"),
  );

  // Freeze manifest path before outcome economics are written.
  mkdirSync(OUT_DIR, { recursive: true });
  const frozenManifestPath = join(OUT_DIR, "frozen-study-manifest.json");
  const generatedAtUtc = new Date().toISOString();

  const result = runCalibrationFadeV2SpentGridHtsStudy({
    generatedAtUtc,
    codeAuthoritySha,
    inputHashesVerified: true,
    features,
    labels,
    sealedCalibrationFadeArtifactsPresent: sealedPresent,
  });

  writeFileSync(
    frozenManifestPath,
    `${JSON.stringify(result.report.manifest, null, 2)}\n`,
    "utf8",
  );

  writeFileSync(
    join(OUT_DIR, "per-market-trades.jsonl"),
    `${result.evaluableTrades.map((t) => JSON.stringify(t)).join("\n")}\n`,
    "utf8",
  );
  writeFileSync(
    join(OUT_DIR, "selected-entries.jsonl"),
    `${result.selectedEntries.map((t) => JSON.stringify(t)).join("\n")}\n`,
    "utf8",
  );
  writeFileSync(
    join(OUT_DIR, "report.json"),
    `${JSON.stringify(result.report, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(OUT_DIR, "report.md"),
    serializeCfV2SpentGridHtsMarkdown(result.report),
    "utf8",
  );

  if (result.classBSensitivity) {
    writeFileSync(
      join(OUT_DIR, "class-b-sensitivity.json"),
      `${JSON.stringify(result.classBSensitivity, null, 2)}\n`,
      "utf8",
    );
  }

  const outputHashes = {
    "frozen-study-manifest.json": sha256File(frozenManifestPath),
    "report.json": sha256File(join(OUT_DIR, "report.json")),
    "report.md": sha256File(join(OUT_DIR, "report.md")),
    "per-market-trades.jsonl": sha256File(join(OUT_DIR, "per-market-trades.jsonl")),
    "selected-entries.jsonl": sha256File(join(OUT_DIR, "selected-entries.jsonl")),
  };
  writeFileSync(
    join(OUT_DIR, "reproduction.json"),
    `${JSON.stringify({
      command: "npm run research:calibration-fade-v2-spent-grid-hts-exploratory",
      inputHashes: {
        preentryFeatures: featureSha,
        settlementLabels: labelSha,
      },
      outputHashes,
      codeAuthoritySha,
      generatedAtUtc,
      classBSensitivity: result.classBSensitivity,
    }, null, 2)}\n`,
    "utf8",
  );

  const e = result.report.economics;
  console.log(
    `N=${e.n} G=${e.g} meanNet=${e.meanNetPnlCents.toFixed(4)}¢ `
      + `CI=[${e.inference?.ci95LowerCents.toFixed(4)}, ${e.inference?.ci95UpperCents.toFixed(4)}] `
      + `status=${result.report.interpretation.status}`,
  );
  console.log(`wrote ${OUT_DIR}`);
}

main();
