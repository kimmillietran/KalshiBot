# PR-6.19B — Historical Import Output Fixture Bridge

## Summary

Milestone 6.19B adds a pure bridge from `HistoricalBronzeImportJobResult` to the CLI-shaped `HistoricalResearchCliInput` produced by the 6.12A fixture generator.

**Bridge only** — no file writes, CLI changes, import execution, replay, strategy execution, or metrics calculation.

## Pipeline

```
HistoricalBronzeImportJobResult
        ↓
buildHistoricalResearchFixtureFromImportResult()
        ↓
HistoricalResearchCliInput
        ↓
serializeHistoricalResearchFixtureFromImportResult()
        ↓
stable JSON string
```

## Public API

```typescript
import {
  buildHistoricalResearchFixtureFromImportResult,
  serializeHistoricalResearchFixtureFromImportResult,
} from "@/lib/data/importJobs/fixtureBridge";

const fixture = buildHistoricalResearchFixtureFromImportResult({
  importResult,
  strategyId: "noop",
  runId: "research-run-1",
  durationMs: 4_000,
  initialCashCents: 10_000,
  engineConfig,
  fillConfig,
  metricsConfig,
  exportConfig,
});

const json = serializeHistoricalResearchFixtureFromImportResult({
  importResult,
  strategyId: "noop",
  runId: "research-run-1",
  durationMs: 4_000,
  initialCashCents: 10_000,
  engineConfig,
});
```

## Behavior

1. Validates bridge input shape.
2. Rejects when `importResult.validationResult.valid === false` (`ImportFixtureBridgeError`, code `invalid-import-result`).
3. Delegates to `buildHistoricalResearchFixture()` with `importResult.bronzeRecords` and caller-supplied research config.
4. Returns deeply frozen `HistoricalResearchCliInput`.
5. Serialization reuses `serializeHistoricalResearchFixture()`.

## Deterministic guarantees

- No `Date.now()`, `Math.random()`, filesystem, or network
- Import result input is never mutated
- Output is deeply frozen
- Stable serialization via `stableStringify`

## Out of scope

- Dataset builder duplication beyond existing fixture generator
- Replay / strategy execution / metrics
- CLI wiring
- Filesystem writes

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
