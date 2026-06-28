import {
  assessLiquidityQuality,
  computeMidCents,
  computeSpreadCents,
} from "../pricing";
import type { MarketContractPricing } from "../types";
import type { OrderbookTopOfBook } from "./types";

function mapSide(top: OrderbookTopOfBook, side: "yes" | "no") {
  const bidCents = side === "yes" ? top.yesBidCents : top.noBidCents;
  const askCents = side === "yes" ? top.yesAskCents : top.noAskCents;

  return {
    bidCents,
    askCents,
    midCents: computeMidCents(bidCents, askCents),
    lastCents: null,
    spreadCents: computeSpreadCents(bidCents, askCents),
  };
}

/** Maps deterministic top-of-book quotes into dashboard contract pricing. */
export function mapTopOfBookToContractPricing(
  top: OrderbookTopOfBook,
  updatedAt: string,
): MarketContractPricing {
  const yes = mapSide(top, "yes");

  return {
    yes,
    no: mapSide(top, "no"),
    volumeLabel: "—",
    liquidityQuality: assessLiquidityQuality(undefined, yes.spreadCents),
    updatedAt,
    isFallback: false,
    source: "kalshi",
  };
}
