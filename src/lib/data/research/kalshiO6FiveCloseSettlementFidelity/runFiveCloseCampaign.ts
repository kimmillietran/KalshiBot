/**
 * Orchestrate the O6 five-close settlement-fidelity campaign.
 * Restart-safe: frozen targets never substitute; completed slots are not re-run.
 */

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  classifyMissedSlot,
} from "@/lib/data/research/kalshiOneCloseSettlementFidelity/freezeOneClose";
import {
  executeLiveOneClose,
  type LiveOneCloseDeps,
  type LiveOneCloseResult,
} from "@/lib/data/research/kalshiOneCloseSettlementFidelity/executeLiveOneClose";
import {
  assertRetentionReady,
  createFilesystemRetentionIo,
  verifyRetentionReadiness,
  type RetentionIo,
} from "@/lib/data/research/kalshiOneCloseSettlementFidelity/retentionReadiness";
import {
  OneCloseFidelityError,
  type CaptureStatus,
  type OfficialStatus,
  type RetentionStatus,
} from "@/lib/data/research/kalshiOneCloseSettlementFidelity/types";
import { campaignLedgerPath } from "@/lib/data/research/kalshiBrtiAccessProbe/campaignBudget";

import {
  DEFAULT_O6_FIVE_CLOSE_OUT_DIR,
  O6_FIVE_CLOSE_CAMPAIGN_ID,
  O6_HTTP_CAMPAIGN_CEILING,
  O6_HTTP_PER_CLOSE,
  assertManifestImmutableTargets,
  freezeFiveCloseCampaign,
  markSlotTerminal,
  nextPendingSlot,
  type FiveCloseCampaignManifest,
  type FiveCloseTargetStatus,
} from "./freezeFiveClose";

export type O6FiveCloseArgv = {
  authorizeLive: boolean;
  freezeOnly: boolean;
  outDir: string;
};

export type FiveCloseIo = {
  writeFile: (path: string, contents: string) => void;
  readFile: (path: string) => string | null;
  mkdir: (path: string) => void;
  exists: (path: string) => boolean;
  nowMs: () => number;
  sleep: (ms: number) => Promise<void>;
  codeSha: () => string | null;
};

export function createFilesystemFiveCloseIo(repoRoot: string): FiveCloseIo {
  return {
    writeFile: (path, contents) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents);
    },
    readFile: (path) => (existsSync(path) ? readFileSync(path, "utf8") : null),
    mkdir: (path) => mkdirSync(path, { recursive: true }),
    exists: existsSync,
    nowMs: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
    codeSha: () => {
      try {
        return execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
      } catch {
        return null;
      }
    },
  };
}

export function parseO6FiveCloseArgv(argv: string[]): O6FiveCloseArgv {
  const read = (flag: string): string | null => {
    const idx = argv.indexOf(flag);
    if (idx < 0) return null;
    return argv[idx + 1] ?? null;
  };
  return {
    authorizeLive: argv.includes("--authorize-live"),
    freezeOnly: argv.includes("--freeze-only"),
    outDir: read("--out-dir") ?? DEFAULT_O6_FIVE_CLOSE_OUT_DIR,
  };
}

export type O6FiveCloseRunResult = {
  campaignId: typeof O6_FIVE_CLOSE_CAMPAIGN_ID;
  manifest: FiveCloseCampaignManifest;
  retentionReady: boolean;
  liveExecution: "refused" | "freeze-only" | "executed";
  slotReports: Array<{
    slotIndex: number;
    closeUtc: string;
    status: FiveCloseTargetStatus;
    live: LiveOneCloseResult | null;
  }>;
};

function mapCaptureToTargetStatus(capture: CaptureStatus): FiveCloseTargetStatus {
  if (capture === "ok") return "captured";
  if (capture === "missed-slot") return "missed-slot";
  if (capture === "bind-failed") return "bind-failed";
  if (capture === "connect-failed") return "connect-failed";
  if (capture === "limit-stop") return "limit-stop";
  if (capture === "refused-readiness") return "refused-readiness";
  if (capture === "not-attempted") return "failed";
  return "failed";
}

type SlotLiveResultArtifact = {
  slotIndex: number;
  closeUtc: string;
  capture: CaptureStatus;
  official: OfficialStatus;
  retention: RetentionStatus;
  httpConsumed: number;
  reason: string | null;
  completedAtUtc: string;
};

function writeJson(io: FiveCloseIo, path: string, value: unknown): void {
  io.writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson<T>(io: FiveCloseIo, path: string): T | null {
  const raw = io.readFile(path);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function slotLiveResultPath(outAbs: string, slotOutDirRel: string): string {
  return join(outAbs, slotOutDirRel, "slot-live-result.json");
}

function persistentSlotRawDir(
  primaryRoot: string,
  slotIndex: number,
  closeUtc: string,
): string {
  return join(
    primaryRoot,
    O6_FIVE_CLOSE_CAMPAIGN_ID,
    `slot-${slotIndex}-${closeUtc.replace(/[:.]/g, "-")}`,
    "raw",
  );
}

function loadOrFreezeManifest(input: {
  io: FiveCloseIo;
  outAbs: string;
}): FiveCloseCampaignManifest {
  const manifestPath = join(input.outAbs, "five-close-campaign-manifest.json");
  const existingRaw = input.io.readFile(manifestPath);
  if (existingRaw) {
    return JSON.parse(existingRaw) as FiveCloseCampaignManifest;
  }
  const nowMs = input.io.nowMs();
  const manifest = freezeFiveCloseCampaign({
    nowMs,
    codeSha: input.io.codeSha(),
    frozenAtUtc: new Date(nowMs).toISOString(),
  });
  writeJson(input.io, manifestPath, manifest);
  // Also persist immutable plan copy
  writeJson(input.io, join(input.outAbs, "five-close-frozen-schedule.json"), {
    campaignId: manifest.campaignId,
    frozenAtUtc: manifest.frozenAtUtc,
    codeSha: manifest.codeSha,
    closes: manifest.targets.map((t) => ({
      slotIndex: t.slotIndex,
      closeUtc: t.closeUtc,
      closeLocalPdt: t.closeLocalPdt,
      connectEarliestUtc: t.connectEarliestUtc,
      captureStopUtc: t.captureStopUtc,
      readinessCutoffUtc: t.readinessCutoffUtc,
    })),
    substitutionForbidden: true,
  });
  return manifest;
}

export async function runO6FiveCloseCampaign(input: {
  repoRoot: string;
  argv: O6FiveCloseArgv;
  io?: FiveCloseIo;
  retentionIo?: RetentionIo;
  liveDeps?: LiveOneCloseDeps;
}): Promise<O6FiveCloseRunResult> {
  const io = input.io ?? createFilesystemFiveCloseIo(input.repoRoot);
  const retentionIo = input.retentionIo ?? createFilesystemRetentionIo();
  const outAbs = join(input.repoRoot, input.argv.outDir);
  io.mkdir(outAbs);

  let manifest = loadOrFreezeManifest({ io, outAbs });
  const manifestPath = join(outAbs, "five-close-campaign-manifest.json");

  // Guard against accidental regenerations with different closes
  const regen = freezeFiveCloseCampaign({
    nowMs: io.nowMs(),
    codeSha: manifest.codeSha,
    firstCloseMs: manifest.targets[0]!.closeMs,
    frozenAtUtc: manifest.frozenAtUtc,
  });
  assertManifestImmutableTargets(manifest, regen);

  const retention = verifyRetentionReadiness({
    io: retentionIo,
    mode: "local-persistent-only",
    nowIso: new Date(io.nowMs()).toISOString(),
    campaignId: O6_FIVE_CLOSE_CAMPAIGN_ID,
  });
  writeJson(io, join(outAbs, "retention-readiness.json"), retention);

  if (!input.argv.authorizeLive || input.argv.freezeOnly) {
    return {
      campaignId: O6_FIVE_CLOSE_CAMPAIGN_ID,
      manifest,
      retentionReady: retention.ready,
      liveExecution: input.argv.freezeOnly ? "freeze-only" : "refused",
      slotReports: [],
    };
  }
  if (!retention.ready) {
    throw new OneCloseFidelityError(
      `retention-not-ready: ${retention.blocker ?? "unknown"}`,
    );
  }
  assertRetentionReady(retention);

  const slotReports: O6FiveCloseRunResult["slotReports"] = [];

  // Process slots in order until all terminal
  for (;;) {
    const slot = nextPendingSlot(manifest);
    if (!slot) break;

    const nowMs = io.nowMs();
    const slotOutAbs = join(outAbs, slot.slotOutDirRel);
    const liveResultPath = slotLiveResultPath(outAbs, slot.slotOutDirRel);

    // Resume: durable live result written before manifest terminalization.
    if (slot.status === "in-progress") {
      const recovered = readJson<SlotLiveResultArtifact>(io, liveResultPath);
      if (recovered != null && recovered.slotIndex === slot.slotIndex) {
        const status = mapCaptureToTargetStatus(recovered.capture);
        manifest = markSlotTerminal(manifest, slot.slotIndex, {
          status,
          capture: recovered.capture,
          official: recovered.official,
          retention: recovered.retention,
          httpConsumed: recovered.httpConsumed,
          reason: recovered.reason ?? "recovered-from-slot-live-result",
          completedAtUtc: recovered.completedAtUtc,
        });
        writeJson(io, manifestPath, manifest);
        writeJson(io, join(slotOutAbs, "slot-disposition.json"), {
          slotIndex: slot.slotIndex,
          status,
          capture: recovered.capture,
          official: recovered.official,
          retention: recovered.retention,
          reason: recovered.reason ?? "recovered-from-slot-live-result",
          recovered: true,
        });
        slotReports.push({
          slotIndex: slot.slotIndex,
          closeUtc: slot.closeUtc,
          status,
          live: null,
        });
        continue;
      }

      const partialRaw = retention.primaryRoot
        ? join(
          persistentSlotRawDir(
            retention.primaryRoot,
            slot.slotIndex,
            slot.closeUtc,
          ),
          "synchronized-capture.jsonl",
        )
        : null;
      if (partialRaw != null && io.exists(partialRaw)) {
        // Do not re-append into a partial capture; treat as failed, no substitute.
        const reason = "abandoned-in-progress-partial-raw; substitution-forbidden";
        const ledgerRaw = io.readFile(campaignLedgerPath(slotOutAbs));
        let httpConsumed = 0;
        if (ledgerRaw != null) {
          try {
            const parsed = JSON.parse(ledgerRaw) as { consumed?: unknown };
            if (typeof parsed.consumed === "number" && Number.isFinite(parsed.consumed)) {
              httpConsumed = Math.max(0, Math.floor(parsed.consumed));
            }
          } catch {
            httpConsumed = 0;
          }
        }
        manifest = markSlotTerminal(manifest, slot.slotIndex, {
          status: "failed",
          capture: "connect-failed",
          official: "not-attempted",
          retention: "not-attempted",
          httpConsumed,
          reason,
          completedAtUtc: new Date(nowMs).toISOString(),
        });
        writeJson(io, manifestPath, manifest);
        writeJson(io, join(slotOutAbs, "slot-disposition.json"), {
          slotIndex: slot.slotIndex,
          status: "failed",
          reason,
        });
        slotReports.push({
          slotIndex: slot.slotIndex,
          closeUtc: slot.closeUtc,
          status: "failed",
          live: null,
        });
        continue;
      }
    }

    const campaignHttp = manifest.campaignHttpConsumed;
    if (campaignHttp >= O6_HTTP_CAMPAIGN_CEILING) {
      manifest = markSlotTerminal(manifest, slot.slotIndex, {
        status: "limit-stop",
        capture: "limit-stop",
        official: "not-attempted",
        retention: "not-attempted",
        httpConsumed: 0,
        reason: `campaign-http-exhausted:${campaignHttp}/${O6_HTTP_CAMPAIGN_CEILING}`,
        completedAtUtc: new Date(nowMs).toISOString(),
      });
      writeJson(io, manifestPath, manifest);
      slotReports.push({
        slotIndex: slot.slotIndex,
        closeUtc: slot.closeUtc,
        status: "limit-stop",
        live: null,
      });
      continue;
    }

    const miss = classifyMissedSlot(slot.plan, nowMs);
    if (miss === "missed-slot" || nowMs > slot.plan.readinessCutoffMs) {
      const reason = miss === "missed-slot"
        ? (slot.status === "in-progress"
          ? "abandoned-in-progress-after-close; substitution-forbidden"
          : "missed-slot-after-close; substitution-forbidden")
        : (slot.status === "in-progress"
          ? "abandoned-in-progress-past-readiness; substitution-forbidden"
          : "skipped-past-readiness-cutoff; substitution-forbidden");
      manifest = markSlotTerminal(manifest, slot.slotIndex, {
        status: "missed-slot",
        capture: "missed-slot",
        official: "not-attempted",
        retention: "not-attempted",
        httpConsumed: 0,
        reason,
        completedAtUtc: new Date(nowMs).toISOString(),
      });
      writeJson(io, manifestPath, manifest);
      writeJson(
        io,
        join(outAbs, slot.slotOutDirRel, "slot-disposition.json"),
        { slotIndex: slot.slotIndex, status: "missed-slot", reason },
      );
      slotReports.push({
        slotIndex: slot.slotIndex,
        closeUtc: slot.closeUtc,
        status: "missed-slot",
        live: null,
      });
      continue;
    }

    // Wait until near readiness / connect window (poll, do not busy-spin hard)
    while (io.nowMs() < slot.plan.readinessCutoffMs - 5_000) {
      await io.sleep(1_000);
    }

    // Mark in-progress before live work (restart-safe)
    manifest = {
      ...manifest,
      targets: manifest.targets.map((t) => (
        t.slotIndex === slot.slotIndex
          ? { ...t, status: "in-progress" as const, reason: "live-executing" }
          : t
      )),
      updatedAtUtc: new Date(io.nowMs()).toISOString(),
    };
    writeJson(io, manifestPath, manifest);

    io.mkdir(slotOutAbs);
    writeJson(io, join(slotOutAbs, "one-close-plan.json"), slot.plan);

    const persistentRawDir = persistentSlotRawDir(
      retention.primaryRoot!,
      slot.slotIndex,
      slot.closeUtc,
    );

    let live: LiveOneCloseResult | null = null;
    try {
      live = await executeLiveOneClose({
        plan: slot.plan,
        campaignDir: slotOutAbs,
        persistentRawDir,
        retention,
        httpLimit: O6_HTTP_PER_CLOSE,
        deps: input.liveDeps,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "slot-execute-failed";
      manifest = markSlotTerminal(manifest, slot.slotIndex, {
        status: "failed",
        capture: "connect-failed",
        official: "not-attempted",
        retention: "not-attempted",
        httpConsumed: 0,
        reason,
        completedAtUtc: new Date(io.nowMs()).toISOString(),
      });
      writeJson(io, manifestPath, manifest);
      writeJson(io, join(slotOutAbs, "slot-disposition.json"), {
        slotIndex: slot.slotIndex,
        status: "failed",
        reason,
      });
      slotReports.push({
        slotIndex: slot.slotIndex,
        closeUtc: slot.closeUtc,
        status: "failed",
        live: null,
      });
      continue;
    }

    const status = mapCaptureToTargetStatus(live.capture);
    const completedAtUtc = new Date(io.nowMs()).toISOString();
    // Durable before campaign-manifest terminal write so restart can recover
    // a finished live slot instead of mislabeling it missed-slot.
    const liveArtifact: SlotLiveResultArtifact = {
      slotIndex: slot.slotIndex,
      closeUtc: slot.closeUtc,
      capture: live.capture,
      official: live.official,
      retention: live.retention,
      httpConsumed: live.httpConsumed,
      reason: live.reason,
      completedAtUtc,
    };
    writeJson(io, liveResultPath, liveArtifact);

    manifest = markSlotTerminal(manifest, slot.slotIndex, {
      status,
      capture: live.capture,
      official: live.official,
      retention: live.retention,
      httpConsumed: live.httpConsumed,
      reason: live.reason,
      completedAtUtc,
    });
    writeJson(io, manifestPath, manifest);

    const slotReport = {
      slotIndex: slot.slotIndex,
      closeUtc: slot.closeUtc,
      market: live.market,
      capture: live.capture,
      official: live.official,
      retention: live.retention,
      reason: live.reason,
      httpConsumed: live.httpConsumed,
      httpLimit: live.httpLimit,
      streamObservationCounts: live.streamObservationCounts,
      membershipComparisons: live.membershipComparisons,
      officialExpirationRaw: live.officialExpirationRaw,
      rawCapturePath: live.rawCapturePath,
      rawCaptureSha256: live.rawCaptureSha256,
      officialBodyPath: live.officialBodyPath,
      officialBodySha256: live.officialBodySha256,
      replay: live.replay,
      captureDurationMs: live.captureResult
        ? (live.captureResult.actualStopMs ?? 0) - (live.captureResult.actualStartMs ?? 0)
        : null,
      connectionAttempts: live.captureResult?.connectionAttempts ?? null,
      messagesReceived: live.captureResult?.events.length ?? null,
      settlementEstimate: live.settlementEstimate,
    };
    writeJson(io, join(slotOutAbs, "slot-report.json"), slotReport);
    writeJson(io, join(slotOutAbs, "slot-disposition.json"), {
      slotIndex: slot.slotIndex,
      status,
      capture: live.capture,
      official: live.official,
      retention: live.retention,
      reason: live.reason,
    });
    if (live.rawCaptureSha256) {
      io.writeFile(join(slotOutAbs, "slot-report.sha256"), `${sha256FileSafe(join(slotOutAbs, "slot-report.json"))}\n`);
    }

    slotReports.push({
      slotIndex: slot.slotIndex,
      closeUtc: slot.closeUtc,
      status,
      live,
    });
  }

  writeFinalCampaignReport({ io, outAbs, manifest, retentionReady: retention.ready });

  return {
    campaignId: O6_FIVE_CLOSE_CAMPAIGN_ID,
    manifest,
    retentionReady: retention.ready,
    liveExecution: "executed",
    slotReports,
  };
}

function sha256FileSafe(path: string): string {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return "";
  }
}

function writeFinalCampaignReport(input: {
  io: FiveCloseIo;
  outAbs: string;
  manifest: FiveCloseCampaignManifest;
  retentionReady: boolean;
}): void {
  const report = {
    reportId: `${O6_FIVE_CLOSE_CAMPAIGN_ID}-final-report`,
    campaignId: input.manifest.campaignId,
    codeSha: input.manifest.codeSha,
    frozenAtUtc: input.manifest.frozenAtUtc,
    retentionMode: input.manifest.retentionMode,
    independentBackup: input.manifest.independentBackup,
    retentionReady: input.retentionReady,
    predeclaredComparisons: input.manifest.predeclaredComparisons,
    httpCeilingPerClose: input.manifest.httpCeilingPerClose,
    httpCeilingCampaign: input.manifest.httpCeilingCampaign,
    campaignHttpConsumed: input.manifest.campaignHttpConsumed,
    targets: input.manifest.targets.map((t) => ({
      slotIndex: t.slotIndex,
      closeUtc: t.closeUtc,
      closeLocalPdt: t.closeLocalPdt,
      status: t.status,
      capture: t.capture,
      official: t.official,
      retention: t.retention,
      httpConsumed: t.httpConsumed,
      reason: t.reason,
      completedAtUtc: t.completedAtUtc,
      slotOutDirRel: t.slotOutDirRel,
    })),
    interpretativeLimits: {
      matchesStrengthenOnlyTestedHypotheses: true,
      doesNotProveKalshiInternalSamplingOrRounding: true,
      disagreementRejectsOnlyTestedCandidates: true,
      officialBankIdentityRemainsUnverified: true,
      o3DecisionsNotFrozen: true,
      strategyPnlNotEvaluated: true,
    },
    attestation: {
      purchaseMade: false,
      subscriptionStarted: false,
      tradeOrOrderPlaced: false,
      strategyPnlComputed: false,
      o3Frozen: false,
    },
    generatedAtUtc: new Date(input.io.nowMs()).toISOString(),
  };
  writeJson(input.io, join(input.outAbs, "five-close-final-report.json"), report);

  const lines = [
    `# O6 five-close settlement fidelity — \`${input.manifest.campaignId}\``,
    "",
    `Frozen at: ${input.manifest.frozenAtUtc}`,
    `Code SHA: \`${input.manifest.codeSha ?? "null"}\``,
    `Retention: local-persistent-only (independentBackup=false)`,
    `Campaign HTTP: ${input.manifest.campaignHttpConsumed}/${input.manifest.httpCeilingCampaign}`,
    "",
    "## Targets",
    "",
    "| Slot | Close UTC | Status | Capture | Official | Retention | HTTP | Reason |",
    "| ---: | --- | --- | --- | --- | --- | ---: | --- |",
  ];
  for (const t of input.manifest.targets) {
    lines.push(
      `| ${t.slotIndex} | ${t.closeUtc} | ${t.status} | ${t.capture ?? "—"} | ${t.official ?? "—"} | ${t.retention ?? "—"} | ${t.httpConsumed ?? "—"} | ${(t.reason ?? "").replace(/\|/g, "/")} |`,
    );
  }
  lines.push(
    "",
    "## Limits",
    "",
    "- Matching results strengthen only the tested research hypotheses.",
    "- They do not prove Kalshi’s internal sampling or rounding.",
    "- Disagreement rejects only the tested candidates.",
    "- Official-bank identity, O3 decisions, and strategy P&L remain unverified / unfrozen.",
    "",
    "## Attestation",
    "",
    "- No purchases, subscriptions, trades, orders, or strategy P&L.",
    "- Five scheduled closes only; missed targets were not replaced.",
    "",
  );
  input.io.writeFile(join(input.outAbs, "five-close-final-report.md"), `${lines.join("\n")}`);
}
