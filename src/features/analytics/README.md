# Feature: analytics

Performance insight derived from journal + market history: PnL, win rate,
expectancy, equity curve, and AI signal calibration.

Deferred to a later milestone. All math comes from the tested
`lib/utils/trading` helpers; charts render via `components/charts`.

Interacts with: `journal` (public hooks/types), `lib/utils/trading`,
`components/charts`. Consumed by the analytics route and dashboard.
