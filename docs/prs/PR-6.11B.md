# PR-6.11B — Historical Research CLI Export Mode

## Summary

Milestone 6.11B extends the historical research CLI command with optional export output modes that emit `ResearchExportDocument` JSON instead of raw runner results.

**CLI output only** — no new backtest, metrics, strategy, persistence, or file writes.

## Usage

```bash
npm run research:historical -- --input path/to/input.json
npm run research:historical -- --input path/to/input.json --format raw
npm run research:historical -- --input path/to/input.json --format export
npm run research:historical -- --input path/to/input.json --format export-summary
```

Default format: `raw`

## Input JSON additions

| Field | Required for | Description |
|---|---|---|
| `exportId` | `export`, `export-summary` | Export document identifier |
| `generatedAt` | `export`, `export-summary` | Caller-supplied timestamp (no `Date.now()`) |
| `generatedBy` | Optional | Provenance label |
| `label` | Optional | Human-readable export label |

## Output modes

| Format | Output |
|---|---|
| `raw` | `HistoricalResearchRunnerResult` stable JSON (unchanged 6.10A behavior) |
| `export` | Full `ResearchExportDocument` via `formatResearchExportJson()` |
| `export-summary` | Summary payload via `formatResearchExportSummaryJson()` |

## Pipeline (export modes)

```
CLI input JSON
    ↓
runHistoricalResearchFromBronze()
    ↓
buildResearchRunExport()
    ↓
formatResearchExportJson() | formatResearchExportSummaryJson()
    ↓
stdout
```

## Rules

- stdout on success, stderr on failure
- Success stdout ends with exactly one trailing newline (`formatStdoutOutput()`)
- No filesystem writes
- Deterministic compact JSON (no pretty indent in CLI)
- Input documents are never mutated

## Out of scope

- Builder #1 CLI command file changes
- File output / CSV / PDF
- Dashboard integration
- New backtest or strategy logic

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
