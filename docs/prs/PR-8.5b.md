# PR 8.5b — Adaptive throttle pipeline default

## Summary

Makes adaptive import throttling the default for the official `research:pipeline` batch import step instead of a fixed `--request-delay-ms 1000`.

## Changes

- `buildImportBatchStepArgs` builds `import:batch` argv with adaptive throttle by default.
- `parseResearchPipelineImportThrottleFromArgv` parses pipeline override flags.
- `pipeline-summary.json` includes `config.importThrottle` (`adaptiveThrottleEnabled`, `minRequestDelayMs`, `maxRequestDelayMs`, `fixedRequestDelayMs` when fixed mode is used).

## Default import batch flags

```
--adaptive-throttle
--min-request-delay-ms 100
--max-request-delay-ms 3000
--max-retries 5
--retry-base-delay-ms 2000
```

## Overrides

| Flag | Effect |
|------|--------|
| `--request-delay-ms <ms>` | Fixed delay; disables adaptive throttle |
| `--no-adaptive-throttle` | Fixed delay (default 1000 ms) |
| `--adaptive-throttle` | Explicit adaptive (default behavior) |
| `--min-request-delay-ms` / `--max-request-delay-ms` | Tune adaptive bounds |

Conflicting combinations (`--adaptive-throttle` + `--no-adaptive-throttle`, or `--request-delay-ms` + `--adaptive-throttle`) are rejected.

## Dependency

Requires M8.5 (`import:batch --adaptive-throttle`) for runtime execution. Pipeline tests verify generated commands only.

## Test plan

- [x] Default pipeline uses adaptive throttle on import step
- [x] `--request-delay-ms` override uses fixed delay
- [x] `--no-adaptive-throttle` uses fixed delay
- [x] Deterministic pipeline summary includes `importThrottle`
- [x] `npm run lint`, `npm run test`, `npm run build`
