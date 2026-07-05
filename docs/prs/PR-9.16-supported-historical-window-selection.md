# PR 9.16 — Supported Historical Window Selection

## Summary

Teaches the historical coverage planner to learn from prior expansion import summaries and prefer import windows that are likely to succeed.

## Problem

Some archived historical windows contain markets whose Kalshi API responses are incomplete (for example missing `expiration_value`). The planner previously treated every missing month equally.

## Fix

- Parse `historical-expansion-import-summary.json` and classify prior market outcomes:
  - successful imports
  - compatibility / unsupported failures
  - other failures and skips
- Score recommended windows with:
  - `estimatedSupportLevel`: `high` | `medium` | `low`
  - `estimatedUnsupportedRate`
- Boost priority for likely-importable windows and deprioritize mostly-unsupported windows.
- Surface importability in coverage-plan HTML and the research pipeline dashboard.

## Out of scope

No import execution, replay changes, or hypothesis generation changes.

## Verification

```bash
npm run lint
npm run test
npm run build
```
