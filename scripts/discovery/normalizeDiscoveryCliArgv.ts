import {
  DEFAULT_DISCOVERY_OUTPUT_PATH,
  MarketDiscoveryCommandError,
} from "./types";

const OUTPUT_PATH_PATTERN = /\.json$/i;

function expandEqualsStyleFlags(argv: readonly string[]): string[] {
  const expanded: string[] = [];

  for (const token of argv) {
    if (token.startsWith("--") && token.includes("=")) {
      const separatorIndex = token.indexOf("=");
      const flag = token.slice(0, separatorIndex);
      const value = token.slice(separatorIndex + 1);

      if (!value) {
        throw new MarketDiscoveryCommandError(`Missing value for ${flag}`);
      }

      expanded.push(flag, value);
      continue;
    }

    expanded.push(token);
  }

  return expanded;
}

function hasDiscoveryFlags(argv: readonly string[]): boolean {
  return argv.some((token) => token.startsWith("--"));
}

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

function readNpmConfigValue(flag: string): string | undefined {
  const envKey = `npm_config_${flag.slice(2).replace(/-/g, "_")}`;
  const value = process.env[envKey]?.trim();
  return value || undefined;
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

function mergeNpmConfigFlags(argv: readonly string[]): string[] {
  const flagsPresent = new Set(
    argv.filter((token) => token.startsWith("--")),
  );

  const merged = [...argv];

  const configFlags = [
    ["--series", readNpmConfigValue("--series")],
    ["--limit", readNpmConfigValue("--limit")],
    ["--offset", readNpmConfigValue("--offset")],
    ["--after", readNpmConfigValue("--after")],
    ["--before", readNpmConfigValue("--before")],
    ["--request-delay-ms", readNpmConfigValue("--request-delay-ms")],
    ["--max-retries", readNpmConfigValue("--max-retries")],
    ["--retry-base-delay-ms", readNpmConfigValue("--retry-base-delay-ms")],
    ["--output", readNpmConfigValue("--output")],
  ] as const;

  for (const [flag, value] of configFlags) {
    if (!flagsPresent.has(flag) && value !== undefined) {
      merged.push(flag, value);
    }
  }

  return merged;
}

/**
 * npm on Windows/PowerShell consumes common `--flag` tokens as npm config and forwards
 * only the bare values positionally. Normalize argv before flag parsing.
 */
export function normalizeDiscoveryCliArgv(argv: readonly string[]): string[] {
  const expanded = expandEqualsStyleFlags(argv);

  if (hasDiscoveryFlags(expanded)) {
    return mergeNpmConfigFlags(expanded);
  }

  return mergeNpmConfigFlags(parsePositionalDiscoveryArgv(expanded));
}

export function parseNormalizedOutputPath(argv: readonly string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output") {
      return argv[index + 1] ?? DEFAULT_DISCOVERY_OUTPUT_PATH;
    }
  }

  return DEFAULT_DISCOVERY_OUTPUT_PATH;
}
