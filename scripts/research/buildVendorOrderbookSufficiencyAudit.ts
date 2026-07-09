import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";

import {
  loadAndBuildVendorOrderbookSufficiencyAuditReport,
  serializeVendorOrderbookSufficiencyAuditHtml,
  serializeVendorOrderbookSufficiencyAuditReport,
} from "@/lib/data/research/vendorOrderbookSufficiencyAudit";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  formatStdoutOutput,
  mapCommandError,
  parseHtmlOutputPathFromArgv,
  parseInputPathsFromArgv,
  parseOutputPathFromArgv,
} from "./buildVendorOrderbookSufficiencyAuditTypes";
import type { VendorOrderbookSufficiencyAuditCommandIo } from "./buildVendorOrderbookSufficiencyAuditTypes";

export function runVendorOrderbookSufficiencyAuditCommand(
  argv: readonly string[],
  io: VendorOrderbookSufficiencyAuditCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const outputPath = parseOutputPathFromArgv(argv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(argv);
    const inputPaths = parseInputPathsFromArgv(argv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = loadAndBuildVendorOrderbookSufficiencyAuditReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      io,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeVendorOrderbookSufficiencyAuditReport(report));
    io.writeFile(htmlOutputPath, serializeVendorOrderbookSufficiencyAuditHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          overallVerdict: report.summary.overallVerdict,
          recommendedNextAction: report.summary.recommendedNextAction,
          vendorCount: report.summary.vendorCount,
          vendorsWithSamples: report.summary.vendorsWithSamples,
        }),
      ),
    );

    return 0;
  } catch (error) {
    io.writeStderr(`${mapCommandError(error)}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runVendorOrderbookSufficiencyAuditCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
    writeFile: (path, data) => {
      writeFileSync(path, data, "utf8");
    },
    mkdirSync: (path, options) => {
      mkdirSync(path, options);
    },
    readdir: (path) => readdirSync(path),
    fileExists: (path) => existsSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}
