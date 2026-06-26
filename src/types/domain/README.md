# types/domain

Shared domain language used across features: `Market`, `Contract`, `OrderBook`,
`Trade`, `Position`, `User`, `Signal`, etc.

Deferred to a later milestone. Vendor shapes (Kalshi/BTC raw payloads) live in
sibling files (`@/types/kalshi`, `@/types/btc`) and are mapped into these clean
domain types. Where possible, types are inferred from Zod schemas (single source
of truth).

Rule: vendor types never leak into UI — only `domain/*` does.
