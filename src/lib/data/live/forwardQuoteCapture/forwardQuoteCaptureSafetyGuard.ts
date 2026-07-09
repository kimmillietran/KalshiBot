/** Explicit safety guard: forward capture must never import order placement clients. */
export const FORBIDDEN_ORDER_CLIENT_IMPORTS = [
  "placeOrder",
  "submitOrder",
  "createOrder",
  "OrderExecutor",
  "TradeExecutor",
  "BacktestStrategyRunner",
] as const;

export function assertForwardCaptureSafety(sourceText: string): void {
  for (const forbidden of FORBIDDEN_ORDER_CLIENT_IMPORTS) {
    if (sourceText.includes(forbidden)) {
      throw new Error(`Forward capture safety violation: forbidden symbol ${forbidden}`);
    }
  }
}
