export class OperatorCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperatorCliError";
  }
}

export function readFlagValue(
  argv: readonly string[],
  flag: string,
): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new OperatorCliError(`Missing value for ${flag}`);
  }
  return value;
}

export function readNumberFlag(
  argv: readonly string[],
  flag: string,
): number | undefined {
  const raw = readFlagValue(argv, flag);
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new OperatorCliError(`${flag} must be a finite number (got ${raw})`);
  }
  return parsed;
}

export function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

export function assertNoForbiddenFlags(
  argv: readonly string[],
  forbidden: readonly string[],
): void {
  for (const flag of forbidden) {
    if (argv.includes(flag)) {
      throw new OperatorCliError(
        `${flag} is not supported: operator safety gates cannot be skipped.`,
      );
    }
  }
}

export function collectUnknownFlags(
  argv: readonly string[],
  known: ReadonlySet<string>,
): string[] {
  const unknown: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      continue;
    }
    if (!known.has(token)) {
      unknown.push(token);
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      index += 1;
    }
  }
  return unknown;
}
