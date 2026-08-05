import { existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CALIBRATION_FADE_PROVENANCE_MANIFEST_SCHEMA,
  CALIBRATION_FADE_PROVENANCE_MANIFEST_VERSION,
  deriveProvenanceManifestPath,
  loadFrozenHypothesisSpec,
  createMemoryCalibrationFadeForwardValidationIo,
} from "@/lib/data/research/calibrationFadeForwardValidation";

import { runCalibrationFadeForwardValidationCommand } from "./buildCalibrationFadeForwardValidation";

const HYPOTHESIS_ID =
  "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over";
const BASE_MS = Date.parse("2026-07-11T12:00:00.000Z");

function isoAt(offsetMs: number): string {
  return new Date(BASE_MS + offsetMs).toISOString();
}

describe("buildCalibrationFadeForwardValidation CLI acceptance", () => {
  it("classifies insufficient-forward-events for 4 markets with valid manifest and no settlements", async () => {
    const root = mkdtempSync(join(tmpdir(), "calibration-fade-cli-"));
    const runDir = join(root, "capture-run");
    const importsDir = join(root, "imports");
    const outputDir = join(root, "out");
    const configPath = join(root, "hypothesis.json");
    const provenancePath = deriveProvenanceManifestPath(configPath);
    mkdirSync(join(root, "provenance"), { recursive: true });
    mkdirSync(runDir, { recursive: true });
    mkdirSync(importsDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });

    const freeze = {
      hypothesisId: HYPOTHESIS_ID,
      hypothesisVersion: "v1",
      description: "cli acceptance freeze",
      canonicalSourceArtifacts: [
        join(root, "missing-hypothesis-candidates.json"),
      ],
      sourceCandidateId: HYPOTHESIS_ID,
      axisGroupId: "volatilityProbabilityTime",
      bucketId: "vol-high-coarse-prob-1-coarse-time-early",
      calibrationDirection: "over",
      targetOutcomeSide: "no",
      suggestedStrategyFamily: "calibration-no-fade",
      eligibilityRules: {
        volatility: { bucketId: "vol-high", minInclusive: 0.6, maxExclusive: null },
        probability: { bucketId: "coarse-prob-1", minInclusive: 1 / 3, maxExclusive: 2 / 3 },
        timeRemainingMs: { bucketId: "coarse-time-early", minInclusive: 0, maxExclusive: 900000 },
      },
      probabilityMeasure: { id: "yes-bid-ask-midpoint", definition: "mid", formula: "mid" },
      volatilityDefinition: {
        sourceInstrument: "BTC",
        returnIntervalMs: 60000,
        lookbackBars: 10,
        method: "realized-log-return-annualized",
        causalOnly: true,
        maximumSourceGapMs: 5000,
      },
      marketEligibilityRules: {
        requireValidBook: true,
        requireSynchronizedBook: true,
        requireOpenMarket: true,
        requireBtcJoin: true,
      },
      deduplicationPolicy: {
        episodeBreakOnDisqualification: true,
        entryRule: "first-crossing-into-eligibility",
        primaryValidationUnit: "one-first-entry-per-market",
        suppressRepeatedQualifyingSnapshots: true,
      },
      entryPriceMeasures: {
        calibrationLayer: "yes-bid-ask-midpoint",
        executableLayer: "no-ask-cross-spread",
        diagnosticLayer: "yes-bid-ask-midpoint",
      },
      settlementMapping: {},
      minimumEvidenceRequirements: {
        minimumIndependentCandidateMarkets: 5,
        minimumSettlementCoverageShare: 0.8,
        minimumValidBookShare: 0.9,
        minimumBtcJoinCoverageShare: 0.9,
        materialRejectionCalibrationGap: 0.05,
        materialSupportCalibrationGap: 0.03,
        materialExecutableNetReturnCents: 1,
      },
      classificationRules: {
        precedence: [
          "hypothesis-provenance-unavailable",
          "forward-feature-incompatible",
          "insufficient-forward-events",
          "settlement-coverage-incomplete",
        ],
      },
    };
    writeFileSync(configPath, JSON.stringify(freeze, null, 2));

    const hash = loadFrozenHypothesisSpec({
      io: createMemoryCalibrationFadeForwardValidationIo({
        [configPath]: JSON.stringify(freeze),
        [provenancePath]: JSON.stringify({
          schema: CALIBRATION_FADE_PROVENANCE_MANIFEST_SCHEMA,
          version: CALIBRATION_FADE_PROVENANCE_MANIFEST_VERSION,
          hypothesisId: HYPOTHESIS_ID,
          sourceCandidateId: HYPOTHESIS_ID,
          configPath,
          originalFreezeCommitSha: "f2598cf960472f368cd6ad25f67d4c97a3b3956e",
          originalFreezeCommitTimestamp: "2026-07-12T01:54:04-07:00",
          originalConfigHash: "76336405",
          resolvedConfigHash: "00000000",
          firstForwardEvaluationBoundary: "before first forward capture",
          conclusion: "defensible-with-manifest",
          ruleFreezeEvidence: { kind: "repository-history" },
          historicalBenchmarkAvailability: "unavailable",
          missingArtifacts: [join(root, "missing-hypothesis-candidates.json")],
          limitations: ["Discovery artifacts absent."],
          integrityCorrections: [],
        }),
      }),
      hypothesisConfigPath: configPath,
    }).spec.configurationHash;

    mkdirSync(join(root, "provenance"), { recursive: true });
    // deriveProvenanceManifestPath for absolute path: dirname/provenance/filename
    writeFileSync(
      provenancePath,
      JSON.stringify({
        schema: CALIBRATION_FADE_PROVENANCE_MANIFEST_SCHEMA,
        version: CALIBRATION_FADE_PROVENANCE_MANIFEST_VERSION,
        hypothesisId: HYPOTHESIS_ID,
        sourceCandidateId: HYPOTHESIS_ID,
        configPath,
        originalFreezeCommitSha: "f2598cf960472f368cd6ad25f67d4c97a3b3956e",
        originalFreezeCommitTimestamp: "2026-07-12T01:54:04-07:00",
        originalConfigHash: "76336405",
        resolvedConfigHash: hash,
        firstForwardEvaluationBoundary: "before first forward capture",
        conclusion: "defensible-with-manifest",
        ruleFreezeEvidence: { kind: "repository-history" },
        historicalBenchmarkAvailability: "unavailable",
        missingArtifacts: [join(root, "missing-hypothesis-candidates.json")],
        limitations: ["Discovery artifacts absent."],
        integrityCorrections: [],
      }),
    );

    const markets = ["MKT-0", "MKT-1", "MKT-2", "MKT-3"];
    writeFileSync(
      join(runDir, "btc-spot.jsonl"),
      Array.from({ length: 16 * 60 }, (_, index) => {
        const offsetMs = index * 1_000;
        const minute = Math.floor(offsetMs / 60_000);
        const priceUsd = 100_000 + (minute % 2 === 0 ? 1 : -1) * (2_000 + minute * 150);
        return JSON.stringify({
          receivedAtLocal: isoAt(offsetMs),
          exchangeTimestampMs: BASE_MS + offsetMs,
          priceUsd,
        });
      }).join("\n"),
    );
    writeFileSync(
      join(runDir, "market-metadata.jsonl"),
      markets
        .map((marketTicker) => JSON.stringify({ marketTicker, closeTime: isoAt(1_200_000) }))
        .join("\n"),
    );
    writeFileSync(
      join(runDir, "top-of-book.jsonl"),
      markets
        .map((marketTicker) =>
          JSON.stringify({
            marketTicker,
            seriesTicker: "KXBTC15M",
            receivedAtLocal: isoAt(720_000),
            exchangeTimestampMs: BASE_MS + 720_000,
            bookState: "valid",
            yesBestBidCents: 48,
            yesBestAskCents: 52,
            noBestBidCents: 46,
            noBestAskCents: 50,
          }),
        )
        .join("\n"),
    );
    writeFileSync(
      join(runDir, "capture-health.json"),
      JSON.stringify({
        runId: "capture-run",
        config: { durationSeconds: 3600 },
        connection: {
          captureEndReason: "duration-complete",
          terminalFailureReason: null,
          completedNormally: true,
        },
        orderbook: { validTopOfBookRecords: 4, reconnectCount: 0, sequenceGapCount: 0 },
      }),
    );
    const topPath = join(runDir, "top-of-book.jsonl");
    const btcPath = join(runDir, "btc-spot.jsonl");
    const topStat = statSync(topPath);
    const btcStat = statSync(btcPath);
    writeFileSync(
      join(runDir, "capture-health-audit.json"),
      JSON.stringify({
        selectedRunId: "capture-run",
        captureRunDir: runDir,
        sourceRunIds: ["capture-run"],
        analysisVersion: "capture-health-audit-v1",
        inputArtifactIdentities: [
          {
            path: topPath,
            role: "top-of-book",
            sizeBytes: topStat.size,
            mtimeMs: topStat.mtimeMs,
            recordCount: 4,
          },
          {
            path: btcPath,
            role: "btc-spot",
            sizeBytes: btcStat.size,
            mtimeMs: btcStat.mtimeMs,
            recordCount: 16 * 60,
          },
        ],
        summary: {
          verdict: "capture-research-ready",
          recommendedNextAction: "proceed-offline-microstructure-research",
          runDurationSeconds: 3600,
          topOfBookCount: 4,
          btcSpotCount: 16 * 60,
          bookState: { validBookShare: 0.99, reconnectCount: 0, sequenceGapCount: 0 },
          btcJoin: { joinCoverageShare: 1 },
          continuity: { p90TopOfBookGapMs: 1000 },
        },
      }),
    );

    const outputPath = join(outputDir, "calibration-fade-forward-validation.json");
    const htmlOutputPath = join(outputDir, "calibration-fade-forward-validation.html");
    const eventsOutputPath = join(outputDir, "events.jsonl");
    const marketsOutputPath = join(outputDir, "markets.jsonl");

    let stdout = "";
    let stderr = "";
    const exitCode = await runCalibrationFadeForwardValidationCommand(
      [
        "--capture-run-dir",
        runDir,
        "--hypothesis-config",
        configPath,
        "--imports-dir",
        importsDir,
        "--output",
        outputPath,
        "--html-output",
        htmlOutputPath,
        "--events-output",
        eventsOutputPath,
        "--markets-output",
        marketsOutputPath,
      ],
      {
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: (text) => {
          stderr += text;
        },
        writeFile: (path, data) => writeFileSync(path, data, "utf8"),
        mkdirSync: (path, options) => mkdirSync(path, options),
        fileExists: (path) => existsSync(path),
        unlinkFile: (path) => unlinkSync(path),
        renameFile: (from, to) => renameSync(from, to),
      },
      { generatedAt: "2026-07-12T08:00:00.000Z" },
    );

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const report = JSON.parse(readFileSync(outputPath, "utf8")) as {
      candidateMarketCount: number;
      summary: { interpretationClassification: string };
      provenance: { provenanceAvailable: boolean };
    };
    expect(report.candidateMarketCount).toBe(4);
    expect(report.provenance.provenanceAvailable).toBe(true);
    expect(report.summary.interpretationClassification).toBe("insufficient-forward-events");
    expect(stdout).toContain("insufficient-forward-events");
    expect(readFileSync(htmlOutputPath, "utf8")).toContain("Provenance");
    expect(readFileSync(eventsOutputPath, "utf8").length).toBeGreaterThan(0);
    expect(readFileSync(marketsOutputPath, "utf8").split("\n").filter(Boolean)).toHaveLength(4);
  });
});
