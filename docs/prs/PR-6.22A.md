# PR-6.22A — Historical Kalshi Market Discovery

## Summary

Adds deterministic historical market discovery for the `KXBTC15M` series via the Kalshi Historical API. Output is a stable `discovery-result.json` document suitable for a future batch import config generator (6.22B).

## Scope

- `src/lib/data/discovery/` — types, normalization, validation, pagination service
- `scripts/discovery/runMarketDiscovery.ts` — CLI entrypoint
- Optional metadata passthrough on `HistoricalMarketRecord` (`title`, `subtitle`, `seriesTicker`)

## CLI

```bash
npm run discover:markets -- --series KXBTC15M --output discovery-result.json
```

Writes the full discovery payload to `--output` and prints a short JSON summary to stdout.

## Output shape

```json
{
  "metadata": { "seriesTicker", "discoveredAt", "marketCount", "pageCount" },
  "markets": [
    {
      "marketTicker",
      "eventTicker",
      "seriesTicker",
      "title",
      "subtitle",
      "status",
      "openTime",
      "closeTime",
      "settlementTime",
      "expirationValue",
      "provenance"
    }
  ],
  "validation": { "valid", "errors", "warnings" },
  "provenance": { "pages": [...] }
}
```

## Validation

Discovery results are validated for:

- empty results
- missing `marketTicker`
- malformed timestamps
- duplicate tickers
- unsupported status values

Invalid sets are still serialized with `validation.valid: false` so operators can inspect issues.

## Tests

- Normalization unit tests
- Validation unit tests (duplicates, malformed timestamps, empty results)
- Discovery pagination + deterministic serialization
- CLI argv parsing and file output
