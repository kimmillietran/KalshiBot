import { parseKalshiDollarToCents } from "../pricing";
import type { OrderbookLevel, OrderbookState, OrderbookTopOfBook } from "./types";

function bestBidCents(levels: readonly OrderbookLevel[]): number | null {
  let best: number | null = null;

  for (const [priceDollars, quantityFp] of levels) {
    const quantity = Number.parseFloat(quantityFp);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }

    const cents = parseKalshiDollarToCents(priceDollars);
    if (cents == null) {
      continue;
    }

    if (best == null || cents > best) {
      best = cents;
    }
  }

  return best;
}

function complementAskCents(oppositeBidCents: number | null): number | null {
  if (oppositeBidCents == null) {
    return null;
  }
  return Math.max(100 - oppositeBidCents, 0);
}

/** Derives deterministic best bid/ask from in-memory orderbook state. */
export function extractTopOfBook(state: OrderbookState): OrderbookTopOfBook {
  const yesLevels = Object.entries(state.yesLevels).map(
    ([priceDollars, quantityFp]) => [priceDollars, quantityFp] as OrderbookLevel,
  );
  const noLevels = Object.entries(state.noLevels).map(
    ([priceDollars, quantityFp]) => [priceDollars, quantityFp] as OrderbookLevel,
  );

  const yesBidCents = bestBidCents(yesLevels);
  const noBidCents = bestBidCents(noLevels);

  return {
    yesBidCents,
    yesAskCents: complementAskCents(noBidCents),
    noBidCents,
    noAskCents: complementAskCents(yesBidCents),
  };
}
