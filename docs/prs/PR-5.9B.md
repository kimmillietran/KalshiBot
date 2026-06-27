# PR-5.9B — Bankroll Engine & Dashboard Wiring

## Summary

Milestone 5.9B wires Builder #1's `resolveBankroll()` into `evaluate()` after decision policy and passes resolved dollars into Kelly sizing. The dashboard shows formatted recommended dollars when bankroll is configured, or **Bankroll not configured** when absent.

## Pipeline

```
Guards → Features → Probability → EV → Decision Policy → Bankroll Resolution → Position Sizing → TradeDecision
```

## Configuration flow

1. Caller supplies optional `EngineConfig.bankrollDollars` (no engine default).
2. After policy, `resolveBankroll(config)` validates bankroll and produces reasoning.
3. `estimatePositionSize({ ..., bankrollDollars: bankroll.bankrollDollars })` computes dollar recommendation when valid.
4. Dashboard reads `positionSize.recommendedDollars` — formatted via existing display helpers.

## API changes

- `EngineConfig.bankrollDollars?: number`
- Reasoning step `model-bankroll` (pass when configured, skip when absent)
- `ENGINE_VERSION` → `5.9.0`
- Dashboard label: `Bankroll not configured` (replaces prior unavailable copy)

## Out of scope

- Account integration, persistence, brokerage, auth
- Trade execution
- Bankroll editing in UI

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
