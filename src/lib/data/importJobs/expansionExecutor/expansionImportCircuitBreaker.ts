export const EXPANSION_IMPORT_CIRCUIT_BREAKER_WINDOW = 50;
export const EXPANSION_IMPORT_CIRCUIT_BREAKER_THRESHOLD = 0.9;

export type ExpansionImportFailureClass =
  | "import-compatibility"
  | "rate-limit"
  | "other";

export type ExpansionImportCircuitBreakerObservation = {
  marketTicker: string;
  failureClass: ExpansionImportFailureClass;
  errorMessage: string;
};

export type ExpansionImportCircuitBreakerState = {
  observations: ExpansionImportCircuitBreakerObservation[];
};

export type ExpansionImportCircuitBreakerTrip = {
  failureClass: ExpansionImportFailureClass;
  affectedCount: number;
  windowSize: number;
  failureRate: number;
  firstFailingTickers: readonly string[];
  suggestedNextAction: string;
};

export function classifyExpansionImportFailure(errorMessage: string): ExpansionImportFailureClass {
  const normalized = errorMessage.toLowerCase();

  if (
    normalized.includes("(429)")
    || normalized.includes("rate limit")
    || normalized.includes("too many requests")
  ) {
    return "rate-limit";
  }

  if (
    normalized.includes("missing required fields")
    || normalized.includes("kalshi historical market response missing")
    || normalized.includes("import-compatibility")
    || normalized.includes("incompatible")
  ) {
    return "import-compatibility";
  }

  return "other";
}

export function createExpansionImportCircuitBreakerState(): ExpansionImportCircuitBreakerState {
  return { observations: [] };
}

export function recordExpansionImportCircuitBreakerFailure(
  state: ExpansionImportCircuitBreakerState,
  marketTicker: string,
  errorMessage: string,
): ExpansionImportCircuitBreakerState {
  return {
    observations: [
      ...state.observations,
      {
        marketTicker,
        failureClass: classifyExpansionImportFailure(errorMessage),
        errorMessage,
      },
    ],
  };
}

function buildSuggestedNextAction(failureClass: ExpansionImportFailureClass): string {
  if (failureClass === "import-compatibility") {
    return "Inspect saved kalshi-market debug artifacts under data/debug/, compare list vs detail endpoint schemas, and filter expansion discovery to import-compatible markets before executing bulk imports.";
  }

  return "Review expansion import summary and checkpoint artifacts before retrying.";
}

export function formatExpansionImportCircuitBreakerWarning(
  trip: ExpansionImportCircuitBreakerTrip,
): string {
  const tickers = trip.firstFailingTickers.join(", ");
  return [
    `Expansion import aborted by failure-rate circuit breaker after ${trip.affectedCount}/${trip.windowSize} attempts (${Math.round(trip.failureRate * 100)}%) failed with ${trip.failureClass} errors.`,
    `First failing tickers: ${tickers}.`,
    trip.suggestedNextAction,
  ].join(" ");
}

export function evaluateExpansionImportCircuitBreaker(
  state: ExpansionImportCircuitBreakerState,
  options?: {
    windowSize?: number;
    threshold?: number;
  },
): ExpansionImportCircuitBreakerTrip | null {
  const windowSize = options?.windowSize ?? EXPANSION_IMPORT_CIRCUIT_BREAKER_WINDOW;
  const threshold = options?.threshold ?? EXPANSION_IMPORT_CIRCUIT_BREAKER_THRESHOLD;
  const window = state.observations.slice(0, windowSize);

  if (window.length < windowSize) {
    return null;
  }

  const compatibilityFailures = window.filter(
    (entry) => entry.failureClass === "import-compatibility",
  );

  if (compatibilityFailures.length / window.length < threshold) {
    return null;
  }

  const firstFailingTickers = compatibilityFailures
    .slice(0, 5)
    .map((entry) => entry.marketTicker);

  return {
    failureClass: "import-compatibility",
    affectedCount: compatibilityFailures.length,
    windowSize,
    failureRate: compatibilityFailures.length / window.length,
    firstFailingTickers,
    suggestedNextAction: buildSuggestedNextAction("import-compatibility"),
  };
}
