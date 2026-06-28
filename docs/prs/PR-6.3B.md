# PR-6.3B — Historical Snapshot Assembler

## Summary

Milestone 6.3B adds a deterministic `SnapshotAssembler` that combines normalized Silver records into an immutable `HistoricalTradingSnapshot` mirroring the runtime `EvaluationSnapshot` shape for future replay.

No replay, indicators, probabilities, EV, Kelly, bronze collection, dashboard, engine, or execution changes.

## Snapshot contents

| Field | Source | Required |
|---|---|---|
| `marketWindow` | Silver `MarketWindow` | Yes |
| `kalshiCandles` | Silver `KalshiCandle1m[]` | Yes (≥1) |
| `btcBars` | Silver `BtcBar1m[]` | Yes (≥1) |
| `settlement` | Silver `SettlementRecord` | No |
| `temporal` | Copied from market window | Yes |
| `provenance` | Traced from input envelopes | Yes |

## Assembler rules

- Missing required components → deterministic `HistoricalSnapshotAssemblyError`
- No calculations, interpolation, or inferred timestamps
- Input ordering preserved for candles and bars
- Output deeply frozen (`Object.freeze` recursive) on cloned records — caller inputs are not mutated
- Serializable via `serializeHistoricalTradingSnapshot()` (`stableStringify`)
- **`snapshotVersion`:** deferred — add with replay contract in a future milestone

## API

```typescript
import {
  assembleHistoricalTradingSnapshot,
  serializeHistoricalTradingSnapshot,
} from "@/lib/data/snapshots";

const snapshot = assembleHistoricalTradingSnapshot({
  marketWindow: { record, provenance },
  kalshiCandles: [{ record, provenance }],
  btcBars: [{ record, provenance }],
  settlement: { record, provenance }, // optional
});
```

## Out of scope

- Replay engine
- Strategy simulation / feature engineering
- Bronze collection / Silver normalization
- `evaluate()` / trading engine wiring
- Dashboard / execution

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
