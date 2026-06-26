"use client";

import { Bell, Bitcoin, Search, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedStatusBadge, LivePrice, useBtcPrice } from "@/features/btc-feed";
import { iconSize, toneClasses } from "@/lib/design-system";
import { formatPercent, formatUsd } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export function Topbar() {
  const btc = useBtcPrice();
  const isPositive = btc.change24hPercent >= 0;

  return (
    <header className="bg-background/80 sticky top-0 z-10 flex h-14 items-center gap-4 border-b px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <Bitcoin className={cn("text-primary", iconSize.lg)} />
        <span className="font-heading text-sm font-semibold">BTC Edge</span>
      </div>

      <div className="text-muted-foreground hidden items-center gap-2 text-sm md:flex">
        <Bitcoin className={iconSize.md} />
        {btc.status === "loading" ? (
          <span className="text-xs">Loading BTC…</span>
        ) : (
          <LivePrice direction={btc.direction} className="font-mono text-foreground">
            {formatUsd(btc.price)}
          </LivePrice>
        )}
        <Badge
          variant="secondary"
          className={
            isPositive ? toneClasses.bullish.text : toneClasses.bearish.text
          }
        >
          {formatPercent(btc.change24hPercent, true)}
        </Badge>
        <FeedStatusBadge status={btc.status} />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Search" disabled>
          <Search className={iconSize.md} />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notifications" disabled>
          <Bell className={iconSize.md} />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Account" disabled>
          <User className={iconSize.md} />
        </Button>
      </div>
    </header>
  );
}
