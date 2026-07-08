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
  buildCostAwareAtlasFromDirectories,
  serializeCostAwareAtlasHtml,
  serializeCostAwareAtlasReport,
  summarizeTradeabilityForStdout,
} from "@/lib/data/research/costAwareAtlas";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  formatStdoutOutput,
  mapCommandError,
  parseHtmlOutputPathFromArgv,
  parseInputDirFromArgv,
  parseMispricingAtlasPathFromArgv,
  parseOutputPathFromArgv,
} from "./buildCostAwareAtlasTypes";
import type { CostAwareAtlasCommandIo } from "./buildCostAwareAtlasTypes";

export function runCostAwareAtlasCommand(
  argv: readonly string[],
  io: CostAwareAtlasCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const inputRoot = parseInputDirFromArgv(argv);
    const outputPath = parseOutputPathFromArgv(argv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(argv);
    const mispricingAtlasPath = parseMispricingAtlasPathFromArgv(argv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildCostAwareAtlasFromDirectories({
      inputRoot,
      outputPath,
      htmlOutputPath,
      mispricingAtlasPath,
      io,
      generatedAt,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeCostAwareAtlasReport(report));
    io.writeFile(htmlOutputPath, serializeCostAwareAtlasHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          inputRoot,
          outputPath,
          htmlOutputPath,
          mispricingAtlasPath: report.mispricingAtlasPath,
          ...summarizeTradeabilityForStdout(report.summary),
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
  const exitCode = runCostAwareAtlasCommand(process.argv.slice(2), {
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

export {
  CostAwareAtlasCommandError,
  formatStdoutOutput,
  parseHtmlOutputPathFromArgv,
  parseInputDirFromArgv,
  parseMispricingAtlasPathFromArgv,
  parseOutputPathFromArgv,
} from "./buildCostAwareAtlasTypes";
