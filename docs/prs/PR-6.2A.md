# PR-6.2A — Bronze Storage Core

## Summary

Milestone 6.2A adds a bronze storage abstraction under `src/lib/data/bronze/` for immutable `RawHistoricalRecord` persistence.

**Storage contracts only** — no collectors, network calls, filesystem writes, replay, backtesting, dashboard, or engine changes.

## API

```typescript
type BronzeStore = {
  append(record: RawHistoricalRecord): Promise<void>;
  get(recordId: string): Promise<RawHistoricalRecord | null>;
  list(filter?: BronzeRecordFilter): Promise<readonly RawHistoricalRecord[]>;
};
```

## Components

| Module | Responsibility |
|---|---|
| `bronzeKeys.ts` | Deterministic `bronze:record:{recordId}` keys |
| `serializeBronzeRecord.ts` | Stable JSON serialization + clone/compare helpers |
| `InMemoryBronzeStore.ts` | Append-only in-memory implementation |
| `types.ts` | `BronzeStore`, filters, conflict error |

## Semantics

- **Append-only:** records are never updated in place
- **Idempotent duplicates:** identical `recordId` + identical canonical content is a no-op
- **Conflict detection:** same `recordId` with different content throws `BronzeDuplicateConflictError`
- **Immutability:** stored and returned records are deep-cloned via stable serialization
- **Deterministic list order:** `eventTime`, then `collectionTime`, then `recordId`

## Out of scope

- Filesystem persistence (future milestone)
- Collectors / importers
- Replay / backtesting
- `evaluate()` / trading engine
- Dashboard / API routes
- Network I/O

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
