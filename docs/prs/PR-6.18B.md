# PR-6.18B — BTC Importer to Bronze Provider Adapter

## Summary

Milestone 6.18B wires the 6.17B `BtcHistoricalImporter` into the 6.15B `BtcHistoricalBronzeProvider` contract. This is composition only — no new HTTP, filesystem, CLI, import job execution, validation, or replay logic.

## Pipeline

```
BtcHistoricalImporter.getHistoricalBars()
        ↓
BtcHistoricalBar[]
        ↓
createBtcHistoricalBronzeProviderFromImporter()
        ↓
BtcHistoricalBronzeProvider
        ↓
HistoricalBronzeImportJob (6.14A)
```

## API

```typescript
import {
  createBtcHistoricalBronzeProviderFromImporter,
} from "@/lib/data/importJobs/providers/btc";

const provider = createBtcHistoricalBronzeProviderFromImporter({
  importer,
  symbol: "BTCUSDT",
  interval: BtcHistoricalInterval.ONE_MINUTE,
});

const records = provider.importBtcKlineRecords({
  marketTicker,
  startTime,
  endTime,
  collectionTime,
  observedAt,
});
```

## Behavior

On `importBtcKlineRecords(input)`:

1. Validates import input (same rules as the in-memory provider).
2. Calls `importer.getHistoricalBars({ symbol, interval, startTime, endTime })`.
3. Maps each bar through `mapBtcHistoricalBarToBronzeRecord` using `input.marketTicker`, `collectionTime`, and `observedAt`.
4. Returns deeply frozen, deterministically sorted `RawHistoricalRecord[]`.

## Sync contract note

`BtcHistoricalBronzeProvider.importBtcKlineRecords` is synchronous (6.14A). The 6.17B HTTP importer returns a `Promise`. This adapter resolves bars synchronously at call time; if `getHistoricalBars` returns a `Promise`, it throws `BtcImporterBronzeProviderAdapterError` with code `async-importer-result`. Production CLI wiring should prefetch async importer results before import execution (future milestone).

## Out of scope

- New HTTP implementation
- Filesystem / persistence
- CLI
- Import job execution
- Validation execution
- Replay / backtest

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
