import { BANKROLL_MODEL_VERSION } from "./config";
import type { BankrollConfig, ResolvedBankroll } from "./types";

type BankrollValidationFailure =
  | "missing"
  | "not_finite"
  | "non_positive";

function validateBankrollDollars(
  value: number | null | undefined,
): { valid: true; bankrollDollars: number } | { valid: false; reason: BankrollValidationFailure } {
  if (value === undefined || value === null) {
    return { valid: false, reason: "missing" };
  }

  if (!Number.isFinite(value)) {
    return { valid: false, reason: "not_finite" };
  }

  if (value <= 0) {
    return { valid: false, reason: "non_positive" };
  }

  return { valid: true, bankrollDollars: value };
}

function formatDollars(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function buildReasoning(
  configured: boolean,
  bankrollDollars: number | null,
  failure: BankrollValidationFailure | null,
): readonly string[] {
  if (configured && bankrollDollars !== null) {
    return [
      `configured=true bankroll=${formatDollars(bankrollDollars)}`,
      "Valid bankroll available for Kelly dollar sizing.",
    ];
  }

  const reasonLine =
    failure === "missing"
      ? "No bankroll supplied — dollar sizing omitted."
      : failure === "not_finite"
        ? "Bankroll must be a finite number — dollar sizing omitted."
        : "Bankroll must be greater than zero — dollar sizing omitted.";

  return ["configured=false", reasonLine];
}

/**
 * Validates optional bankroll configuration for Kelly dollar sizing.
 * Never invents a default bankroll.
 */
export function resolveBankroll(config: BankrollConfig = {}): ResolvedBankroll {
  const result = validateBankrollDollars(config.bankrollDollars);

  if (!result.valid) {
    return {
      bankrollDollars: null,
      configured: false,
      reasoning: buildReasoning(false, null, result.reason),
      modelVersion: BANKROLL_MODEL_VERSION,
    };
  }

  return {
    bankrollDollars: result.bankrollDollars,
    configured: true,
    reasoning: buildReasoning(true, result.bankrollDollars, null),
    modelVersion: BANKROLL_MODEL_VERSION,
  };
}

export { BANKROLL_MODEL_VERSION } from "./config";

export type { BankrollConfig, ResolvedBankroll } from "./types";
