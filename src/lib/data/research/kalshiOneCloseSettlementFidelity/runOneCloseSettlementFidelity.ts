import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  campaignLedgerPath,
  campaignLockPath,
  createFilesystemCampaignBudgetIo,
  loadOrCreateCampaignLedger,
  type CampaignBudgetIo,
} from "@/lib/data/research/kalshiBrtiAccessProbe/campaignBudget";

import { freezeOneClosePlan, classifyMissedSlot } from "./freezeOneClose";
import {
  assertRetentionReady,
  createFilesystemRetentionIo,
  verifyRetentionReadiness,
  type RetentionIo,
  type RetentionReadiness,
} from "./retentionReadiness";
import {
  DEFAULT_ONE_CLOSE_OUT_DIR,
  DEFAULT_ONE_CLOSE_RAW_DIR,
  ONE_CLOSE_CAMPAIGN_ID,
  ONE_CLOSE_MAX_HTTP,
  ONE_CLOSE_STUDY_ID,
  QUARTER_HOUR_MEMBERSHIP,
  TRAILING_MEMBERSHIP,
  OneCloseFidelityError,
  type CaptureStatus,
  type OfficialStatus,
  type OneClosePlan,
  type RetentionStatus,
} from "./types";

export type OneCloseArgv = {
  authorizeLive: boolean;
  skipLive: boolean;
  closeMs: number | null;
  campaignId: string;
  outDir: string;
  rawDir: string;
  maxHttp: number;
};

export type OneCloseIo = {
  writeFile: (path: string, contents: string) => void;
  readFile: (path: string) => string | null;
  mkdir: (path: string) => void;
  exists: (path: string) => boolean;
  nowMs: () => number;
  codeSha?: () => string;
};

export function createFilesystemOneCloseIo(): OneCloseIo {
  return {
    writeFile: (path, contents) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents);
    },
    readFile: (path) => (existsSync(path) ? readFileSync(path, "utf8") : null),
    mkdir: (path) => mkdirSync(path, { recursive: true }),
    exists: existsSync,
    nowMs: () => Date.now(),
  };
}

export function parseOneCloseArgv(argv: string[]): OneCloseArgv {
  const read = (flag: string): string | null => {
    const idx = argv.indexOf(flag);
    if (idx < 0) return null;
    return argv[idx + 1] ?? null;
  };
  const closeIso = read("--close-utc");
  let closeMs: number | null = null;
  if (closeIso) {
    const parsed = Date.parse(closeIso);
    if (!Number.isFinite(parsed)) {
      throw new OneCloseFidelityError(`invalid --close-utc: ${closeIso}`);
    }
    closeMs = parsed;
  }
  const maxHttpRaw = read("--max-http");
  return {
    authorizeLive: argv.includes("--authorize-live"),
    skipLive: argv.includes("--skip-live") || !argv.includes("--authorize-live"),
    closeMs,
    campaignId: read("--campaign-id") ?? ONE_CLOSE_CAMPAIGN_ID,
    outDir: read("--out-dir") ?? DEFAULT_ONE_CLOSE_OUT_DIR,
    rawDir: read("--raw-dir") ?? DEFAULT_ONE_CLOSE_RAW_DIR,
    maxHttp: maxHttpRaw ? Number(maxHttpRaw) : ONE_CLOSE_MAX_HTTP,
  };
}

export type OneCloseRunResult = {
  studyId: string;
  campaignId: string;
  plan: OneClosePlan;
  disposition: {
    captured: boolean;
    capture: CaptureStatus;
    official: OfficialStatus;
    retention: RetentionStatus;
    reason: string;
    rolledToLaterClose: false;
  };
  retentionReadiness: RetentionReadiness;
  httpBudget: { campaignId: string; consumed: number; limit: number };
  comparisonsFrozenBeforeCapture: {
    trailingMembership: typeof TRAILING_MEMBERSHIP;
    quarterHourMembership: typeof QUARTER_HOUR_MEMBERSHIP;
    noOffsetSearch: true;
    noOfficialFieldSelection: true;
  };
  liveExecution: "refused" | "not-attempted-skip-live" | "would-run-if-authorized-and-ready";
};

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * One-close settlement-fidelity runner. Live capture requires --authorize-live
 * AND verified distinct-device retention. Default path freezes the plan, checks
 * readiness, persists disposition, and refuses market-data requests.
 */
export async function runOneCloseSettlementFidelity(input: {
  repoRoot: string;
  argv: OneCloseArgv;
  io?: OneCloseIo;
  retentionIo?: RetentionIo;
  campaignIo?: CampaignBudgetIo;
}): Promise<OneCloseRunResult> {
  const io = input.io ?? createFilesystemOneCloseIo();
  const retentionIo = input.retentionIo ?? createFilesystemRetentionIo();
  const campaignIo = input.campaignIo ?? createFilesystemCampaignBudgetIo();
  const nowMs = io.nowMs();
  const outAbs = join(input.repoRoot, input.argv.outDir);
  const campaignDir = outAbs;
  io.mkdir(outAbs);

  if (input.argv.maxHttp > ONE_CLOSE_MAX_HTTP) {
    throw new OneCloseFidelityError(
      `max-http-exceeds-task-ceiling: ${input.argv.maxHttp}>${ONE_CLOSE_MAX_HTTP}`,
    );
  }

  const planPath = join(outAbs, "one-close-plan.json");
  const existingPlanRaw = io.readFile(planPath);
  let plan: OneClosePlan;
  if (existingPlanRaw) {
    const prior = JSON.parse(existingPlanRaw) as OneClosePlan;
    if (input.argv.closeMs != null && prior.closeMs !== input.argv.closeMs) {
      throw new OneCloseFidelityError(
        `frozen-close-mismatch: plan=${prior.closeUtc} requested=${new Date(input.argv.closeMs).toISOString()}; substitution forbidden`,
      );
    }
    plan = prior;
  } else {
    plan = freezeOneClosePlan({
      nowMs,
      closeMs: input.argv.closeMs ?? undefined,
      campaignId: input.argv.campaignId,
      frozenAtUtc: new Date(nowMs).toISOString(),
    });
  }
  io.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);

  const ledgerPath = campaignLedgerPath(campaignDir);
  const lockPath = campaignLockPath(campaignDir);
  loadOrCreateCampaignLedger({
    ledgerPath,
    campaignId: plan.campaignId,
    limit: input.argv.maxHttp,
    io: campaignIo,
  });

  const retentionReadiness = verifyRetentionReadiness({
    io: retentionIo,
    nowIso: new Date(nowMs).toISOString(),
  });

  const missed = classifyMissedSlot(plan, nowMs);
  let capture: CaptureStatus = "not-attempted";
  const official: OfficialStatus = "not-attempted";
  let retention: RetentionStatus = retentionReadiness.ready ? "pending" : "blocked-prerequisite";
  let reason = "awaiting-authorization-and-readiness";
  let liveExecution: OneCloseRunResult["liveExecution"] = "not-attempted-skip-live";
  const captured = false;

  if (!retentionReadiness.ready) {
    capture = "refused-readiness";
    retention = "blocked-prerequisite";
    reason = retentionReadiness.blocker ?? "retention-not-ready";
    liveExecution = "refused";
  } else if (missed === "missed-slot") {
    capture = "missed-slot";
    reason = "now-at-or-after-frozen-close; substitution-forbidden";
    liveExecution = "refused";
  } else if (!input.argv.authorizeLive || input.argv.skipLive) {
    reason = "live-not-authorized: pass --authorize-live only when retention-ready and gates satisfied";
    liveExecution = "not-attempted-skip-live";
  } else {
    // Live path gated: still require explicit retention assert before any network.
    try {
      assertRetentionReady(retentionReadiness);
    } catch (error) {
      capture = "refused-readiness";
      retention = "blocked-prerequisite";
      reason = error instanceof Error ? error.message : "retention-assert-failed";
      liveExecution = "refused";
      const result = buildResult();
      persistDisposition(result);
      return result;
    }
    // Intentionally not opening sockets here in default CI/offline flows.
    // A follow-up that holds credentials + distinct-device archive may call the
    // capture helpers; this runner refuses to start network I/O unless a
    // dedicated live executor is wired (keeps unit tests hermetic).
    liveExecution = "would-run-if-authorized-and-ready";
    reason = "live-executor-not-wired-in-this-commit; capture not started";
    capture = "not-attempted";
  }

  function buildResult(): OneCloseRunResult {
    const ledger = loadOrCreateCampaignLedger({
      ledgerPath,
      campaignId: plan.campaignId,
      limit: input.argv.maxHttp,
      io: campaignIo,
      requireExisting: true,
    });
    return {
      studyId: ONE_CLOSE_STUDY_ID,
      campaignId: plan.campaignId,
      plan,
      disposition: {
        captured,
        capture,
        official,
        retention,
        reason,
        rolledToLaterClose: false,
      },
      retentionReadiness,
      httpBudget: {
        campaignId: ledger.campaignId,
        consumed: ledger.consumed,
        limit: ledger.limit,
      },
      comparisonsFrozenBeforeCapture: {
        trailingMembership: TRAILING_MEMBERSHIP,
        quarterHourMembership: QUARTER_HOUR_MEMBERSHIP,
        noOffsetSearch: true,
        noOfficialFieldSelection: true,
      },
      liveExecution,
    };
  }

  function persistDisposition(result: OneCloseRunResult): void {
    const body = `${JSON.stringify({
      ...result,
      codeSha: io.codeSha?.() ?? null,
      lockPath,
      rawDir: input.argv.rawDir,
      generatedAtUtc: new Date(io.nowMs()).toISOString(),
    }, null, 2)}\n`;
    io.writeFile(join(outAbs, "one-close-disposition.json"), body);
    io.writeFile(
      join(outAbs, "one-close-disposition.sha256"),
      `${sha256Text(body)}\n`,
    );
  }

  const result = buildResult();
  persistDisposition(result);
  return result;
}
