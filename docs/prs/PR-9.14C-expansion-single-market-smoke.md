# PR-9.14C — Expansion Single Market Smoke

## Summary

Adds a focused single-market smoke/debug mode to the expansion import executor so one ticker (for example `KXBTC15M-25DEC311900-00`) can be diagnosed without scanning thousands of markets or triggering rate-limit cascades.

## Command

```bash
# Dry-run (default): fetch payloads, reconcile schema, plan import, write debug report
npm run research:execute-expansion-import -- --market-ticker KXBTC15M-25DEC311900-00

# Execute: same as dry-run plus standard historical import artifacts
npm run research:execute-expansion-import -- --market-ticker KXBTC15M-25DEC311900-00 --execute
```

Optional output overrides:

```bash
npm run research:execute-expansion-import -- \
  --market-ticker KXBTC15M-25DEC311900-00 \
  --single-market-output data/research-results/single-market-expansion-import-debug.json \
  --single-market-html-output data/reports/single-market-expansion-import-debug.html
```

## Behavior

For one ticker the smoke path:

1. Loads expansion import defaults from the existing expansion config (series job lookup)
2. Fetches **one** list page (`limit=100`, no pagination loop)
3. Fetches the detail payload (`GET /historical/markets/{ticker}`)
4. Runs M9.13 schema reconciliation (`mergeKalshiMarketWireFromListDetail`)
5. Dry-runs or executes the standard per-market import path (`buildExpansionMarketImportArtifacts` + `runHistoricalImportFromConfig`)
6. Writes JSON + HTML debug reports

Normal full-window executor behavior is unchanged when `--market-ticker` is omitted.

## Outputs

| Artifact | Default path |
| --- | --- |
| JSON report | `data/research-results/single-market-expansion-import-debug.json` |
| HTML report | `data/reports/single-market-expansion-import-debug.html` |

Report fields include ticker, list/detail payload availability, `expiration_value` source, reconciliation result, import status, failure reason, and debug artifact paths.

## Safety

- Default dry-run; `--execute` required to write import artifacts
- No full-window discovery (`discoverMarkets` is not called)
- At most one list request and one detail request (no retry loop)
- List lookup does not paginate beyond the first page

## Architecture

| Module | Responsibility |
| --- | --- |
| `runSingleMarketExpansionImportDebug.ts` | Orchestration, reconciliation, import branch |
| `fetchSingleMarketExpansionPayloads.ts` | Targeted list/detail wire fetch |
| `serializeSingleMarketExpansionImportDebugHtml.ts` | HTML report |
| `executeExpansionImport.ts` | CLI branch on `--market-ticker` |

## Tests

| Scenario | File |
| --- | --- |
| Single ticker dry-run | `runSingleMarketExpansionImportDebug.test.ts` |
| Single ticker execute | `runSingleMarketExpansionImportDebug.test.ts` |
| Missing list payload | `runSingleMarketExpansionImportDebug.test.ts` |
| Missing detail payload | `runSingleMarketExpansionImportDebug.test.ts` |
| Reconciliation success | `runSingleMarketExpansionImportDebug.test.ts` |
| Reconciliation failure | `runSingleMarketExpansionImportDebug.test.ts` |
| No full-window discovery loop | `executeExpansionImport.test.ts` |
| Single list page only | `fetchSingleMarketExpansionPayloads.test.ts` |

## Test plan

- [x] `npm run lint`
- [x] `npm run test`
- [x] `npm run build`
