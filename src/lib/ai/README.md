# lib/ai (future)

Provider-agnostic AI recommendation engine. The `recommendations` feature is a
thin UI over this.

Deferred to a later milestone. Planned: Vercel AI SDK adapters.

```
ai/
  providers/   # model adapters
  prompts/     # versioned prompt templates
  engine/      # signalEngine, featureBuilder (BTC + Kalshi -> features)
  strategies/  # rule/ml strategies -> Signal[]
  rationale.ts # human-readable explanations
  types.ts     # Signal, Recommendation, Confidence
```

Consumes normalized `@/types/domain` data; outputs recommendations served via
`app/api/ai`.
