/** Explicit safety guard: capture spike must never import order placement clients. */
export const FORBIDDEN_ORDER_CLIENT_IMPORTS = [
  "placeOrder",
  "submitOrder",
  "createOrder",
  "OrderExecutor",
  "TradeExecutor",
  "BacktestStrategyRunner",
] as const;

export function assertCaptureSpikeSafety(sourceText: string): void {
  for (const forbidden of FORBIDDEN_ORDER_CLIENT_IMPORTS) {
    if (sourceText.includes(forbidden)) {
      throw new Error(`Capture spike safety violation: forbidden symbol ${forbidden}`);
    }
  }
}
