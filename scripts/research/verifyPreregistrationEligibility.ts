import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  assertPreregistrationEligibilityReportPass,
  DEFAULT_PREREGISTRATION_ELIGIBILITY_REPORT_PATH,
  verifyPreregistrationEligibilityForHypothesisConfigs,
} from "@/lib/data/research/candidatePreregistrationEligibility";
import { stableStringify } from "@/lib/trading/config/hashConfig";

export type VerifyPreregistrationEligibilityCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
};

function parseOutputPath(argv: readonly string[]): string {
  const index = argv.indexOf("--output");
  if (index >= 0 && argv[index + 1]) {
    return argv[index + 1]!;
  }
  return DEFAULT_PREREGISTRATION_ELIGIBILITY_REPORT_PATH;
}

export function runVerifyPreregistrationEligibilityCommand(
  argv: readonly string[],
  io: VerifyPreregistrationEligibilityCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    if (argv.includes("--latest") || argv.includes("--use-latest")) {
      throw new Error(
        "verify-preregistration-eligibility does not support latest/mtime discovery",
      );
    }

    const outputPath = parseOutputPath(argv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const report = verifyPreregistrationEligibilityForHypothesisConfigs({
      io,
      generatedAt,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, `${stableStringify(report)}\n`);

    assertPreregistrationEligibilityReportPass(report);

    io.writeStdout(
      `${JSON.stringify({
        outputPath,
        total: report.summary.total,
        eligible: report.summary.eligible,
        legacyGrandfathered: report.summary.legacyGrandfathered,
        ineligible: report.summary.ineligible,
      })}\n`,
    );
    return 0;
  } catch (error) {
    io.writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runVerifyPreregistrationEligibilityCommand(process.argv.slice(2), {
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
    writeFile: (path, data) => {
      writeFileSync(path, data, "utf8");
    },
    readFile: (path) => readFileSync(path, "utf8"),
    fileExists: (path) => existsSync(path),
    readdir: (path) => readdirSync(path),
    mkdirSync: (path, options) => {
      mkdirSync(path, options);
    },
  });
  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}
