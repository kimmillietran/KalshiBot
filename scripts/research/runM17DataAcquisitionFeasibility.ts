/**
 * Offline M17 data-acquisition feasibility CLI.
 * No downloads, purchases, captures, trades, subscriptions, or P&L.
 * Public doc URLs are recorded as references only (no cost-incurring fetch here).
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildM17DataAcquisitionFeasibilityReport,
  serializeM17DataAcquisitionFeasibilityMarkdown,
} from "@/lib/data/research/m17DataAcquisitionFeasibility";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "../.."));

const DEFAULT_OUT = join(
  ROOT,
  "data/research-results/external-kalshi-data-audit/m17-data-acquisition-feasibility",
);

const BASE_MAIN_SHA = "1c17f6851c872b403b100bf342a95451a21ecfca";

const EVIDENCE: Array<{ key: string; path: string }> = [
  {
    key: "retained-input-recovery-report.json",
    path: join(
      ROOT,
      "data/research-results/external-kalshi-data-audit/m17-prep-retained-input-recovery-audit/retained-input-recovery-report.json",
    ),
  },
  {
    key: "m16-er-purchase-manifest.json",
    path: join(
      ROOT,
      "data/research-results/external-kalshi-data-audit/m16-er-purchase-manifest.json",
    ),
  },
  {
    key: "m16-er-acquisition-manifest.json",
    path: join(
      ROOT,
      "data/research-results/external-kalshi-data-audit/m16-er-acquisition-manifest.json",
    ),
  },
  {
    key: "m17-prep-brti-access-investigation.md",
    path: join(ROOT, "docs/research/m17-prep-brti-access-investigation.md"),
  },
  {
    key: "m17-prep-settlement-sample-mapping.md",
    path: join(ROOT, "docs/research/m17-prep-settlement-sample-mapping.md"),
  },
  {
    key: "m17-prep-brti-settlement-average-discrepancy-semantics.md",
    path: join(
      ROOT,
      "docs/research/m17-prep-brti-settlement-average-discrepancy-semantics.md",
    ),
  },
  {
    key: "m17-prep-settlement-state-feasibility.md",
    path: join(ROOT, "docs/research/m17-prep-settlement-state-feasibility.md"),
  },
  {
    key: "m17-spent-hold-to-settlement-eval.md",
    path: join(ROOT, "docs/research/m17-spent-hold-to-settlement-eval.md"),
  },
  {
    key: "m17-retained-input-recovery-audit.md",
    path: join(ROOT, "docs/research/m17-retained-input-recovery-audit.md"),
  },
];

const COINBASE_CANDLES = join(
  ROOT,
  "data/live-capture/forward-quotes/2026-09-22T18-00-05-364Z/btc-candles-1m.jsonl",
);

const JOIN_COUNTS = join(
  ROOT,
  "data/research-results/external-kalshi-data-audit/m17-prep-settlement-join-audit/settlement-join-audit-counts.json",
);

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function codeAuthoritySha(): string | null {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function main(): void {
  const outDir = process.env.M17_ACQUISITION_FEASIBILITY_OUT
    ? resolve(process.env.M17_ACQUISITION_FEASIBILITY_OUT)
    : DEFAULT_OUT;
  mkdirSync(outDir, { recursive: true });

  const localEvidenceSha256: Record<string, string> = {};
  for (const item of EVIDENCE) {
    if (!existsSync(item.path)) {
      throw new Error(`Missing local evidence: ${item.path}`);
    }
    localEvidenceSha256[item.key] = fileSha256(item.path);
  }

  let validSettlementJoins = 47_263;
  if (existsSync(JOIN_COUNTS)) {
    const countsFile = JSON.parse(readFileSync(JOIN_COUNTS, "utf8")) as {
      validSettlementJoinCount?: number;
      validJoins?: number;
      counts?: { validOfficialSettlementLabel?: number };
    };
    validSettlementJoins =
      countsFile.counts?.validOfficialSettlementLabel
      ?? countsFile.validSettlementJoinCount
      ?? countsFile.validJoins
      ?? validSettlementJoins;
  }

  let purchaseDayCount = 34;
  const purchaseManifest = join(
    ROOT,
    "data/research-results/external-kalshi-data-audit/m16-er-purchase-manifest.json",
  );
  if (existsSync(purchaseManifest)) {
    const m = JSON.parse(readFileSync(purchaseManifest, "utf8")) as {
      dayCount?: number;
    };
    if (typeof m.dayCount === "number") purchaseDayCount = m.dayCount;
  }

  const candleBytes = existsSync(COINBASE_CANDLES)
    ? statSync(COINBASE_CANDLES).size
    : 0;

  const report = buildM17DataAcquisitionFeasibilityReport({
    facts: {
      validSettlementJoins,
      spentUtcDayCount: purchaseDayCount,
      localEvidenceSha256,
      localCoinbaseCandlesPresentOnSpentCalendar: false,
      localCoinbaseCandlesByteSize: candleBytes,
      cryptostructRawContainsBrti: false,
      cryptostructRawContainsCoinbaseOhlc: false,
      kalshiHourHistoryDemonstratedLocally: true,
      kalshiMinuteHistoryRejectedLocally: true,
      offlineWindowReconstructionMatchedOfficial: false,
    },
    generatedAtUtc: new Date().toISOString(),
    codeAuthoritySha: codeAuthoritySha(),
    baseMainSha: BASE_MAIN_SHA,
  });

  const jsonPath = join(outDir, "report.json");
  const mdPath = join(outDir, "report.md");
  const summaryPath = join(outDir, "summary.json");

  const jsonBody = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(jsonPath, jsonBody, "utf8");
  writeFileSync(mdPath, serializeM17DataAcquisitionFeasibilityMarkdown(report), "utf8");

  const summary = {
    studyId: report.studyId,
    analysisVersion: report.analysisVersion,
    decisionStatus: report.decisionStatus,
    purchaseMade: report.purchaseMade,
    networkRequestsIncurringCost: report.networkRequestsIncurringCost,
    strategyPnlComputed: report.strategyPnlComputed,
    pristineHoldoutPurchaseRecommended: report.pristineHoldoutPurchaseRecommended,
    classificationCounts: report.classificationCounts,
    enablement: {
      exploratoryEvalOn34SpentDays: report.enablement.exploratoryEvalOn34SpentDays,
      newExploratoryProspectiveStudy: report.enablement.newExploratoryProspectiveStudy,
      confirmatoryHoldoutEvaluation: report.enablement.confirmatoryHoldoutEvaluation,
    },
    reportJsonSha256: createHash("sha256").update(jsonBody).digest("hex"),
    reportMdSha256: fileSha256(mdPath),
  };
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        outDir,
        decisionStatus: report.decisionStatus,
        purchaseMade: report.purchaseMade,
        reportJsonSha256: summary.reportJsonSha256,
      },
      null,
      2,
    ),
  );
}

main();
