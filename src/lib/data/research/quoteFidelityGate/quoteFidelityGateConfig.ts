import type { QuoteFidelityGateConfig } from "./quoteFidelityGateTypes";

export const QUOTE_FIDELITY_GATE_DISCLAIMER =
  "Quote fidelity and ladder feasibility gate only. This report determines whether the current KXBTC15M historical corpus can support executable static no-arb or cross-strike ladder research. This is not an alpha test and does not authorize live trading.";

export const QUOTE_FIDELITY_GATE_CAVEATS = [
  "This report is a feasibility gate, not an alpha test.",
  "A blocked verdict is a valid result.",
  "Close-only historical quotes cannot prove executable arbitrage.",
  "Zero-spread synthesized quotes must not be treated as fillable bid/ask.",
  "Volume and open interest are not displayed depth at the touch.",
  "No live latency, queue, or partial-fill modeling is included.",
  "Cross-strike no-arb requires multi-strike co-expiring markets; one strike per event blocks ladder research.",
] as const;

export const DEFAULT_QUOTE_FIDELITY_GATE_CONFIG: QuoteFidelityGateConfig = {
  seriesTicker: "KXBTC15M",
  highLiveCloseOnlyShareThreshold: 0.9,
  highZeroSpreadShareThreshold: 0.9,
  fixtureSampleSize: 5,
  researchOutputSampleSize: 0,
};

export function createQuoteFidelityGateConfig(
  overrides?: Partial<QuoteFidelityGateConfig>,
): QuoteFidelityGateConfig {
  return {
    ...DEFAULT_QUOTE_FIDELITY_GATE_CONFIG,
    ...overrides,
  };
}
