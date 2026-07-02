# Baseline Strategy Pack

Deterministic research baselines built on the strategy plugin interface. These strategies are intended for **comparison and benchmarking**, not production trading advice.

| strategyId | Summary |
|------------|---------|
| `noop` | Control strategy that never trades |
| `buy-first-ask` | Always buys YES at the ask when pricing exists |
| `buy-below-probability` | Buys YES when yes mid is below a threshold |
| `fair-value-diffusion` | Diffusion fair-value model; trades when model edge exceeds threshold |
| `simple-momentum` | Buys YES on positive BTC candle momentum |
| `simple-mean-reversion` | Buys YES when yes mid dips below its rolling mean |

## noop

**What it does:** Returns no trade intents on every replay step.

**Config fields:** none (`{}` only)

**Use:** Control baseline to verify replay plumbing and confirm that non-trading runs produce zero fills.

## buy-first-ask

**What it does:** Emits one YES buy at the step's yes ask whenever ask pricing is available.

**Config fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `quantity` | positive integer | `1` | Contracts per intent |

**Use:** Simple always-buy baseline to stress fill simulation and ledger behavior.

## buy-below-probability

**What it does:** Buys YES when the market yes mid (implied probability in cents) is at or below `maxYesMidCents`.

**Config fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxYesMidCents` | integer 1–99 | `50` | Maximum yes mid to trigger a buy |
| `quantity` | positive integer | `1` | Contracts per intent |

**Use:** Baseline for low-implied-probability entries. Not a calibrated edge model.

## fair-value-diffusion

**What it does:** Estimates fair settlement probability using a geometric diffusion model (spot, strike, time remaining, realized BTC volatility) and compares it to Kalshi yes mid. Buys YES when fair probability exceeds implied mid by at least `minimumEdgeThresholdCents`; buys NO when implied mid exceeds fair probability by the same margin.

**Config fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `volatilityLookbackBars` | integer ≥ 2 | `10` | BTC candle window for realized volatility |
| `minimumEdgeThresholdCents` | number ≥ 0 | `5` | Minimum fair-vs-implied edge in cents |
| `minimumTimeRemainingMs` | number ≥ 0 | `60000` | Minimum ms before close to allow entries |
| `maxPositionSize` | positive integer | `1` | Contracts per intent |

**Use:** Flagship quantitative research strategy for fair-value edge detection. Deterministic; requires strike, BTC price, candle history, and pricing on each step.

## simple-momentum

**What it does:** Computes BTC close-to-close momentum over `lookbackBars` candles and buys YES when momentum exceeds `momentumThresholdPct`.

**Config fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `lookbackBars` | integer ≥ 2 | `3` | Candle window length |
| `momentumThresholdPct` | number ≥ 0 | `0.05` | Minimum percent move required |
| `quantity` | positive integer | `1` | Contracts per intent |

**Use:** Directional BTC momentum baseline for research comparisons.

## simple-mean-reversion

**What it does:** Tracks a rolling window of yes mid prices. Buys YES when the current mid falls more than `deviationCents` below the prior-window mean.

**Config fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `windowSize` | integer ≥ 2 | `5` | Rolling mid window |
| `deviationCents` | number ≥ 0 | `5` | Cents below mean required to buy |
| `quantity` | positive integer | `1` | Contracts per intent |

**Use:** Mean-reversion style baseline on market-implied pricing. Requires multiple replay steps before firing.

## Selecting strategies in research fixtures

```json
{
  "strategyId": "simple-momentum",
  "strategyConfig": {
    "lookbackBars": 4,
    "momentumThresholdPct": 0.1
  }
}
```

Resolve at runtime via `resolveResearchStrategy()` or the research CLI (`npm run research:historical`).

## Registry inclusion

The full pack is registered by default. For tests or partial packs:

```ts
import { createBaselineStrategyPluginRegistry } from "@/lib/data/strategies";

const registry = createBaselineStrategyPluginRegistry(["noop", "simple-momentum"]);
```
