export class NormalizeNpmArgvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NormalizeNpmArgvError";
  }
}

export type NpmArgvField = {
  readonly flag: string;
};

export function hasCliFlags(argv: readonly string[]): boolean {
  return argv.some((token) => token.startsWith("-"));
}

export function expandEqualsStyleFlags(argv: readonly string[]): string[] {
  const expanded: string[] = [];

  for (const token of argv) {
    if (token.startsWith("--") && token.includes("=")) {
      const separatorIndex = token.indexOf("=");
      const flag = token.slice(0, separatorIndex);
      const value = token.slice(separatorIndex + 1);

      if (!value) {
        throw new NormalizeNpmArgvError(`Missing value for ${flag}`);
      }

      expanded.push(flag, value);
      continue;
    }

    expanded.push(token);
  }

  return expanded;
}

/**
 * Maps positional argv tokens to explicit flags in schema order.
 * Extra positional tokens beyond the schema are appended unchanged.
 */
export function mapPositionalToFlags(
  argv: readonly string[],
  schema: readonly NpmArgvField[],
): string[] {
  const normalized: string[] = [];

  for (let index = 0; index < schema.length; index += 1) {
    const value = argv[index];
    if (value === undefined) {
      break;
    }

    normalized.push(schema[index].flag, value);
  }

  if (argv.length > schema.length) {
    normalized.push(...argv.slice(schema.length));
  }

  return normalized;
}

export function readNpmConfigEnv(flag: string): string | undefined {
  const envKey = `npm_config_${flag.slice(2).replace(/-/g, "_")}`;
  const value = process.env[envKey]?.trim();
  return value || undefined;
}

/**
 * Re-injects boolean flags consumed by npm (npm_config_<flag>=true) when absent from argv.
 */
export function mergeNpmBooleanFlags(
  argv: readonly string[],
  booleanFlags: readonly string[],
): string[] {
  const flagsPresent = new Set(
    argv.filter((token) => token.startsWith("--")),
  );
  const merged = [...argv];

  for (const flag of booleanFlags) {
    if (flagsPresent.has(flag)) {
      continue;
    }

    const configValue = readNpmConfigEnv(flag);
    if (configValue === "true") {
      merged.push(flag);
    }
  }

  return merged;
}

/**
 * Re-injects flag/value pairs from npm_config_* env vars when flags were consumed by npm.
 */
export function mergeNpmConfigFlags(
  argv: readonly string[],
  configFlags: readonly string[],
): string[] {
  const flagsPresent = new Set(
    argv.filter((token) => token.startsWith("--")),
  );
  const merged = [...argv];

  for (const flag of configFlags) {
    if (flagsPresent.has(flag)) {
      continue;
    }

    const value = readNpmConfigEnv(flag);
    if (value === undefined || value === "true") {
      continue;
    }

    merged.push(flag, value);
  }

  return merged;
}

/**
 * Normalizes argv for npm scripts on Windows/PowerShell, where `--flag` tokens are often
 * consumed as npm config and only bare values are forwarded positionally.
 *
 * When explicit flags are present, argv is returned unchanged (after `=` expansion).
 * Otherwise positional tokens are mapped to the provided schema in order.
 */
export function normalizeNpmScriptArgv(
  argv: readonly string[],
  schema: readonly NpmArgvField[],
): string[] {
  const expanded = expandEqualsStyleFlags(argv);

  if (hasCliFlags(expanded)) {
    return [...expanded];
  }

  return mapPositionalToFlags(expanded, schema);
}

export function normalizeNpmScriptArgvWithPositionalParser(
  argv: readonly string[],
  parsePositional: (positionalArgv: readonly string[]) => string[],
): string[] {
  const expanded = expandEqualsStyleFlags(argv);

  if (hasCliFlags(expanded)) {
    return [...expanded];
  }

  return parsePositional(expanded);
}
