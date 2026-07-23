/**
 * M12.1G: deterministic WebSocket reconnect acceptance command.
 *
 * Runs the production capture orchestrator through a scripted transport that
 * forces reconnect auth finalization (fresh headers, contained 401s, process
 * safety) entirely in memory with ephemeral RSA credentials.
 *
 * Default (no --scenario): runs both gate scenarios required before live smoke:
 *   - reconnect-success
 *   - reconnect-401-terminal
 *
 * Also supports --scenario auth-generation-throw | second-attempt-success.
 *
 * Exits nonzero when any acceptance requirement fails.
 */
import {
  WS_RECONNECT_ACCEPTANCE_SCENARIOS,
  runWsReconnectAcceptance,
  type WsReconnectAcceptanceReport,
  type WsReconnectAcceptanceScenario,
} from "@/lib/data/live/forwardQuoteCapture";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type WsReconnectAcceptanceCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
};

const DEFAULT_GATE_SCENARIOS: readonly WsReconnectAcceptanceScenario[] = [
  "reconnect-success",
  "reconnect-401-terminal",
];

function parseScenario(
  argv: readonly string[],
): WsReconnectAcceptanceScenario | "all-default" {
  const index = argv.indexOf("--scenario");
  if (index === -1) {
    return "all-default";
  }
  const value = argv[index + 1];
  if (
    value === undefined
    || !(WS_RECONNECT_ACCEPTANCE_SCENARIOS as readonly string[]).includes(value)
  ) {
    throw new Error(
      `Unknown --scenario "${value ?? ""}". Supported scenarios: ${WS_RECONNECT_ACCEPTANCE_SCENARIOS.join(", ")}`,
    );
  }
  return value as WsReconnectAcceptanceScenario;
}

export async function runWsReconnectAcceptanceCommand(
  argv: readonly string[],
  io: WsReconnectAcceptanceCommandIo,
): Promise<number> {
  try {
    const parsed = parseScenario(argv);
    const scenarios: readonly WsReconnectAcceptanceScenario[] =
      parsed === "all-default" ? DEFAULT_GATE_SCENARIOS : [parsed];

    const reports: WsReconnectAcceptanceReport[] = [];
    for (const scenario of scenarios) {
      const report = await runWsReconnectAcceptance({ scenario });
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
          `WS reconnect acceptance FAILED scenario=${report.scenario} `
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
        `WS reconnect acceptance passed (${report.scenario}): ${report.checks.length} checks, `
          + `${report.transcript.length} transcript steps.\n`,
      );
    }
    return 0;
  } catch (error) {
    io.writeStderr(
      `WS reconnect acceptance crashed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    return 1;
  }
}

async function main(): Promise<void> {
  const exitCode = await runWsReconnectAcceptanceCommand(process.argv.slice(2), {
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
