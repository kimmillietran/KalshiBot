# PR-6.29A — Import Failure Analyzer

## Summary

Milestone 6.29A adds deterministic diagnostics for batch historical import failures. Instead of reporting only aggregate counts (`500 configs / 30 imported / 470 failed`), the analyzer groups failures by reason, surfaces examples, and emits remediation recommendations.

## CLI

```bash
npm run imports:analyze-failures
```

Defaults:

| Flag | Default |
|------|---------|
| `--input` | `data/imports/batch-import-summary.json` |
| `--output` | `data/imports/import-failure-analysis.json` |

## Architecture

```
batch-import-summary.json
        ↓
parseBatchImportSummaryJson (Zod)
        ↓
categorizeBatchImportFailure (message patterns)
        ↓
buildBatchImportFailureAnalysis (group + recommend)
        ↓
import-failure-analysis.json
```

- Module: `src/lib/data/importJobs/batchImport/`
- CLI: `scripts/import/analyzeBatchImportFailures.ts`

## Failure categories

| Code | Recoverable |
|------|-------------|
| `no-historical-data` | No |
| `market-not-found` | No |
| `provider-unavailable` | Yes |
| `rate-limited` | Yes |
| `malformed-response` | No |
| `unsupported-market` | No |
| `invalid-metadata` | No |
| `network-failure` | Yes |
| `unknown` | No |

## Output shape

```json
{
  "totalConfigs": 500,
  "successfulImports": 30,
  "failedImports": 470,
  "failureReasons": [
    {
      "code": "rate-limited",
      "count": 200,
      "percentage": 42.55,
      "examples": []
    }
  ],
  "recoverableFailures": 250,
  "unrecoverableFailures": 220,
  "recommendations": []
}
```

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Tests

- Empty summary (no failures)
- Mixed failure categories
- Grouping and percentage math
- Deterministic ordering (count desc, then code)
- Recommendations for dominant categories
- CLI success and missing-input failure paths
