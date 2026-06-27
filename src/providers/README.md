# providers

App-wide React context providers composed in the dashboard layout.

| Provider | Role |
|----------|------|
| `QueryProvider` | TanStack Query client for server-state (BTC feed, Kalshi market metadata) |
| `DashboardProviders` | Composes `QueryProvider`, `MarketDataProvider`, and `BtcFeedProvider` |

Theme remains static via a `dark` class on `<html>` — no theme provider yet.
