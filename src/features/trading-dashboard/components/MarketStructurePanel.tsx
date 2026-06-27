import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { surfaces, textCaption } from "@/lib/design-system";
import type { TradingMockData } from "@/features/mock-data";
import { cn } from "@/lib/utils";

import { MODEL_NOT_LIVE_LABEL } from "../constants";

type MarketStructurePanelProps = {
  data: TradingMockData["structure"];
};

type StructureRowProps = {
  label: string;
  value: string;
  variant?: "success" | "danger" | "warning" | "info" | "neutral";
};

function StructureRow({
  label,
  value,
  variant = "neutral",
}: StructureRowProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 py-2.5 last:border-0",
        surfaces.rowDivider,
      )}
    >
      <span className="text-muted-foreground shrink-0 text-xs">{label}</span>
      <StatusBadge variant={variant} className="text-right normal-case">
        {value}
      </StatusBadge>
    </div>
  );
}

export function MarketStructurePanel({ data }: MarketStructurePanelProps) {
  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="Market Structure"
        subtitle={MODEL_NOT_LIVE_LABEL}
        action={
          <StatusBadge variant="neutral" emphasis>
            Preview
          </StatusBadge>
        }
      />
      <PanelBody>
        <div className={cn(surfaces.dashedEmpty, "mb-3 px-3 py-2 text-center")}>
          <p className={cn(textCaption)}>
            Technical structure labels below are static demo data — not a live read.
          </p>
        </div>
        <StructureRow label="Trend" value={data.trend} variant="success" />
        <StructureRow
          label="Momentum"
          value={data.momentum}
          variant="success"
        />
        <StructureRow
          label="Structure"
          value={data.structure}
          variant="info"
        />
        <StructureRow
          label="Volatility"
          value={data.volatility}
          variant="warning"
        />
        <StructureRow
          label="Target Behavior"
          value={data.targetBehavior}
          variant="success"
        />
        <StructureRow
          label="Pattern"
          value={data.patternDetected}
          variant="info"
        />
        <div className={cn(surfaces.warning, "mt-3 px-3 py-2")}>
          <p className="text-label text-warning">Risk Warning</p>
          <p className={cn(textCaption, "mt-1")}>{data.riskWarning}</p>
        </div>
      </PanelBody>
    </GlassPanel>
  );
}
