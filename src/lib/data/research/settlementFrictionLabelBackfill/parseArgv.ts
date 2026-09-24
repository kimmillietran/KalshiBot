import {
  DEFAULT_FRICTION_SAMPLES_PATH,
  DEFAULT_LABEL_BACKFILL_IMPORTS_DIR,
  DEFAULT_LABEL_BACKFILL_WORK_DIR,
  DEFAULT_LABEL_COVERAGE_REFRESH_OUT_DIR,
  SettlementFrictionLabelBackfillError,
} from "./types";

export type ParsedLabelBackfillArgv = {
  samplesPath: string;
  workDir: string;
  importsDir: string;
  checkpointPath: string;
  labelsOutPath: string;
  coverageOutDir: string;
  dryRun: boolean;
  fixture: boolean;
  skipFetch: boolean;
  skipCoverageRefresh: boolean;
  concurrency: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  limit: number | null;
};

function argValue(argv: readonly string[], name: string): string | null {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  return argv[i + 1] ?? null;
}

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}

function parsePositiveInt(raw: string | null, fallback: number, name: string): number {
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new SettlementFrictionLabelBackfillError(`${name} must be a positive integer`);
  }
  return n;
}

export function parseSettlementFrictionLabelBackfillArgv(
  argv: readonly string[],
): ParsedLabelBackfillArgv {
  const fixture = hasFlag(argv, "--fixture");
  const workDir = argValue(argv, "--work-dir")
    ?? (fixture
      ? "src/lib/data/research/settlementFrictionLabelBackfill/fixtures/work"
      : DEFAULT_LABEL_BACKFILL_WORK_DIR);
  const importsDir = argValue(argv, "--imports-dir")
    ?? (fixture
      ? `${workDir}/imports`
      : DEFAULT_LABEL_BACKFILL_IMPORTS_DIR);
  const checkpointPath = argValue(argv, "--checkpoint")
    ?? `${workDir}/label-backfill-checkpoint.json`;
  const labelsOutPath = argValue(argv, "--labels-out")
    ?? `${workDir}/settlement-labels.jsonl`;
  const coverageOutDir = argValue(argv, "--coverage-out-dir")
    ?? (fixture
      ? `${workDir}/coverage-refresh`
      : DEFAULT_LABEL_COVERAGE_REFRESH_OUT_DIR);
  const samplesPath = argValue(argv, "--samples-jsonl")
    ?? (fixture
      ? "src/lib/data/research/settlementFrictionLabelBackfill/fixtures/samples.jsonl"
      : DEFAULT_FRICTION_SAMPLES_PATH);

  const limitRaw = argValue(argv, "--limit");
  let limit: number | null = null;
  if (limitRaw != null) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 0) {
      throw new SettlementFrictionLabelBackfillError("--limit must be a non-negative integer");
    }
    limit = n;
  }

  return {
    samplesPath,
    workDir,
    importsDir,
    checkpointPath,
    labelsOutPath,
    coverageOutDir,
    dryRun: hasFlag(argv, "--dry-run"),
    fixture,
    skipFetch: hasFlag(argv, "--skip-fetch"),
    skipCoverageRefresh: hasFlag(argv, "--skip-coverage-refresh"),
    concurrency: parsePositiveInt(argValue(argv, "--concurrency"), 4, "--concurrency"),
    maxRetries: parsePositiveInt(argValue(argv, "--max-retries"), 3, "--max-retries"),
    retryBaseDelayMs: parsePositiveInt(
      argValue(argv, "--retry-base-delay-ms"),
      1_000,
      "--retry-base-delay-ms",
    ),
    limit,
  };
}
