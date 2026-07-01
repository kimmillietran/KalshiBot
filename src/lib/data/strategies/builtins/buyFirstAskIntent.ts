import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import type { TradeIntent } from "@/lib/data/backtesting/strategyTypes";

/** Emits a single YES buy at the step ask when pricing is available. */
export function buyFirstAskIntent(step: ReplayStepResult): TradeIntent[] {
  const yesAskCents = step.engineInput.pricing?.yesAskCents;
  if (yesAskCents === null || yesAskCents === undefined) {
    return [];
  }

  return [
    {
      ticker: step.sourceTicker,
      side: "yes",
      action: "buy",
      quantity: 1,
      limitPriceCents: yesAskCents,
      reason: "buy-first-ask",
    },
  ];
}
