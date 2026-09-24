# M17-prep — Settlement-label backfill for CryptoStruct friction study

**Study id:** `kalshi-kxbtc15m-settlement-friction-label-backfill-v0`

**Base:** PR #113 / `origin/main` at `b682962e2b34cba5593a5162f781a7b58c86edda`

## Purpose

Populate official Kalshi settlement metadata for the exact 3,228 tickers sampled
by the merged friction study, then refresh label coverage in a **new** output
directory without changing the economic sample or friction results.

## Reuse model

- Reuses `HistoricalBronzeImportMode.SETTLEMENT_ONLY` via
  `buildCaptureMarketImportConfig` + `runHistoricalImportFromConfig`.
- Reuses forward-settlement checkpoint helpers with synthetic capture-run id
  `ticker-manifest:<manifestIdentity>` (no fabricated capture directory).
- Preserves existing `npm run research:backfill-forward-settlements`
  (`--capture-run-dir` required).

## Results (committed summaries)

| Metric | Before (empty labels) | After |
| --- | ---: | ---: |
| Denominator tickers | 3228 | 3228 |
| Finalized result | 0 | 3228 |
| Non-empty expiration | 0 | 3228 |
| Valid numeric expiration | 0 | 3226 |
| Joint result + expiration | 0 | 3228 |
| Finite strike | 0 | 3227 |
| Parseable close time | 0 | 3228 |
| Parseable settlement time | 0 | 3228 |
| Duplicates / conflicts | 0 / 0 | 0 / 0 |

Study-complete labels (all required fields including finite strike): **3227/3228**.

Friction pooled/equal-day metrics, exclusions, sample SHA, fee/adapter/config
identities: **unchanged** vs original PR #113 report.

## Incomplete / gap records

See `incomplete-records.json` in the coverage-refresh output directory.
Primary incomplete: `KXBTC15M-26AUG140315-15` (`normalization-failed`, missing
`floorStrike`). Two additional API strings use comma-formatted expiration values
and fail the valid-numeric coverage check without being invented or dropped.

## Artifacts

| Path | Committed? |
| --- | --- |
| `data/research-results/.../m17-prep-settlement-friction-label-coverage/` | Yes (summaries) |
| Original `.../m17-prep-settlement-friction-coverage/` | Preserved |
| Local `data/imports/settlement-friction-label-backfill/` | No (raw) |
| Local `data/external-samples/.../settlement-friction-label-backfill/` | No (gitignored work) |

## Out of scope

No BRTI-path reconstruction, alpha/P&L, CryptoStruct purchase/restore, or live
trading.
