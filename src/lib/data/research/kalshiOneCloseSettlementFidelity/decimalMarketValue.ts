/**
 * Exact decimal-string arithmetic for Kalshi/CFB market values.
 * Avoids IEEE-754 === for equality of decimal prices and averages.
 */

export const DECLARED_DECIMAL_APPROX_TOLERANCE_RAW = "0.00000001" as const;

export type ParsedMarketDecimal = {
  /** Normalized without leading zeros in integer part (except "0"). */
  normalized: string;
  negative: boolean;
  /** Absolute significand as decimal digits with no radix point. */
  significand: bigint;
  /** Number of digits after the radix in significand. */
  scale: number;
};

export type DecimalComparison = {
  rawStringEqual: boolean;
  exactDecimalEqual: boolean;
  approximateEqual: boolean;
  approximateToleranceRaw: typeof DECLARED_DECIMAL_APPROX_TOLERANCE_RAW;
  /** Exact signed difference as a normalized decimal string (left − right), or null. */
  exactDiffRaw: string | null;
  /** Float approximation of the exact diff for legacy numeric reporting only. */
  approximateDiffNumber: number | null;
  diagnosticRound2HalfEvenEqual: boolean;
};

const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;

export function parseMarketDecimalString(raw: string | null | undefined): ParsedMarketDecimal | null {
  if (raw == null) {
    return null;
  }
  const trimmed = raw.trim();
  if (!PLAIN_DECIMAL.test(trimmed)) {
    return null;
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw.replace(/^0+(?=\d)/, "") || "0";
  const fracPart = fracPartRaw.replace(/0+$/, "");
  const scale = fracPart.length;
  const significand = BigInt(scale === 0 ? intPart : `${intPart}${fracPart}`);
  const normalized = formatFromParts(negative, significand, scale);
  return { normalized, negative, significand: negative ? -significand : significand, scale };
}

function formatFromParts(negative: boolean, absSignificand: bigint, scale: number): string {
  const digits = absSignificand.toString();
  let body: string;
  if (scale === 0) {
    body = digits;
  } else if (digits.length <= scale) {
    body = `0.${digits.padStart(scale, "0")}`;
  } else {
    const split = digits.length - scale;
    body = `${digits.slice(0, split)}.${digits.slice(split)}`;
  }
  // Trim trailing zeros in fractional part for normalized form, keep at least one int digit.
  if (body.includes(".")) {
    body = body.replace(/\.?0+$/, "");
    if (body.endsWith(".")) {
      body = body.slice(0, -1);
    }
    if (body === "" || body === "-") {
      body = "0";
    }
  }
  if (body === "0") {
    return "0";
  }
  return negative ? `-${body}` : body;
}

function withScale(value: ParsedMarketDecimal, scale: number): bigint {
  if (scale < value.scale) {
    throw new Error("withScale-cannot-reduce");
  }
  const factor = BigInt(10) ** BigInt(scale - value.scale);
  return value.significand * factor;
}

export function exactDecimalEqual(leftRaw: string, rightRaw: string): boolean {
  const left = parseMarketDecimalString(leftRaw);
  const right = parseMarketDecimalString(rightRaw);
  if (left == null || right == null) {
    return false;
  }
  const scale = Math.max(left.scale, right.scale);
  return withScale(left, scale) === withScale(right, scale);
}

export function exactDecimalDiffRaw(leftRaw: string, rightRaw: string): string | null {
  const left = parseMarketDecimalString(leftRaw);
  const right = parseMarketDecimalString(rightRaw);
  if (left == null || right == null) {
    return null;
  }
  const scale = Math.max(left.scale, right.scale);
  const diff = withScale(left, scale) - withScale(right, scale);
  const negative = diff < BigInt(0);
  return formatFromParts(negative, negative ? -diff : diff, scale);
}

export function approximateDecimalEqual(
  leftRaw: string,
  rightRaw: string,
  toleranceRaw: string = DECLARED_DECIMAL_APPROX_TOLERANCE_RAW,
): boolean {
  const diffRaw = exactDecimalDiffRaw(leftRaw, rightRaw);
  const tolerance = parseMarketDecimalString(toleranceRaw);
  if (diffRaw == null || tolerance == null) {
    return false;
  }
  const absDiff = parseMarketDecimalString(diffRaw.startsWith("-") ? diffRaw.slice(1) : diffRaw);
  if (absDiff == null) {
    return false;
  }
  const scale = Math.max(absDiff.scale, tolerance.scale);
  return withScale(absDiff, scale) <= withScale(tolerance, scale);
}

/** Diagnostic half-even to 2dp on an exact decimal string — not Kalshi's proven rule. */
export function roundHalfEven2DecimalString(raw: string): string | null {
  const parsed = parseMarketDecimalString(raw);
  if (parsed == null) {
    return null;
  }
  const scale = Math.max(parsed.scale, 3);
  const absParsed: ParsedMarketDecimal = {
    normalized: parsed.normalized,
    negative: false,
    significand: parsed.significand < BigInt(0) ? -parsed.significand : parsed.significand,
    scale: parsed.scale,
  };
  const absScaled = withScale(absParsed, scale);
  const unit = BigInt(10) ** BigInt(scale - 2); // one cent
  const half = unit / BigInt(2);
  const quotient = absScaled / unit;
  const remainder = absScaled % unit;
  let roundedCents = quotient;
  if (remainder > half) {
    roundedCents += BigInt(1);
  } else if (remainder === half && quotient % BigInt(2) !== BigInt(0)) {
    roundedCents += BigInt(1);
  }
  return formatFixed(parsed.negative, roundedCents, 2);
}

function formatFixed(negative: boolean, significand: bigint, scale: number): string {
  const digits = significand.toString().padStart(scale + 1, "0");
  const split = digits.length - scale;
  const body = `${digits.slice(0, split)}.${digits.slice(split)}`;
  return negative ? `-${body}` : body;
}

export function compareMarketDecimals(leftRaw: string, rightRaw: string): DecimalComparison {
  const rawStringEqual = leftRaw === rightRaw;
  const exact = exactDecimalEqual(leftRaw, rightRaw);
  const exactDiffRaw = exactDecimalDiffRaw(leftRaw, rightRaw);
  const approximateEqual = approximateDecimalEqual(leftRaw, rightRaw);
  const leftRound = roundHalfEven2DecimalString(leftRaw);
  const rightRound = roundHalfEven2DecimalString(rightRaw);
  return {
    rawStringEqual,
    exactDecimalEqual: exact,
    approximateEqual,
    approximateToleranceRaw: DECLARED_DECIMAL_APPROX_TOLERANCE_RAW,
    exactDiffRaw,
    approximateDiffNumber: exactDiffRaw == null ? null : Number(exactDiffRaw),
    diagnosticRound2HalfEvenEqual:
      leftRound != null && rightRound != null && leftRound === rightRound,
  };
}

/**
 * Exact mean of decimal strings via BigInt sum / count.
 * Result is formatted with up to `resultScale` fractional digits (trim trailing zeros
 * only when the omitted part is exactly zero; otherwise keep full resultScale).
 */
export function meanDecimalStrings(
  values: readonly string[],
  resultScale = 8,
): {
  meanRaw: string | null;
  count: number;
  parseFailures: number;
} {
  if (values.length === 0) {
    return { meanRaw: null, count: 0, parseFailures: 0 };
  }
  const parsed: ParsedMarketDecimal[] = [];
  let failures = 0;
  for (const value of values) {
    const item = parseMarketDecimalString(value);
    if (item == null) {
      failures += 1;
      continue;
    }
    parsed.push(item);
  }
  if (parsed.length === 0) {
    return { meanRaw: null, count: 0, parseFailures: failures };
  }
  const scale = Math.max(resultScale, ...parsed.map((item) => item.scale));
  let sum = BigInt(0);
  for (const item of parsed) {
    sum += withScale(item, scale);
  }
  const count = BigInt(parsed.length);
  // Long division to resultScale fractional digits with half-even on the next digit.
  const targetScale = resultScale;
  // sum/count in `scale` units → convert mean to targetScale.
  // mean_scaled_target = round_half_even(sum * 10^(targetScale) / (count * 10^(scale)))
  const numer = sum * (BigInt(10) ** BigInt(targetScale));
  const denom = count * (BigInt(10) ** BigInt(scale));
  const negative = numer < BigInt(0);
  const absNumer = negative ? -numer : numer;
  const quotient = absNumer / denom;
  const remainder = absNumer % denom;
  let rounded = quotient;
  const twiceRem = remainder * BigInt(2);
  if (twiceRem > denom) {
    rounded = quotient + BigInt(1);
  } else if (twiceRem === denom && quotient % BigInt(2) !== BigInt(0)) {
    rounded = quotient + BigInt(1);
  }
  const meanRaw = formatFixed(negative, rounded, targetScale);
  return { meanRaw, count: parsed.length, parseFailures: failures };
}
