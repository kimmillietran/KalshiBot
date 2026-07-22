/**
 * M12.1F Part A: deterministic capture recovery acceptance command.
 *
 * Runs the full production capture orchestrator through a scripted
 * WebSocket transport (connection, subscription, sid ack, snapshot, deltas,
 * one intentional sequence gap, one sid-correct recovery, quarantined
 * deltas, fresh snapshot, post-recovery deltas, unsubscribe + ack, graceful
 * finalization) entirely in memory, then verifies the acceptance policy.
 *
 * Default (no --scenario): runs both protocol forms required before live smoke:
 *   - happy: Form 1 ok-then-snapshot
 *   - snapshot-as-response: Form 2 id-bearing orderbook_snapshot (live-observed)
 *
 * Exits nonzero when any acceptance requirement fails.
 */
import {
  RECOVERY_ACCEPTANCE_SCENARIOS,
  runCaptureRecoveryAcceptance,
  type RecoveryAcceptanceReport,
  type RecoveryAcceptanceScenario,
} from "@/lib/data/live/forwardQuoteCapture";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type CaptureRecoveryAcceptanceCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
};

const DEFAULT_GATE_SCENARIOS: readonly RecoveryAcceptanceScenario[] = [
  "happy",
  "snapshot-as-response",
];

function parseScenario(argv: readonly string[]): RecoveryAcceptanceScenario | "all-default" {
  const index = argv.indexOf("--scenario");
  if (index === -1) {
    return "all-default";
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
    const parsed = parseScenario(argv);
    const scenarios: readonly RecoveryAcceptanceScenario[] =
      parsed === "all-default" ? DEFAULT_GATE_SCENARIOS : [parsed];

    const reports: RecoveryAcceptanceReport[] = [];
    for (const scenario of scenarios) {
      const report = await runCaptureRecoveryAcceptance({ scenario });
      reports.push(report);
    }

    if (reports.length === 1) {
      io.writeStdout(`${stableStringify(reports[0]!)}\n`);
    } else {
      io.writeStdout(
        `${stableStringify({
          schemaVersion: 1,
          mode: "default-gate",
          scenarios: reports.map((report) => report.scenario),
          passed: reports.every((report) => report.passed),
          reports,
        })}\n`,
      );
    }

    const failed = reports.filter((report) => !report.passed);
    if (failed.length > 0) {
      for (const report of failed) {
        io.writeStderr(
          `Capture recovery acceptance FAILED scenario=${report.scenario} `
            + `(${report.failures.length} requirement(s)):\n`,
        );
        for (const failure of report.failures) {
          io.writeStderr(`  - ${failure}\n`);
        }
      }
      return 1;
    }

    for (const report of reports) {
      io.writeStderr(
        `Capture recovery acceptance passed (${report.scenario}): ${report.checks.length} checks, `
          + `${report.transcript.length} transcript steps.\n`,
      );
    }
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
