# Feature: journal

Trade journal: record entries/exits, link to Kalshi markets, attach thesis,
tags, and outcomes. The primary data source for analytics.

Deferred to a later milestone. Mutations will use Server Actions backed by
`lib/db` (a stubbed repository interface until the DB lands, so the UI does not
change when persistence is added).

Interacts with: `lib/db` (future), `market-data` (links by market ticker).
Consumed by the journal route and the analytics feature.
