import {
  MarketDiscoveryCommandError,
  DEFAULT_DISCOVERY_OUTPUT_PATH,
} from "./types";
import {
  expandEqualsStyleFlags,
  hasCliFlags,
  mergeNpmConfigFlags,
  readNpmConfigEnv,
} from "../lib/normalizeNpmArgv";

const OUTPUT_PATH_PATTERN = /\.json$/i;

const DISCOVERY_NPM_CONFIG_FLAGS = [
  "--series",
  "--limit",
  "--offset",
  "--after",
  "--before",
  "--request-delay-ms",
  "--max-retries",
  "--retry-base-delay-ms",
  "--output",
] as const;

function isIntegerToken(token: string): boolean {
  return /^\d+$/.test(token.trim());
}

function looksLikeOutputPath(token: string): boolean {
  return (
    OUTPUT_PATH_PATTERN.test(token)
    || token.includes("/")
    || token.includes("\\")
  );
}

function appendFlag(
  normalized: string[],
  flag: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    normalized.push(flag, value);
  }
}

function parsePositionalDiscoveryArgv(argv: readonly string[]): string[] {
  if (argv.length === 0) {
    return [];
  }

  const normalized: string[] = [];
  let series: string | undefined;
  let output: string | undefined;
  const numbers: number[] = [];

  for (const token of argv) {
    if (looksLikeOutputPath(token)) {
      output = token;
      continue;
    }

    if (isIntegerToken(token)) {
      numbers.push(Number(token));
      continue;
    }

    if (!series) {
      series = token;
      continue;
    }

    output = token;
  }

  appendFlag(normalized, "--series", series);
  appendFlag(normalized, "--limit", numbers[0]?.toString());
  appendFlag(normalized, "--request-delay-ms", numbers[1]?.toString());
  appendFlag(normalized, "--max-retries", numbers[2]?.toString());
  appendFlag(normalized, "--retry-base-delay-ms", numbers[3]?.toString());
  appendFlag(normalized, "--output", output);

  return normalized;
}

function expandDiscoveryEqualsStyleFlags(argv: readonly string[]): string[] {
  try {
    return expandEqualsStyleFlags(argv);
  } catch (error) {
    if (error instanceof Error) {
      throw new MarketDiscoveryCommandError(error.message);
    }

    throw error;
  }
}

/**
 * npm on Windows/PowerShell consumes common `--flag` tokens as npm config and forwards
 * only the bare values positionally. Normalize argv before flag parsing.
 */
export function normalizeDiscoveryCliArgv(argv: readonly string[]): string[] {
  const expanded = expandDiscoveryEqualsStyleFlags(argv);

  if (hasCliFlags(expanded)) {
    return mergeNpmConfigFlags(expanded, DISCOVERY_NPM_CONFIG_FLAGS);
  }

  return mergeNpmConfigFlags(
    parsePositionalDiscoveryArgv(expanded),
    DISCOVERY_NPM_CONFIG_FLAGS,
  );
}

export function parseNormalizedOutputPath(argv: readonly string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output") {
      return argv[index + 1] ?? DEFAULT_DISCOVERY_OUTPUT_PATH;
    }
  }

  return DEFAULT_DISCOVERY_OUTPUT_PATH;
}

export { readNpmConfigEnv };
