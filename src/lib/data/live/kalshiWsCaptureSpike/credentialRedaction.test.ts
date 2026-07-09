import { describe, expect, it } from "vitest";

import { assertArtifactContainsNoSecrets, redactCaptureArtifactText } from "./credentialRedaction";
import { serializeCaptureHealthReport } from "./buildCaptureHealthReport";
import type { KalshiWsCaptureHealthReport } from "./kalshiWsCaptureSpikeTypes";

const report: KalshiWsCaptureHealthReport = {
  runId: "run",
  generatedAt: "2026-07-08T12:00:00.000Z",
  disclaimer: "safe",
  config: {
    series: "KXBTC15M",
    durationSeconds: 5,
    maxMarkets: 1,
    dryRun: false,
  },
  connection: {
    liveConnectionAttempted: true,
    connected: false,
    credentialStatus: "available",
    privateKeySource: "path",
    privateKeyLoaded: true,
    privateKeyFingerprint: "abc123",
    keyIdPresent: true,
    authHeadersGenerated: true,
    wsUrl: "wss://example.test/ws",
  },
  marketDiscovery: {
    attempted: true,
    succeeded: true,
    discoveredMarketCount: 1,
    selectedMarketTickers: ["KXBTC15M-TEST"],
  },
  capture: {
    messagesReceived: 0,
    rawMessagesPath: "raw.jsonl",
    topOfBookPath: "top.jsonl",
    btcSpotPath: null,
  },
  orderbook: {
    snapshotsReceived: 0,
    deltasReceived: 0,
    validTopOfBookRecords: 0,
    sequenceGapCount: 0,
    outOfOrderCount: 0,
    marketsWithValidBook: 0,
  },
  btcSpot: {
    status: "disabled",
    recordsCaptured: 0,
  },
  verdict: "blocked-ws-auth",
  recommendedNextAction: "fix-ws-auth",
  warnings: [],
  errors: [],
};

describe("credentialRedaction", () => {
  it("redacts PEM and signature values from artifacts", () => {
    const dirty = `${serializeCaptureHealthReport(report)}\n-----BEGIN RSA PRIVATE KEY-----\nsecret\n-----END RSA PRIVATE KEY-----\nKALSHI-ACCESS-SIGNATURE: abc123sig`;
    const redacted = redactCaptureArtifactText(dirty);
    expect(() => assertArtifactContainsNoSecrets(redacted)).not.toThrow();
    expect(redacted).not.toContain("BEGIN RSA PRIVATE KEY");
    expect(redacted).not.toContain("abc123sig");
  });
});
