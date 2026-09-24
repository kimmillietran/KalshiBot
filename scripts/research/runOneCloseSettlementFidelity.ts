/**
 * One-close settlement-fidelity diagnostic runner.
 * Default: freeze plan + retention gate + refuse live.
 * Live capture requires --authorize-live AND retention readiness
 * (`local-persistent-only` or `independent-archive`).
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  OneCloseFidelityError,
  parseOneCloseArgv,
  runOneCloseSettlementFidelity,
  createFilesystemOneCloseIo,
} from "@/lib/data/research/kalshiOneCloseSettlementFidelity";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "../.."));

async function main(): Promise<number> {
  try {
    const argv = parseOneCloseArgv(process.argv.slice(2));
    const result = await runOneCloseSettlementFidelity({
      repoRoot: ROOT,
      argv,
      io: createFilesystemOneCloseIo(),
    });
    process.stdout.write(`${JSON.stringify({
      studyId: result.studyId,
      campaignId: result.campaignId,
      closeUtc: result.plan.closeUtc,
      captured: result.disposition.captured,
      capture: result.disposition.capture,
      official: result.disposition.official,
      retention: result.disposition.retention,
      reason: result.disposition.reason,
      httpConsumed: result.httpBudget.consumed,
      liveExecution: result.liveExecution,
      retentionReady: result.retentionReadiness.ready,
      retentionMode: result.retentionReadiness.mode,
      independentBackup: result.retentionReadiness.independentBackup,
      retentionBlocker: result.retentionReadiness.blocker,
      rawCapturePath: result.live?.rawCapturePath ?? null,
      rawCaptureSha256: result.live?.rawCaptureSha256 ?? null,
    })}\n`);
    return result.disposition.capture === "refused-readiness" || result.disposition.capture === "missed-slot"
      ? 2
      : 0;
  } catch (error) {
    const message = error instanceof OneCloseFidelityError
      ? error.message
      : error instanceof Error
        ? error.message
        : "one-close fidelity failed";
    process.stderr.write(`${message}\n`);
    return 1;
  }
}

if (process.env.VITEST !== "true") {
  void main().then((code) => {
    process.exitCode = code;
  });
}
