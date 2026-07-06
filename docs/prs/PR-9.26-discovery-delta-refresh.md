# PR-9.26: Discovery Delta Refresh

## Summary

Adds month-scoped discovery cache segments and delta refresh so expansion imports reload only missing or stale calendar months instead of rediscovering entire multi-month windows.

Builds on persistent segment storage under `data/research-results/expansion-discovery-cache/{series}/{YYYY-MM}.json`.

## CLI flags

| Flag | Default | Purpose |
|------|---------|---------|
| `--discovery-cache-dir` | `data/research-results/expansion-discovery-cache` | Segment storage root |
| `--discovery-cache-segment` | `month` | Segment granularity (`month` only for now) |
| `--discovery-cache-ttl-hours` | `168` | Segment freshness TTL |
| `--refresh-discovery-month` | — | Force refresh one `YYYY-MM` segment |

Coverage planner: month alignment enabled by default (`--no-align-import-windows-to-months` to disable).

## Expansion summary fields

- `discoveryDiagnostics.discoverySegmentsRequested`
- `discoveryDiagnostics.discoverySegmentsCacheHit`
- `discoveryDiagnostics.discoverySegmentsRefreshed`
- `discoveryDiagnostics.discoverySegmentsStale`
- `discoveryDiagnostics.discoverySegmentPaths`

## Architecture

```
runHistoricalExpansionImport
  createDeltaRefreshDiscoverMarkets()
    resolveDiscoveryWithDeltaRefresh()
      per-month segment load / refresh / merge
```

Discovery-cache efficiency only — import semantics, replay, and research calculations unchanged.

## Tests

- `expansionDiscoveryCache.test.ts` — cache hit, stale refresh, missing refresh, forced month, merge order, wire preservation, diagnostics
- `splitMonthGapWindowsToMonthSegments.test.ts` — planner month alignment

## Example

For a Jan–May job with fresh Jan–Feb and Apr–May segments and missing Mar:

- 4 cache hits, 1 refresh (March only)
- Merged discovery preserves sort order and raw `listMarketWire` payloads from cached segments
