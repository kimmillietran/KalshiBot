/**
 * O6 five-close settlement-fidelity campaign CLI.
 * Default: freeze schedule + retention check (no live).
 * Live: --authorize-live (requires retention ready).
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  OneCloseFidelityError,
} from "@/lib/data/research/kalshiOneCloseSettlementFidelity";
import {
  createFilesystemFiveCloseIo,
  parseO6FiveCloseArgv,
  runO6FiveCloseCampaign,
} from "@/lib/data/research/kalshiO6FiveCloseSettlementFidelity";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "../.."));

async function main(): Promise<number> {
  try {
    const argv = parseO6FiveCloseArgv(process.argv.slice(2));
    const result = await runO6FiveCloseCampaign({
      repoRoot: ROOT,
      argv,
      io: createFilesystemFiveCloseIo(ROOT),
    });
    process.stdout.write(`${JSON.stringify({
      campaignId: result.campaignId,
      liveExecution: result.liveExecution,
      retentionReady: result.retentionReady,
      frozenAtUtc: result.manifest.frozenAtUtc,
      codeSha: result.manifest.codeSha,
      campaignHttpConsumed: result.manifest.campaignHttpConsumed,
      targets: result.manifest.targets.map((t) => ({
        slotIndex: t.slotIndex,
        closeUtc: t.closeUtc,
        status: t.status,
        capture: t.capture,
        official: t.official,
        httpConsumed: t.httpConsumed,
        reason: t.reason,
      })),
    }, null, 2)}\n`);
    const anyMiss = result.manifest.targets.some((t) => t.status === "missed-slot");
    return anyMiss && result.liveExecution === "executed" ? 2 : 0;
  } catch (error) {
    const message = error instanceof OneCloseFidelityError
      ? error.message
      : error instanceof Error
        ? error.message
        : "o6-five-close failed";
    process.stderr.write(`${message}\n`);
    return 1;
  }
}

if (process.env.VITEST !== "true") {
  void main().then((code) => {
    process.exitCode = code;
  });
}
