import { StatusBadge } from "@/components/common/StatusBadge";
import { labelClass, metricClass, surfaces } from "@/lib/design-system";
import type { ExpectedValueEstimate } from "@/lib/trading/expected-value/types";
import { cn } from "@/lib/utils";

import { EXPECTED_VALUE_UNAVAILABLE_MESSAGE } from "../../constants";
import {
  formatConfidencePercent,
  formatSignedCents,
  formatSignedEdgePercent,
} from "../../formatting/decisionDisplay";
import { UnavailableMetric } from "./UnavailableMetric";

type ExpectedValueSummaryProps = {
  expectedValue: ExpectedValueEstimate | null;
};

function EvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={metricClass()}>{value}</span>
    </div>
  );
}

export function ExpectedValueSummary({ expectedValue }: ExpectedValueSummaryProps) {
  if (!expectedValue) {
    return <UnavailableMetric message={EXPECTED_VALUE_UNAVAILABLE_MESSAGE} />;
  }

  const bestSideLabel =
    expectedValue.bestSide === null
      ? "none"
      : expectedValue.bestSide.toUpperCase();

  return (
    <div className={cn(surfaces.inset, "space-y-2 px-3 py-3")}>
      <div className="flex items-center justify-between gap-2">
        <p className={labelClass()}>Expected value</p>
        <StatusBadge variant="neutral">best {bestSideLabel}</StatusBadge>
      </div>
      <EvRow label="Net EV UP" value={formatSignedCents(expectedValue.netEvYesCents)} />
      <EvRow label="Net EV DOWN" value={formatSignedCents(expectedValue.netEvNoCents)} />
      <EvRow label="Edge UP" value={formatSignedEdgePercent(expectedValue.edgeYesPercent)} />
      <EvRow label="Edge DOWN" value={formatSignedEdgePercent(expectedValue.edgeNoPercent)} />
      <EvRow
        label="Best net EV"
        value={formatSignedCents(expectedValue.bestEvCents)}
      />
      <EvRow
        label="EV confidence"
        value={formatConfidencePercent(expectedValue.confidence)}
      />
    </div>
  );
}
