# PR 9.45 — Research-Only Harness Backtest Mode

## Summary

Adds an explicit `--research-only-backtest` harness mode so near-promising rejected strategies can be backtested for research learning without changing promotion thresholds or default harness behavior.

## CLI

```bash
npm run research:harness -- --input data/research-results/strategy-synthesis-candidates.json
npm run research:harness -- --input data/research-results/strategy-synthesis-candidates.json --research-only-backtest
```

- Default mode: unchanged (`experimental` + `candidate` only).
- Research-only mode: includes rejected strategies that pass research-worthiness filters.
- Mutually exclusive with `--include-rejected`.
- Default output dir in research-only mode: `data/research-results/harness-research-only`.

## Research-only eligibility (rejected strategies)

- `robustnessScore >= 45`
- `observationCount >= 6`
- Supported harness family (`calibration-fade` + aliases)
- Complete entry/exit fields (normalization)
- When `hypothesis-failure-analysis.json` is present: `priorityCategory === near-promising`
- Excludes `blocked-by-coverage` and `likely-spurious`

## Output metadata

Harness summary and CLI stdout include:

```json
{
  "runMode": "research-only",
  "researchOnlyBacktest": true,
  "includedRejectedStrategies": true,
  "promotionEligible": false,
  "skippedRejectedStrategyCount": 0,
  "strategySelection": []
}
```

Warning: `Research-only backtest: results are diagnostic and not promotion-eligible.`

## Files

- `src/lib/data/research/strategyHarness/researchOnlyHarnessEligibility.ts`
- `src/lib/data/research/strategyHarness/resolveHarnessStrategySelection.ts`
- `src/lib/data/research/strategyHarness/loadHypothesisFailureAnalysisForHarness.ts`
- `scripts/research/runStrategyHarnessTypes.ts`
- `scripts/research/runStrategyHarness.ts`
- Harness results reporting updates
