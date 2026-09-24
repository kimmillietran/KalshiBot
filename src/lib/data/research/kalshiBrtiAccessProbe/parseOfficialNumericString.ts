import type { OfficialNumericParse } from "./types";

/**
 * Narrow official-value parser. Preserves the original string.
 * Accepts plain decimals and US-style thousands separators (`79,604.96`).
 * Rejects European decimals, mixed separators, and ambiguous groups.
 */
export function parseOfficialNumericString(raw: string | null | undefined): OfficialNumericParse {
  if (raw == null) {
    return { kind: "empty", original: "" };
  }
  const original = raw;
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { kind: "empty", original };
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { kind: "ok", original, value: Number(trimmed), usedThousandsSeparators: false };
  }

  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(trimmed)) {
    const normalized = trimmed.replaceAll(",", "");
    return {
      kind: "ok",
      original,
      value: Number(normalized),
      usedThousandsSeparators: true,
    };
  }

  return {
    kind: "rejected",
    original,
    reason: "ambiguous-or-unsupported-numeric-format",
  };
}

export function roundUsdToTwoDecimals(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}
