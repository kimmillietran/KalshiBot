# Kalshi BTC Edge

AI-powered trading assistant for Kalshi BTC markets. Built in milestones.

**Current:** Live BTC/Kalshi feeds (4.6B) + full trading engine through settings UI (5.0–5.11B) + historical data layer (6.1A–6.3B). `src/lib/data/` defines Bronze/Silver schemas; `InMemoryBronzeStore` provides append-only bronze storage; `KalshiHistoricalHttpAdapter` maps live Kalshi payloads to bronze; `SilverNormalizer` converts bronze to validated Silver records; `assembleHistoricalTradingSnapshot()` builds immutable replay-ready snapshots from Silver envelopes. Dashboard copies raw `TradeDecision` JSON via Engine Reasoning panel. Replay engine, filesystem persistence, and trade execution deferred.

## Engineering Standards

All future work — human or Agent — follows permanent project governance:

- **[Engineering Standards](docs/engineering-standards.md)** — architecture, testing, roadmap, definition of done, workflow
- **[Cursor Rules](.cursor/rules/)** — automatic Agent guidance (`architecture.mdc`, `testing.mdc`, `roadmap.mdc`)

Cursor loads these rules on every Agent run (`alwaysApply: true`). No need to paste instructions each session.

## Git workflow

Milestone development uses feature branches, review, merge to `main`, and milestone tags. See **[Git Workflow](docs/git-workflow.md)** for the full process.

## Tech stack

- Next.js (App Router) + React 19
- TypeScript (strict mode)
- Tailwind CSS v4 + shadcn/ui
- Vitest + React Testing Library
- Dark theme by default

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000 — the trading dashboard renders at `/`.

```bash
npm run build    # production build
npm run lint     # eslint
npm run test     # vitest
npm run test:watch
npm run test:coverage
npm run discover:markets -- --series KXBTC15M --output discovery-result.json
```

## Project structure

```
src/
  app/                    # thin routes + BFF (api/btc, api/kalshi)
  components/             # shared UI + layout shell
  features/               # business modules (btc-feed, trading-dashboard, …)
  lib/                    # design-system, trading engine, data contracts, utils
  types/domain/           # shared domain types (trading engine I/O)
  test/                   # shared test helpers
docs/
  engineering-standards.md
.cursor/rules/            # Cursor Agent rules (always on)
```

## Milestone status

| Milestone | Scope |
|-----------|-------|
| 1 | Foundation, shell, folder architecture |
| 2 | Mock trading cockpit |
| 2.5–2.6 | Design system + UI polish |
| 3 | Live BTC price feed (BFF polling, now Coinbase via 4.6) |
| 4A | Live Kalshi market discovery (metadata, target, countdown) |
| 4.5 | TanStack Query server-state foundation |
| 4B | Live Kalshi contract pricing (YES/NO bid/ask, volume) |
| 4.6 | BTC provider abstraction (Coinbase default, typed BFF errors) — **complete** |
| 4.6B | Provider chain, Kraken failover, health/metrics — **complete** |
| 4.7 | Dashboard truthfulness, chart target clarity — **complete** |
| 5.0 | Pure trading engine foundation (`evaluate`, guards, reasoning trace) — **complete** |
| 5.2 | Feature builder foundation (`buildMarketFeatureVector`) — **complete** |
| 5.1 | Engine snapshot wiring + dashboard integration — **complete** |
| 5.3A | Feature vector integration (`TradeDecision.features`) — **complete** |
| 5.3B | Engine guard layer (`runEvaluationGuards`, 15 guards, `gatesTriggered`) — **complete** |
| 5.4A | Deterministic probability model (`estimateProbability`) — **complete** |
| 5.4B | Engine probability wiring (`TradeDecision.probability`, `ENGINE_VERSION` 5.4.0) — **complete** |
| 5.5A | Expected value model (`estimateExpectedValue`) — **complete** |
| 5.5B | Engine EV wiring (`TradeDecision.expectedValue`, `ENGINE_VERSION` 5.5.0) — **complete** |
| 5.6A | Decision policy module (`evaluateDecisionPolicy`) — **complete** |
| 5.6B | Engine decision policy wiring (`TradeDecision.action`, `ENGINE_VERSION` 5.6.0) — **complete** |
| 5.6C | Decision dashboard integration (live `TradeDecision` rendering) — **complete** |
| 5.7A | Kelly position sizing module (`estimatePositionSize`) — **complete** |
| 5.7B | Engine position sizing wiring (`TradeDecision.positionSize`, `ENGINE_VERSION` 5.7.0) — **complete** |
| 5.7C | Dashboard position sizing display (`PositionSizeSummary`, `TradeManagementPanel`) — **complete** |
| 5.8A | Reasoning presentation module (`summarizeTradeDecision`) — **complete** |
| 5.8B | Dashboard reasoning integration (`AIReasoningPanel`, `TechnicalTraceList`) — **complete** |
| 5.9A | Bankroll configuration core (`resolveBankroll`) — **complete** |
| 5.9B | Bankroll engine wiring (`model-bankroll`, Kelly dollar sizing) — **complete** |
| 5.10A | Settings configuration core (`resolveTradingSettings`) — **complete** |
| 5.10B | Dashboard settings UI (`TradingSettingsPanel`, session-only form → engine) — **complete** |
| 5.11A | Engine snapshot presentation core (`summarizeEngineSnapshot`) — **complete** |
| 5.11B | Dashboard TradeDecision JSON export (`DecisionExportButton`, clipboard helper) — **complete** |
| 6.1A | Historical data contracts (`src/lib/data/`, Bronze/Silver schemas, UTC timestamps) — **complete** |
| 6.1B | Kalshi Historical API importer spike (`KalshiHistoricalImporter`, injectable HTTP) — **complete** |
| 6.2A | Bronze storage core (`BronzeStore`, `InMemoryBronzeStore`, stable serialization) — **complete** |
| 6.2B | Kalshi historical HTTP adapter + bronze mapping (`KalshiHistoricalHttpAdapter`) — **complete** |
| 6.3A | Silver normalization core (`SilverNormalizer`, content-type dispatch, schema-validated outputs) — **complete** |
| 6.3B | Historical snapshot assembler (`assembleHistoricalTradingSnapshot`, provenance preservation) — **complete** |
| 6.22A | Historical Kalshi market discovery CLI (`discovery:markets`, `discovery-result.json`) — **complete** |
| 6.22B | Batch import config generator (`discovery:import-configs`, per-market `config.json`) — **complete** |
| 6.22C | Batch historical import runner (`import:batch`, `batch-import-summary.json`) — **complete** |
| 6.22D | Organized dataset storage (`datasets:build`, `dataset-manifest.json`) — **complete** |
| 6.23A | Batch fixture bridge (`fixtures:batch`, `import-result.json` → `fixture.json`) — **complete** |
| 6.23B | Research dataset registry (`research:registry`, replay-ready fixture indexing) — **complete** |
| 6.23C | Batch research runner (`research:batch`, `batch-research-summary.json`) — **complete** |
| 6.23D | Aggregate research statistics (`research:aggregate`, batch output summaries) — **complete** |
| 6.24A | Strategy plugin interface (`StrategyPluginRegistry`, `resolveResearchStrategy`) — **complete** |
| 6.24B | Baseline strategy pack (noop, buy-first-ask, buy-below-probability, simple-momentum, simple-mean-reversion) — **complete** |

## Intentionally deferred

Dynamic AI recommendations, trade execution, auth, database, journal, analytics, WebSockets beyond current polling, historical replay/backtesting, filesystem/DB bronze persistence, Zustand, Drizzle, Auth.js, Vercel AI SDK, Playwright e2e. See [technical debt](docs/technical-debt.md).
