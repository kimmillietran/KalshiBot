# PR-5.10A — Settings Configuration Core

## Summary

Milestone 5.10A adds a pure settings normalization module under `src/lib/trading/settings/`. `resolveTradingSettings()` validates partial user input into `ResolvedTradingSettings` for future dashboard settings UI.

**Not wired into `evaluate()`, dashboard, or persistence** — configuration contract only.

Safe before 5.9B merge: does not depend on engine bankroll wiring or dashboard storage.

## API

```typescript
resolveTradingSettings(input?) → ResolvedTradingSettings
```

```typescript
type TradingSettingsInput = {
  bankrollDollars?: number | null;
  minEdgePercent?: number | null;
  maxSpreadPercent?: number | null;
  kellyFraction?: number | null;
  maxPositionFraction?: number | null;
};

type ResolvedTradingSettings = {
  bankrollDollars: number | null;
  minEdgePercent: number;
  maxSpreadPercent: number;
  kellyFraction: number;
  maxPositionFraction: number;
  valid: boolean;
  warnings: readonly string[];
  modelVersion: "5.10.0";
};
```

## Validation / defaulting rules

| Field | Missing | Invalid | Default source |
|---|---|---|---|
| `bankrollDollars` | `undefined` → `null`, no warning | `null` or invalid number → `null` + warning | **None** — never invented |
| `minEdgePercent` | default | default + warning | `DEFAULT_ENGINE_CONFIG` (5%) |
| `maxSpreadPercent` | default | default + warning | `DEFAULT_ENGINE_CONFIG` (15%) |
| `kellyFraction` | default | default + warning | `DEFAULT_POSITION_SIZING_CONFIG` (0.25) |
| `maxPositionFraction` | default | default + warning | `DEFAULT_POSITION_SIZING_CONFIG` (0.10) |

**Bounds:** edge/spread `[0, 100]`; Kelly fractions `(0, 1]`.

**`valid`:** `false` when any user-supplied field fails validation; `true` when all provided fields pass (missing fields OK).

Bankroll validation delegates to `resolveBankroll()` from 5.9A. For bankroll only: **`undefined` = missing** (no warning); **`null` = explicitly invalid** (warning emitted).

## Rationale

- Settings UI needs a single normalization entry point before touching engine or storage.
- Bankroll remains optional and caller-supplied.
- Engine thresholds reuse documented defaults — no new magic numbers.

## Future settings UI integration

```typescript
import { resolveTradingSettings } from "@/lib/trading/settings";

const settings = resolveTradingSettings(formValues);

if (!settings.valid) {
  showWarnings(settings.warnings);
}

// Map to engine / sizing when wiring lands:
// engineConfig.minEdgePercent = settings.minEdgePercent
// engineConfig.maxSpreadPercent = settings.maxSpreadPercent
// estimatePositionSize({ ..., bankrollDollars: settings.bankrollDollars ?? undefined })
```

Persistence (localStorage, account) is a later milestone.

## Out of scope

- `evaluate()` wiring
- Dashboard UI
- localStorage / fetch / execution
- `EngineConfig` type changes

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
