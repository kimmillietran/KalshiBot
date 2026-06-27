# PR-5.3B — Engine Guard Layer

Milestone 5.3B adds `runEvaluationGuards()` with 13 ordered safety guards enforcing `EngineConfig` thresholds. Failures return NO TRADE, reasoning trace, `features: null`, and `gatesTriggered`.

**Base:** 5.3A feature vector integration.

See `src/lib/trading/guards/` for implementation and tests.
