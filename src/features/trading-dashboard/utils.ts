import { formatUsd } from "@/lib/utils/format";

type FormatMarketContractQuestionOptions = {
  noMarket?: boolean;
};

/**
 * Contract-style market header — describes the Kalshi settlement question
 * instead of mirroring Kalshi's short title verbatim.
 */
export function formatMarketContractQuestion(
  targetPrice: number,
  expirationFormatted: string,
  options: FormatMarketContractQuestionOptions = {},
): string {
  if (options.noMarket) {
    return "No active Kalshi BTC contract";
  }

  if (expirationFormatted === "—") {
    return `Will BTC settle above ${formatUsd(targetPrice)}?`;
  }

  return `Will BTC settle above ${formatUsd(targetPrice)} at ${expirationFormatted}?`;
}
