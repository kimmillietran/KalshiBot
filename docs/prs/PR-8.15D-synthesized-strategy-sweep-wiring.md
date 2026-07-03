# PR 8.15D — Synthesized Strategy Sweep Wiring

## Purpose

Optionally include synthesized research strategies in the standard strategy sweep flow while preserving default baseline-only behavior.

## Usage

```bash
npm run research:sweep -- --all --include-synthesized
```

Optional flags:

| Flag | Default |
|------|---------|
| `--include-synthesized` | off |
| `--synthesis` | `data/research-results/strategy-synthesis-candidates.json` |

## Behavior

### Default (unchanged)

Without `--include-synthesized`, sweep runs only selected baseline strategies exactly as before.

### Opt-in synthesized strategies

When `--include-synthesized` is set:

1. Loads `strategy-synthesis-candidates.json`
2. Translates supported specs (currently `calibration-fade` family)
3. Adds labeled sweep jobs under `synthesized/{strategyId}/...`
4. Preserves `hypothesisId`, `synthesizedStrategyId`, and plugin metadata in sweep summary runs and `research-output.json`
5. Skips unsupported or rejected specs with summary warnings
6. Fails clearly if the synthesis file is missing

## Output labeling

Synthesized sweep outputs are written to paths like:

```
data/research-results/synthesized/synth-atlas-vol-high-over/KXBTC15M/MARKET-A/research-output.json
```

Sweep summary includes:

- `includeSynthesized`
- `synthesizedStrategiesExecuted`
- `warnings`
- per-run `synthesized` metadata

## Constraints

- Research-only; no live trading changes
- Built-in strategy registry unchanged unless `--include-synthesized` is passed
- Synthesized strategies are never included silently

## Verification

```bash
npm run lint
npm run test
npm run build
```
