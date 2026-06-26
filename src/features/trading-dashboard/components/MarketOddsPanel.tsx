import { MetricCard } from "@/components/common/MetricCard";
import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  labelClass,
  statGap,
  surfaces,
  textContractPrice,
  toneClasses,
} from "@/lib/design-system";
import { formatCents } from "@/lib/utils/format";
import type { ContractOdds } from "@/features/mock-data";
import { cn } from "@/lib/utils";

type MarketOddsPanelProps = {
  up: ContractOdds;
  down: ContractOdds;
  liquidityQuality: string;
};

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

export function MarketOddsPanel({
  up,
  down,
  liquidityQuality,
}: MarketOddsPanelProps) {
  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="Kalshi Market Odds"
        subtitle="BTC 15m · above/below target"
        action={
          <StatusBadge variant="success" dot>
            Liquidity: {liquidityQuality}
          </StatusBadge>
        }
      />
      <PanelBody className={cn("space-y-3")}>
        <ContractCard contract={up} tone="up" />
        <ContractCard contract={down} tone="down" />
        <div className={cn("grid grid-cols-2 pt-1", statGap)}>
          <MetricCard label="Combined" value="101¢" subValue="overround ~1%" />
          <MetricCard
            label="Best Edge Side"
            value="UP"
            subValue="63¢ vs 74¢ fair"
            tone="bullish"
          />
        </div>
      </PanelBody>
    </GlassPanel>
  );
}
