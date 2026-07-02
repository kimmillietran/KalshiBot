# PR: Shared Windows/NPM CLI Arg Normalizer

## Summary

Centralizes argv normalization for npm-run CLIs so flag-style invocations work on Windows PowerShell, where `npm.ps1` strips `--flag` tokens and forwards only bare values positionally.

## Root cause

On Windows, `npm run <script> -- --flag value` is handled by PowerShell's `npm.ps1` shim. npm treats tokens starting with `--` as npm configuration (setting `npm_config_*` env vars) rather than forwarding them to the script.

Verified behavior:

```powershell
npm run arg-test -- --input A --output-dir B
# script receives: ["A", "B"]
# npm_config_input: "true" (not the path value)
```

Workarounds investigated:

| Approach | Result |
|----------|--------|
| `.npmrc` `script-shell=cmd.exe` | Does not fix PowerShell `npm run` |
| Rely on `npm_config_*` env vars | Values are `"true"`, not actual flag values |
| `cmd /c npm run ...` | Preserves flags, but poor default UX |

**Conclusion:** No reliable project-wide root-cause fix for PowerShell `npm run`. A shared normalization layer at CLI entry points is the correct approach.

## Solution

### Shared helper (`scripts/lib/normalizeNpmArgv.ts`)

- `normalizeNpmScriptArgv(argv, schema)` — map positional tokens to flags when no explicit flags present
- `expandEqualsStyleFlags` — support `--flag=value`
- `mergeNpmBooleanFlags` / `mergeNpmConfigFlags` — re-inject flags consumed entirely by npm (e.g. `--all`)
- `normalizeNpmScriptArgvWithPositionalParser` — custom positional heuristics

### Per-command schemas (`scripts/lib/cliArgvSchemas.ts`)

Schemas and specialized normalizers for each smoke-test pipeline CLI.

### Discovery (`scripts/discovery/normalizeDiscoveryCliArgv.ts`)

Refactored to use shared primitives while preserving discovery-specific positional heuristics (series, numeric rate-limit flags, output path).

## CLIs updated

| npm script | Normalizer |
|------------|------------|
| `discover:markets` | `normalizeDiscoveryCliArgv` |
| `discovery:import-configs` | `normalizeDiscoveryImportConfigsArgv` |
| `import:batch` | `normalizeImportBatchArgv` |
| `data:audit-bid-ask` | `normalizeDataAuditBidAskArgv` |
| `datasets:build` | `normalizeDatasetsBuildArgv` |
| `fixtures:batch` | `normalizeFixturesBatchArgv` |
| `research:registry` | `normalizeResearchRegistryArgv` |
| `research:walk-forward` | `normalizeWalkForwardValidationArgv` |
| `research:walk-forward-sweep` | `normalizeWalkForwardSweepArgv` |
| `research:sweep` | `normalizeStrategySweepArgv` |
| `research:aggregate` | `normalizeResearchAggregateArgv` |
| `leaderboard:strategies` | `normalizeLeaderboardStrategiesArgv` |
| `research:calibration` | `normalizeResearchCalibrationArgv` |
| `experiments:register` | `normalizeExperimentsRegisterArgv` |

## Backward compatibility

- Explicit `--flag value` invocations unchanged (direct `tsx` or `cmd /c npm run`)
- Existing positional invocations continue to work where already supported
- `discover:markets` sampling, rate-limit, and early-stop flags preserved

## Tests

- `scripts/lib/normalizeNpmArgv.test.ts` — core helper behavior
- `scripts/lib/cliArgvSchemas.test.ts` — schema normalizers
- Updated CLI tests for positional argv on pipeline commands

## Example

```powershell
npm run discovery:import-configs -- `
  --input discovery-result.json `
  --output-dir data/import-configs
```

npm forwards `["discovery-result.json", "data/import-configs"]`; the normalizer maps to explicit flags before parsing.

## Test plan

- [x] `npm run lint`
- [x] `npm run test`
- [x] `npm run build`
- [ ] Manual: run 50-market smoke-test pipeline on Windows PowerShell with flag-style npm commands
