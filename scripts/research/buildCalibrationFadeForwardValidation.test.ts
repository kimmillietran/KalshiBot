import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_CLAIM,
  CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_VERIFICATION_BASIS,
  CALIBRATION_FADE_PROVENANCE_MANIFEST_SCHEMA,
  CALIBRATION_FADE_PROVENANCE_MANIFEST_VERSION,
  CALIBRATION_FADE_PROVENANCE_VERIFICATION_MODEL,
  CANONICAL_CALIBRATION_FADE_CLASSIFICATION_PRECEDENCE,
  deriveProvenanceManifestPath,
  loadFrozenHypothesisSpec,
  createMemoryCalibrationFadeForwardValidationIo,
} from "@/lib/data/research/calibrationFadeForwardValidation";

import { runCalibrationFadeForwardValidationCommand } from "./buildCalibrationFadeForwardValidation";

const HYPOTHESIS_ID =
  "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over";
const BASE_MS = Date.parse("2026-07-11T12:00:00.000Z");
const ORIGINAL_FREEZE_COMMIT_SHA = "f2598cf960472f368cd6ad25f67d4c97a3b3956e";
const MARKETS = ["MKT-0", "MKT-1", "MKT-2", "MKT-3"];
const BTC_SAMPLE_COUNT = 16 * 60;

function isoAt(offsetMs: number): string {
  return new Date(BASE_MS + offsetMs).toISOString();
}

function freezeDocument(missingArtifact: string): Record<string, unknown> {
  return {
    hypothesisId: HYPOTHESIS_ID,
    hypothesisVersion: "v1",
    description: "cli acceptance freeze",
    canonicalSourceArtifacts: [missingArtifact],
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
    classificationRules: { precedence: [...CANONICAL_CALIBRATION_FADE_CLASSIFICATION_PRECEDENCE] },
  };
}

/**
 * Complete reviewed manifest for the CLI fixture. The fixture freeze carries no
 * integrity divergence, so both config hashes match and no correction is due.
 */
function provenanceManifest(input: {
  configPath: string;
  configurationHash: string;
  missingArtifact: string;
}): string {
  return JSON.stringify({
    schema: CALIBRATION_FADE_PROVENANCE_MANIFEST_SCHEMA,
    version: CALIBRATION_FADE_PROVENANCE_MANIFEST_VERSION,
    verificationModel: CALIBRATION_FADE_PROVENANCE_VERIFICATION_MODEL,
    hypothesisId: HYPOTHESIS_ID,
    sourceCandidateId: HYPOTHESIS_ID,
    configPath: input.configPath,
    originalFreezeCommitSha: ORIGINAL_FREEZE_COMMIT_SHA,
    originalFreezeCommitTimestamp: "2026-07-12T01:54:04-07:00",
    originalConfigHash: input.configurationHash,
    resolvedConfigHash: input.configurationHash,
    firstForwardEvaluationBoundary: {
      claim: CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_CLAIM,
      verificationBasis: CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_VERIFICATION_BASIS,
      runtimeVerified: false,
    },
    conclusion: "defensible-with-manifest",
    ruleFreezeEvidence: {
      kind: "repository-history",
      description:
        `Frozen config was introduced in commit ${ORIGINAL_FREEZE_COMMIT_SHA} before the first forward capture `
        + "epoch. Git is not executed at evaluation time; this reviewed manifest records freeze identity.",
      runtimeGitExecuted: false,
      originalProbabilityBounds: { minInclusive: 0.3, maxExclusive: 0.7 },
      resolvedProbabilityBounds: {
        minInclusive: 1 / 3,
        maxExclusive: 2 / 3,
        bucketId: "coarse-prob-1",
      },
    },
    historicalBenchmarkAvailability: "unavailable",
    missingArtifacts: [input.missingArtifact],
    limitations: ["Discovery artifacts absent."],
    integrityCorrections: [],
  });
}

function writeCaptureRun(runDir: string): void {
  writeFileSync(
    join(runDir, "btc-spot.jsonl"),
    Array.from({ length: BTC_SAMPLE_COUNT }, (_, index) => {
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
    MARKETS.map((marketTicker) => JSON.stringify({ marketTicker, closeTime: isoAt(1_200_000) })).join("\n"),
  );
  writeFileSync(
    join(runDir, "top-of-book.jsonl"),
    MARKETS.map((marketTicker) =>
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
    ).join("\n"),
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
      orderbook: { validTopOfBookRecords: MARKETS.length, reconnectCount: 0, sequenceGapCount: 0 },
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
          recordCount: MARKETS.length,
        },
        {
          path: btcPath,
          role: "btc-spot",
          sizeBytes: btcStat.size,
          mtimeMs: btcStat.mtimeMs,
          recordCount: BTC_SAMPLE_COUNT,
        },
      ],
      summary: {
        verdict: "capture-research-ready",
        recommendedNextAction: "proceed-offline-microstructure-research",
        runDurationSeconds: 3600,
        topOfBookCount: MARKETS.length,
        btcSpotCount: BTC_SAMPLE_COUNT,
        bookState: { validBookShare: 0.99, reconnectCount: 0, sequenceGapCount: 0 },
        btcJoin: { joinCoverageShare: 1 },
        continuity: { p90TopOfBookGapMs: 1000 },
      },
    }),
  );
}

async function runAcceptance(root: string): Promise<void> {
  const runDir = join(root, "capture-run");
  const importsDir = join(root, "imports");
  const outputDir = join(root, "out");
  const configPath = join(root, "hypothesis.json");
  const provenancePath = deriveProvenanceManifestPath(configPath);
  const missingArtifact = join(root, "missing-hypothesis-candidates.json");
  mkdirSync(join(root, "provenance"), { recursive: true });
  mkdirSync(runDir, { recursive: true });
  mkdirSync(importsDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  const freeze = freezeDocument(missingArtifact);
  writeFileSync(configPath, JSON.stringify(freeze, null, 2));

  // The freeze document alone determines the configuration hash, so it is read
  // back without a manifest before the manifest that certifies it is written.
  const configurationHash = loadFrozenHypothesisSpec({
    io: createMemoryCalibrationFadeForwardValidationIo({ [configPath]: JSON.stringify(freeze) }),
    hypothesisConfigPath: configPath,
  }).spec.configurationHash;

  writeFileSync(provenancePath, provenanceManifest({ configPath, configurationHash, missingArtifact }));
  writeCaptureRun(runDir);

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
    hypothesisConfigurationHash: string;
    summary: { interpretationClassification: string };
    provenance: {
      provenanceAvailable: boolean;
      verificationModel: string | null;
      resolvedConfigHash: string | null;
    };
  };
  expect(report.candidateMarketCount).toBe(4);
  expect(report.provenance.provenanceAvailable).toBe(true);
  expect(report.provenance.verificationModel).toBe(CALIBRATION_FADE_PROVENANCE_VERIFICATION_MODEL);
  expect(report.provenance.resolvedConfigHash).toBe(configurationHash);
  expect(report.hypothesisConfigurationHash).toBe(configurationHash);
  expect(report.summary.interpretationClassification).toBe("insufficient-forward-events");
  expect(stdout).toContain("insufficient-forward-events");
  expect(readFileSync(htmlOutputPath, "utf8")).toContain("Provenance");
  expect(readFileSync(eventsOutputPath, "utf8").length).toBeGreaterThan(0);
  expect(readFileSync(marketsOutputPath, "utf8").split("\n").filter(Boolean)).toHaveLength(4);
}

describe("buildCalibrationFadeForwardValidation CLI acceptance", () => {
  it("classifies insufficient-forward-events for 4 markets with valid manifest and no settlements", async () => {
    const root = mkdtempSync(join(tmpdir(), "calibration-fade-cli-"));
    try {
      await runAcceptance(root);
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    }
  });
});
