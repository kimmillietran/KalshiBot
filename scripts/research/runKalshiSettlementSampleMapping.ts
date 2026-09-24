/**
 * Bounded settlement-sample mapping diagnostic.
 * Reuses Kalshi auth, CFB probe parsing, campaign budget, and orderbook reconstruction.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFilesystemMappingIo,
  parseSettlementSampleMappingArgv,
  runSettlementSampleMapping,
  SettlementSampleMappingError,
} from "@/lib/data/research/kalshiSettlementSampleMapping";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "../.."));

async function main(): Promise<number> {
  try {
    const argv = parseSettlementSampleMappingArgv(process.argv.slice(2));
    const summary = await runSettlementSampleMapping({
      repoRoot: ROOT,
      argv,
      io: createFilesystemMappingIo(),
    });
    process.stdout.write(`${JSON.stringify({
      studyId: summary.studyId,
      retainedVerified: (summary.offline as { retainedVerified?: boolean } | null)?.retainedVerified ?? null,
      discoveryStatus: (summary.live as { discoveryStatus?: string } | null)?.discoveryStatus ?? null,
      officialComparison: (summary.live as { officialComparison?: { status?: string } } | null)?.officialComparison?.status ?? null,
      httpBudget: summary.httpBudget,
    })}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof SettlementSampleMappingError
      ? error.message
      : error instanceof Error
        ? error.message
        : "settlement sample mapping failed";
    process.stderr.write(`${message}\n`);
    return 1;
  }
}

if (process.env.VITEST !== "true") {
  void main().then((code) => {
    process.exitCode = code;
  });
}
