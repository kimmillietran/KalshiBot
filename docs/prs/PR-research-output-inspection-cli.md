# PR: Research Output Inspection CLI

## Summary

Adds `npm run research:inspect` — a small diagnostic CLI that prints a human-readable summary of `research-output.json` files without ad hoc PowerShell JSON path guessing.

## Problem

During smoke testing, direct inspection like:

```powershell
$r = Get-Content "...research-output.json" -Raw | ConvertFrom-Json
$r.researchRun.acceptedFills
```

printed nothing because runner-format outputs double-encode `dataset` and `researchRun`, and fills/rejections live under `backtestResult.strategyRun.steps`.

## Solution

New module: `src/lib/data/research/inspect/`

CLI: `scripts/research/inspectResearchOutput.ts`

### Usage

```bash
npm run research:inspect -- --input path/to/research-output.json

npm run research:inspect -- --input-dir data/research-results --strategy buy-first-ask --limit 5
```

### Output fields

- `runId`, `strategyId`, `marketTicker`
- `totalPnlCents`, `netPnlCents`, `grossPnlCents`
- `acceptedFillCount`, `rejectedIntentCount`, `tradeCount`, `totalFills`
- `replayStepCount`
- `diagnostics` and `diagnosticsWarnings` (reuses `parseReplayPricingDiagnosticsFromResearchOutput`)
- `firstFill` / `lastFill`, `firstRejectedIntent` / `lastRejectedIntent`
- `decisionTracePath` (sibling `decision-trace.json` when input path is known)
- `missingFields` for incomplete documents

Supports both runner-format (nested/serialized) and legacy flat batch summaries.

## Scope

Diagnostic tooling only. Does not change replay engine, strategy behavior, or metrics calculation.

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
