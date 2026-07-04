# PR 9.14B — Expansion Executor Cap Enforcement

## Summary

Fixes historical expansion import planning so `--max-markets` is enforced against an explicit post-dedupe queue instead of the full discovery list.

## Problem

When running:

```bash
npm run research:execute-expansion-import -- --execute --max-markets=10
```

progress could reach `93/10` and summaries could report `plannedCount: 0` with `failedCount: 93`. Failures did not consume the cap because the executor iterated every discovered market and only decremented the budget on successful/planned imports.

## Fix

- Build an explicit **planned import queue** after discovery + dedupe.
- Apply `--max-markets` while constructing the queue (global budget across jobs).
- Execute **only** queued markets; every queued attempt (imported, failed, or skipped-after-planning) consumes one cap slot.
- Set `plannedCount` to the queue length; keep `attempted = imported + failed + skipped-after-planning`.
- Align progress denominator with the per-job planned queue length.
- Abort with prominent first-three failure reasons when all planned markets fail with zero imports.

## Out of scope

No changes to discovery, dedupe sources, import execution semantics, checkpoint/resume policy, circuit breaker classification, replay, fixture bridge, or research logic.

## Tests

- `buildPlannedExpansionImportQueue.test.ts`
- `summarizeExpansionImportJobResults.test.ts`
- `runHistoricalExpansionImport.test.ts` cap enforcement cases

## Verification

```bash
npm run lint
npm run test
npm run build
```
