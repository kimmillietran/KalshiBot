const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdCompactFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatUsd(value: number, compact = false): string {
  return compact
    ? usdCompactFormatter.format(value)
    : usdFormatter.format(value);
}

export function formatPercent(value: number, signed = false): string {
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(value < 1 ? 3 : 2)}%`;
}

export function formatCents(value: number): string {
  return `${value}¢`;
}

export function formatSignedUsd(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${formatUsd(value)}`;
}
