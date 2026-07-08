# Unified Feature Catalog (M11.1)

KalshiBot computes features in three silos today:

| Layer | Location | Examples |
|-------|----------|----------|
| Trading-time | `src/lib/features/` | `buildMarketFeatureVector`, momentum, trend |
| Research observations | `MispricingObservation` + parsers | probability, moneyness, atlas volatility |
| Aggregate / regime studies | `src/lib/data/research/*` | vol premium, regime tags |

The unified catalog at `src/lib/data/research/features/` is the **metadata registry only**. It does not compute values.

## Catalog entry shape

Each feature defines:

- `id` — stable catalog identifier
- `displayName` — human label
- `sourceLayer` — `trading` | `research` | `aggregate` | `strategy` | `regime`
- `canonicalSource` — function, field, or derived extractor path
- `lookback` — bars/ms when applicable
- `units` / `outputType`
- `onMispricingObservation` — whether atlas observations carry the raw value
- `researchDimensionEligible` — safe to promote into M10 dimension registry
- `linkedResearchDimensionIds` — bucket views in the dimension registry
- `dependencies` — upstream catalog feature ids

## Query API

```typescript
import {
  listUnifiedFeatures,
  getUnifiedFeatureById,
  getUnifiedFeatureForResearchDimension,
  assertUnifiedFeatureCatalogIntegrity,
} from "@/lib/data/research/features";

const momentum = getUnifiedFeatureById("momentum15m");
const hourFeature = getUnifiedFeatureForResearchDimension("hourUtc");
assertUnifiedFeatureCatalogIntegrity();
```

## Adding a new feature (e.g. EMA, ATR, VWAP)

1. **Implement computation** in the correct layer:
   - Live/trading evaluation → `src/lib/features/<name>.ts` and wire into `buildMarketFeatureVector` when ready.
   - Research-only replay parsing → extend `parseMispricingObservations.ts` or a dedicated study parser.
   - Cross-market aggregate → new or existing study under `src/lib/data/research/<study>/`.

2. **Add a catalog entry** in `src/lib/data/research/features/catalog.ts`:
   - Pick a unique `id` (camelCase, no duplicates).
   - Set `canonicalSource.path` to the function or field that owns the math.
   - Document lookback defaults explicitly.
   - Set `onMispricingObservation` accurately.
   - List `dependencies` on other catalog ids when the feature reuses upstream signals.

3. **Promote to research dimension (optional, later milestone)**:
   - Add bucket definitions + extractor in `src/lib/data/research/dimensions/`.
   - Register in `RESEARCH_DIMENSIONS` / `RESEARCH_AXIS_GROUPS`.
   - Link the catalog entry via `linkedResearchDimensionIds`.
   - Extend `catalog.test.ts` to assert dimension coverage.

4. **Do not** duplicate math in the catalog — metadata only.

### Example stub for a future VWAP feature

```typescript
{
  id: "vwapDistancePercent",
  displayName: "VWAP distance percent",
  sourceLayer: "trading",
  canonicalSource: {
    kind: "function",
    path: "src/lib/features/vwap.vwapDistancePercent",
  },
  lookback: { bars: 20, description: "Session VWAP window" },
  units: "percent",
  outputType: "percent",
  onMispricingObservation: false,
  researchDimensionEligible: true,
  dependencies: [],
}
```

## Relationship to M10 dimension registry

Research dimensions are **bucket views** of underlying features. Multiple dimension ids (e.g. `probability`, `coarseProbability`, `coarseProbabilityAxis`) may reference one catalog feature (`predictedProbability`).

Temporal dimensions (`hourUtc`, `sessionBucket`, …) derive from `observationTimestampMs` at bucket time — they are cataloged separately with explicit dependencies.

## Integrity checks

`assertUnifiedFeatureCatalogIntegrity()` verifies:

- No duplicate ids
- Required metadata present
- Dependency graph resolves
- Every `RESEARCH_DIMENSIONS` entry maps to a catalog feature

Run via `src/lib/data/research/features/catalog.test.ts`.
