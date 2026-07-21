/**
 * M12.1F Part A: deterministic capture recovery acceptance command.
 *
 * Runs the full production capture orchestrator through a scripted
 * WebSocket transport (connection, subscription, sid ack, snapshot, deltas,
 * one intentional sequence gap, one sid-correct recovery, quarantined
 * deltas, fresh snapshot, post-recovery deltas, unsubscribe + ack, graceful
 * finalization) entirely in memory, then verifies the acceptance policy.
 *
 * Exits nonzero when any acceptance requirement fails.
 */
import { runCaptureRecoveryAcceptance } from "@/lib/data/live/forwardQuoteCapture";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type CaptureRecoveryAcceptanceCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
};

export async function runCaptureRecoveryAcceptanceCommand(
  argv: readonly string[],
  io: CaptureRecoveryAcceptanceCommandIo,
): Promise<number> {
  try {
    const scenario = argv.includes("--scenario")
      ? (argv[argv.indexOf("--scenario") + 1] as
          | "happy"
          | "missing-sid"
          | "no-fresh-snapshot")
      : "happy";
    const report = await runCaptureRecoveryAcceptance({ scenario });

    io.writeStdout(`${stableStringify(report)}\n`);

    if (!report.passed) {
      io.writeStderr(
        `Capture recovery acceptance FAILED (${report.failures.length} requirement(s)):\n`,
      );
      for (const failure of report.failures) {
        io.writeStderr(`  - ${failure}\n`);
      }
      return 1;
    }

    io.writeStderr(
      `Capture recovery acceptance passed: ${report.checks.length} checks, `
        + `${report.transcript.length} transcript steps.\n`,
    );
    return 0;
  } catch (error) {
    io.writeStderr(
      `Capture recovery acceptance crashed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    return 1;
  }
}

async function main(): Promise<void> {
  const exitCode = await runCaptureRecoveryAcceptanceCommand(process.argv.slice(2), {
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
  });
  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  void main();
}
