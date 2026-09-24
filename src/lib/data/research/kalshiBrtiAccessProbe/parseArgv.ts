import {
  DEFAULT_PROBE_OUT_DIR,
  DEFAULT_PROBE_RAW_DIR,
  KalshiBrtiAccessProbeError,
  LIVE_DURATION_SECONDS,
  LIVE_MESSAGE_CAP,
  MAX_HTTP_REQUESTS,
  MAX_RETRIES_PER_REQUEST,
  type ParsedProbeArgv,
} from "./types";

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new KalshiBrtiAccessProbeError(`missing value for ${flag}`);
  }
  return value;
}

function readNumber(argv: readonly string[], flag: string, fallback: number): number {
  const raw = readFlagValue(argv, flag);
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new KalshiBrtiAccessProbeError(`${flag} must be a non-negative integer`);
  }
  return parsed;
}

export function parseKalshiBrtiAccessProbeArgv(argv: readonly string[]): ParsedProbeArgv {
  if (argv.includes("--skip-fetch")) {
    throw new KalshiBrtiAccessProbeError(
      "--skip-fetch is parsed elsewhere but not implemented; do not use it as a network guard",
    );
  }
  const liveDurationSeconds = readNumber(argv, "--live-duration-seconds", LIVE_DURATION_SECONDS);
  const liveMessageCap = readNumber(argv, "--live-message-cap", LIVE_MESSAGE_CAP);
  const maxHttpRequests = readNumber(argv, "--max-http-requests", MAX_HTTP_REQUESTS);
  if (liveDurationSeconds > LIVE_DURATION_SECONDS) {
    throw new KalshiBrtiAccessProbeError("live duration may not exceed 90 seconds");
  }
  if (liveMessageCap > LIVE_MESSAGE_CAP) {
    throw new KalshiBrtiAccessProbeError("live message cap may not exceed 600");
  }
  if (maxHttpRequests > MAX_HTTP_REQUESTS) {
    throw new KalshiBrtiAccessProbeError("HTTP budget may not exceed 10 requests");
  }
  return {
    fixture: argv.includes("--fixture") || argv.includes("--dry-run"),
    skipLive: argv.includes("--skip-live"),
    skipHttp: argv.includes("--skip-http"),
    skipLatest: argv.includes("--skip-latest"),
    outDir: readFlagValue(argv, "--out-dir") ?? DEFAULT_PROBE_OUT_DIR,
    rawDir: readFlagValue(argv, "--raw-dir") ?? DEFAULT_PROBE_RAW_DIR,
    maxHttpRequests,
    maxRetriesPerRequest: readNumber(argv, "--max-retries", MAX_RETRIES_PER_REQUEST),
    liveDurationSeconds,
    liveMessageCap,
  };
}
