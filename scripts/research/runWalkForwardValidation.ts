import { readFileSync } from "node:fs";

import {
  createNodeWalkForwardSplitFilesystem,
  normalizeWalkForwardSplitDefinition,
  parseWalkForwardSplitDefinitionJson,
  runWalkForwardSplit,
  serializeWalkForwardSplitSummary,
  WalkForwardSplitError,
} from "@/lib/data/research/walkForwardEngine";
import type { WalkForwardSplitDefinition } from "@/lib/data/research/walkForwardEngine";

import type { WalkForwardSplitFilesystem } from "@/lib/data/research/walkForwardEngine";

import {
  formatStdoutOutput,
  parseAllowOverlappingValidationWindowsFromArgv,
  parseEmbargoFromArgv,
  parseOutputDirFromArgv,
  parseRegistryDirFromArgv,
  parseSplitConfigPathFromArgv,
  parseSplitIdFromArgv,
  parseStepSizeFromArgv,
  parseTrainingWindowFromArgv,
  parseValidationWindowFromArgv,
  WalkForwardCommandError,
} from "./walkForwardCommandTypes";
import type { WalkForwardCommandIo } from "./walkForwardCommandTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof WalkForwardCommandError) {
    return error.message;
  }

  if (error instanceof WalkForwardSplitError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Walk-forward validation command failed";
}

function resolveSplitDefinition(
  argv: readonly string[],
  io: WalkForwardCommandIo,
): WalkForwardSplitDefinition {
  const configPath = parseSplitConfigPathFromArgv(argv);

  if (configPath) {
    const fileConfig = parseWalkForwardSplitDefinitionJson(io.readFile(configPath));
    const overrides = {
      splitId: parseSplitIdFromArgv(argv) ?? fileConfig.splitId,
      trainingWindowSize:
        parseTrainingWindowFromArgv(argv) ?? fileConfig.trainingWindowSize,
      validationWindowSize:
        parseValidationWindowFromArgv(argv) ?? fileConfig.validationWindowSize,
      stepSize: parseStepSizeFromArgv(argv) ?? fileConfig.stepSize,
      embargoMarketCount:
        parseEmbargoFromArgv(argv) ?? fileConfig.embargoMarketCount,
      allowOverlappingValidationWindows:
        parseAllowOverlappingValidationWindowsFromArgv(argv)
        ?? fileConfig.allowOverlappingValidationWindows,
    };

    return normalizeWalkForwardSplitDefinition({
      ...fileConfig,
      ...overrides,
    });
  }

  const splitId = parseSplitIdFromArgv(argv);
  const trainingWindowSize = parseTrainingWindowFromArgv(argv);
  const validationWindowSize = parseValidationWindowFromArgv(argv);
  const stepSize = parseStepSizeFromArgv(argv);

  if (!splitId || !trainingWindowSize || !validationWindowSize || !stepSize) {
    throw new WalkForwardCommandError(
      "Provide --config <path> or all of --split-id, --training-window, --validation-window, and --step-size",
    );
  }

  return normalizeWalkForwardSplitDefinition({
    splitId,
    trainingWindowSize,
    validationWindowSize,
    stepSize,
    embargoMarketCount: parseEmbargoFromArgv(argv) ?? 0,
    allowOverlappingValidationWindows:
      parseAllowOverlappingValidationWindowsFromArgv(argv) ?? true,
  });
}

export function runWalkForwardValidationCommand(
  argv: readonly string[],
  io: WalkForwardCommandIo,
  options?: {
    generatedAt?: string;
    filesystem?: WalkForwardSplitFilesystem;
  },
): number {
  try {
    const registryDir = parseRegistryDirFromArgv(argv);
    const outputDir = parseOutputDirFromArgv(argv);
    const config = resolveSplitDefinition(argv, io);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const summary = runWalkForwardSplit(
      {
        registryDir,
        outputDir,
        config,
        generatedAt,
      },
      {
        filesystem: options?.filesystem ?? createNodeWalkForwardSplitFilesystem(),
      },
    );

    io.writeStdout(formatStdoutOutput(serializeWalkForwardSplitSummary(summary)));

    return 0;
  } catch (error) {
    const message = mapCommandError(error);
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runWalkForwardValidationCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
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
  main();
}

export {
  formatStdoutOutput,
  parseEmbargoFromArgv,
  parseOutputDirFromArgv,
  parseRegistryDirFromArgv,
  parseSplitConfigPathFromArgv,
  parseSplitIdFromArgv,
  parseStepSizeFromArgv,
  parseTrainingWindowFromArgv,
  parseValidationWindowFromArgv,
} from "./walkForwardCommandTypes";
