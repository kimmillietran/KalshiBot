"use client";

import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useActiveBtcMarket } from "@/features/market-data";
import { FALLBACK_MARKET_STATUS } from "@/features/market-data/fallback";
import type { ContractOdds } from "@/features/mock-data/types";
import {
  labelClass,
  statGap,
  surfaces,
  textContractPrice,
  toneClasses,
} from "@/lib/design-system";
import { formatCents } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

function ContractCard({
  contract,
  tone,
}: {
  contract: ContractOdds;
  tone: "up" | "down";
}) {
  const isUp = tone === "up";
  const toneStyle = isUp ? toneClasses.bullish : toneClasses.bearish;
  const surface = isUp ? surfaces.bullish : surfaces.bearish;

  return (
    <div className={cn(surface, "p-3")}>
      <div className="mb-2 flex items-center justify-between">
        <span className={cn("text-xs font-bold uppercase tracking-wider", toneStyle.text)}>
          {contract.label} Contract
        </span>
        <StatusBadge variant={isUp ? "success" : "danger"}>
          {contract.impliedProbability}% implied
        </StatusBadge>
      </div>

      <p className={cn(textContractPrice, toneStyle.text)}>
        {formatCents(contract.price)}
      </p>

      <div className={cn("mt-3 grid grid-cols-3 text-center", statGap)}>
        {(["Bid", "Ask", "Spread"] as const).map((field, i) => {
          const values = [contract.bid, contract.ask, contract.spread];
          return (
            <div key={field}>
              <p className={labelClass()}>{field}</p>
              <p className="font-mono text-sm font-semibold">
                {formatCents(values[i])}
              </p>
            </div>
          );
        })}
      </div>

      <p className="text-muted-foreground mt-2 text-xs">
        Volume:{" "}
        <span className="text-foreground font-medium">{contract.volume}</span>
      </p>
    </div>
  );
}

export function MarketOddsPanel() {
  const {
    contractOdds,
    pricing,
    isFallback,
    pricingIsStale,
    isLoading,
    noMarket,
  } = useActiveBtcMarket();

  if (isLoading || noMarket || !contractOdds || !pricing) {
    return (
      <GlassPanel className="h-full">
        <PanelHeader title="Kalshi Market Odds" subtitle="BTC 15m · above/below target" />
        <PanelBody>
          <p className="text-muted-foreground text-sm">
            {isLoading ? "Loading contract pricing…" : "No active market odds available."}
          </p>
        </PanelBody>
      </GlassPanel>
    );
  }

  const liquidityLabel = isFallback
    ? `${FALLBACK_MARKET_STATUS} · ${pricing.liquidityQuality}`
    : pricingIsStale
      ? `STALE · ${pricing.liquidityQuality}`
      : `Liquidity: ${pricing.liquidityQuality}`;

  const badgeVariant = isFallback ? "warning" : pricingIsStale ? "warning" : "success";

  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="Kalshi Market Odds"
        subtitle="BTC 15m · above/below target"
        action={
          <StatusBadge variant={badgeVariant} dot>
            {liquidityLabel}
          </StatusBadge>
        }
      />
      <PanelBody className={cn("space-y-3")}>
        <ContractCard contract={contractOdds.up} tone="up" />
        <ContractCard contract={contractOdds.down} tone="down" />
        <p className={cn(labelClass(), "pt-1 text-center normal-case")}>
          Live bid/ask/spread from Kalshi. Model edge appears in Probability &amp; Edge.
        </p>
      </PanelBody>
    </GlassPanel>
  );
}
