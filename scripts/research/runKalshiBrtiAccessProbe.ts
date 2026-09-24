/**
 * Bounded read-only Kalshi CFB/BRTI access diagnostic.
 * Reuses existing Kalshi auth + historical market helpers. No second client.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cliFollowUpPreview,
  createFilesystemProbeIo,
  parseKalshiBrtiAccessProbeArgv,
  runFollowUpBrtiCampaign,
  runKalshiBrtiAccessProbe,
  KalshiBrtiAccessProbeError,
} from "@/lib/data/research/kalshiBrtiAccessProbe";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "../.."));

async function main(): Promise<number> {
  try {
    const argv = parseKalshiBrtiAccessProbeArgv(process.argv.slice(2));
    const io = createFilesystemProbeIo();
    if (argv.followUp) {
      const summary = await runFollowUpBrtiCampaign({ repoRoot: ROOT, argv, io });
      process.stdout.write(`${JSON.stringify(cliFollowUpPreview(summary))}\n`);
      return 0;
    }
    const summary = await runKalshiBrtiAccessProbe({ repoRoot: ROOT, argv, io });
    process.stdout.write(`${JSON.stringify({
      classification: summary.classification,
      httpRequestCount: summary.httpRequestCount,
      credentials: summary.credentials,
    })}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof KalshiBrtiAccessProbeError
      ? error.message
      : error instanceof Error
        ? error.message
        : "brti access probe failed";
    process.stderr.write(`${message}\n`);
    return 1;
  }
}

if (process.env.VITEST !== "true") {
  void main().then((code) => {
    process.exitCode = code;
  });
}
