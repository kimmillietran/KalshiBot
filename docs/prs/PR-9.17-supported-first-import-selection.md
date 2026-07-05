# PR-9.17 — Supported-First Import Selection

## Summary

Improves expansion import planning so `--max-markets` is spent on markets that are likely importable instead of the first discovered tickers, which are often archived markets with missing `expiration_value`.

## Problem

After M9.15, unsupported markets are skipped correctly — but planning still selected the first N discovered markets. A run such as:

```bash
npm run research:execute-expansion-import -- --execute --max-markets=10
```

could discover thousands of markets, plan 10 known-unsupported tickers, and import none.

## Fix

Before building the planned import queue, discovered markets are classified into:

1. **Likely supported** — wire passes unsupported classifier and prior summary shows successful import
2. **Unknown** — wire passes classifier but no successful import history
3. **Known unsupported** — wire fails classifier or prior summary confirms unsupported outcome

Planning order is always: likely supported → unknown → known unsupported.

Prior `historical-expansion-import-summary.json` outcomes deprioritize repeat unsupported selections without permanently blacklisting tickers.

## CLI

```bash
npm run research:execute-expansion-import -- --execute --max-markets=25 --sample-strategy=supported-first
```

Supported `--sample-strategy` values:

- `supported-first` (default)
- `earliest`
- `latest`
- `evenly-spaced`
- `random` (deterministic per job id seed)

## Summary outputs

Expansion summary JSON/HTML now includes:

- `sampleStrategy`
- `selection.selectedSupportedMarkets`
- `selection.selectedUnknownMarkets`
- `selection.selectedUnsupportedMarkets`

## Out of scope

No changes to importer, reconciliation, unsupported classification, replay, fixtures, hypothesis generation, strategy synthesis, or promotion.

## Verification

```bash
npm run lint
npm run test
npm run build
```
