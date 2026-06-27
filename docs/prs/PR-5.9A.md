# PR-5.9A — Bankroll Configuration Core

## Summary

Milestone 5.9A adds a pure bankroll configuration module under `src/lib/trading/bankroll/`. `resolveBankroll()` validates an optional caller-supplied bankroll for Kelly dollar sizing.

**Not wired into `evaluate()` in this milestone** — Builder #2 passes resolved bankroll into `estimatePositionSize()`.

## Rationale

Kelly sizing can return fraction/percent recommendations without a bankroll. Dollar amounts require an explicit, validated bankroll from the caller. The engine must never invent a default balance.

## API

```typescript
type BankrollConfig = {
  bankrollDollars?: number | null;
};

resolveBankroll(config?) → ResolvedBankroll
```

```typescript
type ResolvedBankroll = {
  bankrollDollars: number | null;
  configured: boolean;
  reasoning: readonly string[];
  modelVersion: "5.9.0";
};
```

## Validation

| Input | Result |
|---|---|
| `undefined` / `null` | `configured: false`, `bankrollDollars: null` |
| `NaN` / `±Infinity` | `configured: false` |
| `<= 0` | `configured: false` |
| finite `> 0` | `configured: true`, `bankrollDollars` set |

No defaults. No `EngineConfig` changes.

## Why bankroll is optional

- Fractional Kelly sizing works without dollars.
- Bankroll is user/account-specific and must not be assumed by the engine.
- Dashboard and persistence layers supply bankroll in a later milestone.

## Builder #2 integration contract

After decision policy, before or inside position sizing wiring:

```typescript
import { resolveBankroll } from "@/lib/trading/bankroll";

const bankroll = resolveBankroll({ bankrollDollars: userSuppliedBankroll });

const positionSize = estimatePositionSize({
  action,
  probability,
  expectedValue,
  engineConfig: config,
  bankrollDollars: bankroll.bankrollDollars ?? undefined,
});
```

Attach `bankroll.reasoning` to engine trace when wiring lands. Do not add bankroll to `EngineConfig`.

## Out of scope

- `evaluate()` wiring
- Dashboard UI
- Kelly math changes
- Providers / BFF / execution

## Tests

`resolveBankroll.test.ts` — undefined, null, NaN, ±Infinity, zero, negative, positive, determinism.

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
