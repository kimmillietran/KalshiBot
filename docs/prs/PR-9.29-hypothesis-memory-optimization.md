# PR-9.29 — Hypothesis Candidate Memory Optimization

## Summary

Eliminates the heap OOM in `npm run research:hypotheses` by replacing per-candidate research-output rescans with a single-pass bucket evidence index during hypothesis evidence generation.

## Cause of OOM

After M9.18 fixed mispricing atlas memory usage, the bottleneck shifted to hypothesis evidence collection:

1. **`listResearchOutputPaths` loaded every research output JSON** via `scanCalibrationResearchOutputs` just to collect paths — materializing ~9,100 full file payloads before evidence building began
2. **`collectHypothesisExampleMarkets` and `countUniqueTradingDaysForCandidate`** scanned every `research-output.json` for **each** atlas hypothesis candidate
3. Each per-candidate scan parsed the full JSON payload and materialized all mispricing observations
4. With ~9,100 research outputs, ~136,000 observations, and multiple candidates, this became `preload(all files) + candidates × files × 2` — exceeding the default Node heap immediately after mispricing-atlas completed

Candidate generation itself was lighter but redundantly called `normalizeMispricingAtlas()` multiple times per build.

## Memory strategy

### Path enumeration (critical fix)

- Replace `scanCalibrationResearchOutputs` with **`enumerateCalibrationResearchOutputPaths`** in the hypotheses CLI — paths only, no file reads

### Evidence phase (primary fix)

- **`collectAtlasBucketReferences`** — dedupe atlas bucket refs required by candidates
- **`buildHypothesisEvidenceBucketIndex`** — scan each research output **once**, route matching observations into compact per-bucket accumulators (top-10 example markets + trading-day sets)
- **`buildHypothesisEvidenceReport`** — build the index once and pass it to all evidence cards
- Legacy per-candidate scan path retained when no index is provided (unit-test parity)

### Candidate phase (secondary fix)

- Call **`normalizeMispricingAtlas()` once** per `buildHypothesisCandidates` invocation and reuse the normalized structure

No changes to hypothesis scoring, ranking, robustness, statistical significance, promotion thresholds, or JSON output schema (aside from optional `memoryDiagnostics` when `--memory-report` is enabled).

## CLI

Optional memory instrumentation:

```bash
npm run research:hypotheses -- --memory-report
```

When enabled:

- `hypothesis-candidates.json` may include `memoryDiagnostics` (candidate counts, atlas observation count)
- Evidence build records `memoryDiagnostics` on the internal report and echoes `evidenceMemoryDiagnostics` on stdout

Evidence diagnostics include:

- `researchOutputFilesScanned`
- `atlasBucketReferenceCount`
- `observationsProcessed`
- `peakHeapUsedBytes` (when `process.memoryUsage` is available)
- `largestFileBytes` / `largestFilePath`
- `largestIntermediateCollection`

## Estimated memory reduction

| Phase | Before | After |
|-------|--------|-------|
| Path listing | Loads all ~9,100 JSON files | Path enumeration only |
| Evidence file reads | `O(candidates × files)` | `O(files)` |
| Retained observation arrays | Per-candidate full rescans | Single-pass bucket accumulators |

Validated on the full corpus (~9,113 files, ~136,692 observations): `research:hypotheses --memory-report` completes in ~95s with **~138 MB peak heap** (no `NODE_OPTIONS` override).

## Remaining limitations

- Bucket index still iterates `references × observations` per file; further gains would require pre-indexed bucket keys on observations
- Lead-lag evidence still reads individual market outputs for examples (smaller corpus)
- `finalizeExampleMarkets` still allocates a sorted slice per lookup (bounded to ≤10 markets)

## Verification

```bash
npm run lint
npm run test
npm run build
npm run research:mispricing-atlas
npm run research:hypotheses
npm run research:full
```

Expected: hypotheses stage completes without `NODE_OPTIONS` heap overrides; evidence cards and candidate rankings remain unchanged for the same inputs.
