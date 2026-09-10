import type {
  MicrostructureDiagnosticEstimandId,
  MicrostructurePrimaryEstimandId,
} from "./microstructureEvidenceContractTypes";

export type ResponseObservability =
  | "observable"
  | "unobservable";

/**
 * Missing valid response quote is unobservable — never coerce to 0 cents.
 */
export function classifyResponseObservability(
  responseQuotePresent: boolean,
): ResponseObservability {
  return responseQuotePresent ? "observable" : "unobservable";
}

export function coerceMissingResponseToZeroCents(_missing: true): never {
  void _missing;
  throw new Error(
    "Missing microstructure response is unobservable and must not be treated as 0 cents.",
  );
}

export function buildMicrostructureEstimandContract(): {
  primaryEstimand: MicrostructurePrimaryEstimandId;
  primaryEstimandRationale: string;
  diagnosticEstimands: readonly MicrostructureDiagnosticEstimandId[];
  midpointAuthorization: "diagnostic-only";
  economicSupportRequiresExecutable: true;
} {
  return {
    primaryEstimand: "signed-one-contract-executable-horizon-response-cents",
    primaryEstimandRationale:
      "Promotion-facing economic evidence is the one-contract executable horizon result "
      + "(TOB ask / complement-book semantics), not midpoint drift alone.",
    diagnosticEstimands: [
      "signed-yes-mid-response-cents",
      "directional-response-share",
      "spread-change-cents",
    ],
    midpointAuthorization: "diagnostic-only",
    economicSupportRequiresExecutable: true,
  };
}

export function buildMicrostructureExecutionSemantics(): {
  fillModel: "one-contract-tob-observable-only";
  complementBookSemantics: string;
  derivedAskNotIndependent: true;
  executionObservabilityRequirement: string;
  observabilityLadder: readonly string[];
} {
  return {
    fillModel: "one-contract-tob-observable-only",
    complementBookSemantics:
      "YES ask = 100 - NO bid; YES ask size = NO bid size. Derived asks are not independent "
      + "exchange ask observations.",
    derivedAskNotIndependent: true,
    executionObservabilityRequirement:
      "Executable response must be observable at the response horizon for promotion-facing "
      + "economic evidence. Midpoint-only rows are diagnostic and cannot authorize economic support.",
    observabilityLadder: [
      "triggered episode",
      "observable response",
      "executable observable response",
      "independent usable outcome",
    ],
  };
}

export function midpointOnlyCannotAuthorizeEconomicSupport(input: {
  midpointResponseCents: number | null;
  executableResponseCents: number | null;
  executableObservable: boolean;
}): { economicSupportAuthorized: boolean; reason: string } {
  if (!input.executableObservable || input.executableResponseCents === null) {
    return {
      economicSupportAuthorized: false,
      reason: "Midpoint-only / non-executable evidence cannot authorize economic support.",
    };
  }
  return {
    economicSupportAuthorized: true,
    reason: "Executable one-contract observable response present.",
  };
}
