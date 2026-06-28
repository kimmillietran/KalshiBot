# PR-6.4C — Live Kalshi Market Data Feed

## Summary

Milestone 6.4C replaces high-frequency odds polling with a deterministic Kalshi orderbook feed built on WebSocket deltas, with REST used only for initial hydration, resync, and fallback.

No trading decisions, execution, or engine changes.

## Architecture

| Layer | Responsibility |
|---|---|
| `orderbook/orderbookReducer.ts` | Snapshot + delta application into in-memory levels |
| `orderbook/topOfBook.ts` | Best bid/ask extraction (binary complement for asks) |
| `orderbook/sequenceTracker.ts` | Monotonic `seq` validation |
| `orderbook/OrderbookSubscriptionManager.ts` | `orderbook_delta` subscribe/unsubscribe/snapshot commands |
| `orderbook/KalshiOrderbookWsClient.ts` | Injectable WebSocket transport (+ mock for tests) |
| `orderbook/OrderbookFeedController.ts` | REST hydrate, WS deltas, stale detection, reconnect/resync |
| `hooks/useOrderbookFeed.ts` | React subscription for dashboard pricing |
| `api/kalshiServer.ts` | REST `GET /markets/{ticker}/orderbook` |
| `api/kalshi/markets/orderbook/route.ts` | BFF snapshot endpoint |

## Feed policy

1. **Start / ticker change:** REST snapshot via BFF → in-memory book; sequence tracker cleared
2. **Live updates:** WebSocket `orderbook_snapshot` + `orderbook_delta`
3. **Sequence semantics:**
   - After REST resync: tracker cleared — first delta establishes a new baseline (`seq` accepted unconditionally)
   - After WS snapshot: tracker reset to snapshot `seq` — next delta must be exactly `seq + 1` or triggers gap resync
4. **Sequence gap or stale threshold (30s):** REST resync + optional WS `get_snapshot`
5. **Socket close / error:** exponential reconnect; each attempt **REST rehydrates** before resubscribing (does not rely on server snapshot alone)
6. **Dashboard pricing:** `orderbookFeed.pricing ?? pollPricing` in `MarketDataProvider`

Market metadata discovery remains on the existing 12s BFF poll; only odds pricing moves to the orderbook stream.

## Pricing model notes

- YES/NO ask prices use binary-complement derivation from opposing-side bids in `topOfBook.ts`
- Live orderbook pricing takes precedence over polled REST odds when the feed is active

## Out of scope

- Trade execution
- `evaluate()` / engine policy changes
- Authenticated Kalshi credential management (transport remains injectable for future wiring)
- Order placement / portfolio channels

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
