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
import {
  RECOVERY_ACCEPTANCE_SCENARIOS,
  runCaptureRecoveryAcceptance,
  type RecoveryAcceptanceScenario,
} from "@/lib/data/live/forwardQuoteCapture";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type CaptureRecoveryAcceptanceCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
};

function parseScenario(argv: readonly string[]): RecoveryAcceptanceScenario {
  const index = argv.indexOf("--scenario");
  if (index === -1) {
    return "happy";
  }
  const value = argv[index + 1];
  if (
    value === undefined
    || !(RECOVERY_ACCEPTANCE_SCENARIOS as readonly string[]).includes(value)
  ) {
    throw new Error(
      `Unknown --scenario "${value ?? ""}". Supported scenarios: ${RECOVERY_ACCEPTANCE_SCENARIOS.join(", ")}`,
    );
  }
  return value as RecoveryAcceptanceScenario;
}

export async function runCaptureRecoveryAcceptanceCommand(
  argv: readonly string[],
  io: CaptureRecoveryAcceptanceCommandIo,
): Promise<number> {
  try {
    const scenario = parseScenario(argv);
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
