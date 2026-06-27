"use client";

import { Bitcoin, Clock, Timer } from "lucide-react";

import { StatusBadge } from "@/components/common/StatusBadge";
import { GlassPanel } from "@/components/common/GlassPanel";
import {
  FeedStatusBadge,
  LivePrice,
  useBtcPrice,
} from "@/features/btc-feed";
import { formatFeedTime, formatSignedDistance } from "@/features/btc-feed/utils";
import {
  MarketStatusBadge,
  FALLBACK_MARKET_TICKER,
  useActiveBtcMarket,
} from "@/features/market-data";
import { formatMarketContractQuestion } from "@/features/trading-dashboard/utils";
import {
  iconSize,
  labelClass,
  panelGap,
  panelPadding,
  surfaces,
  textCommandPrice,
  textMonoValue,
  textSectionValue,
  toneClasses,
} from "@/lib/design-system";
import { formatPercent, formatUsd } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export function CommandBar() {
  const btc = useBtcPrice();
  const market = useActiveBtcMarket();
  const isPositive = btc.change24hPercent >= 0;
  const isLoading = btc.status === "loading";

  const marketQuestion = formatMarketContractQuestion(
    btc.targetPrice,
    market.expirationFormatted,
    { noMarket: market.noMarket },
  );

  return (
    <GlassPanel
      variant="elevated"
      className={cn(
        "flex flex-col lg:flex-row lg:items-center lg:justify-between",
        panelPadding,
        panelGap,
      )}
    >
      <div className={cn("flex flex-wrap items-center", panelGap)}>
        <div className="flex items-center gap-2">
          <Bitcoin className={cn("text-primary", iconSize.lg)} />
          <div>
            <p className={labelClass()}>BTC / USD</p>
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading BTC price…</p>
            ) : (
              <LivePrice direction={btc.direction} className={textCommandPrice}>
                {formatUsd(btc.price)}
              </LivePrice>
            )}
          </div>
        </div>

        <StatusBadge variant={isPositive ? "success" : "danger"}>
          {isPositive ? "+" : ""}
          {formatPercent(btc.change24hPercent)} 24h
        </StatusBadge>

        <FeedStatusBadge status={btc.status} />

        <MarketStatusBadge
          status={market.feedStatus}
          lifecycle={market.lifecycle}
        />
      </div>

      <div className={cn("flex flex-wrap items-center gap-3 lg:gap-6")}>
        <div>
          <p className={labelClass()}>Contract</p>
          <p className={textSectionValue}>{marketQuestion}</p>
          {!market.noMarket && market.ticker !== FALLBACK_MARKET_TICKER ? (
            <p className="text-muted-foreground text-xs">{market.ticker}</p>
          ) : null}
        </div>

        <div className={cn("hidden h-8 sm:block", surfaces.verticalDivider)} />

        <div className="flex items-center gap-2">
          <Timer className={cn("text-muted-foreground", iconSize.md)} />
          <div>
            <p className={labelClass()}>Expires</p>
            <p className={textMonoValue}>
              {market.isLoading ? "—" : market.expirationFormatted}{" "}
              {!market.noMarket ? (
                <span className={toneClasses.bullish.text}>
                  ({market.timeRemainingFormatted})
                </span>
              ) : null}
            </p>
          </div>
        </div>

        <div className={cn("hidden h-8 md:block", surfaces.verticalDivider)} />

        <div>
          <p className={labelClass()}>Target</p>
          <p className={textMonoValue}>
            {formatUsd(btc.targetPrice)}{" "}
            <span
              className={
                btc.isAboveTarget
                  ? toneClasses.bullish.text
                  : toneClasses.bearish.text
              }
            >
              ({formatSignedDistance(btc.distanceFromTarget)} ·{" "}
              {formatPercent(btc.distancePercent, true)})
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Clock className={cn("text-muted-foreground", iconSize.md)} />
          <div>
            <p className={labelClass()}>Updated</p>
            <p className="text-muted-foreground text-xs">
              {btc.lastUpdated
                ? formatFeedTime(btc.lastUpdated)
                : btc.errorMessage ?? "—"}
            </p>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}
