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
```

On Windows PowerShell, `npm run <script> -- --flag value` may strip `--flag` tokens before they reach the script. Pipeline CLIs normalize argv at entry so both flag-style npm invocations and direct positional `tsx` usage work. See `scripts/lib/normalizeNpmArgv.ts`.

### Historical market discovery

```bash
npm run discover:markets -- --series KXBTC15M --output discovery-result.json

npm run discover:markets -- --series KXBTC15M --limit 50

npm run discover:markets -- \
  --series KXBTC15M \
  --after 2026-01-01 \
  --before 2026-02-01 \
  --limit 100

npm run discover:markets -- \
  --series KXBTC15M \
  --offset 500 \
  --limit 250

# Safe 50-market smoke test with throttling/backoff
npm run discover:markets -- \
  --series KXBTC15M \
  --limit 50 \
  --request-delay-ms 500 \
  --max-retries 5 \
  --retry-base-delay-ms 1000 \
  --output discovery-result.json
```

Default output: `discovery-result.json` (override with `--output`). Progress logs stream to stderr (`[discover] ...`); stdout remains JSON summary.

### Official research pipeline

```bash
npm run research:pipeline -- --series KXBTC15M --limit 500

# Smaller smoke run
npm run research:pipeline -- --series KXBTC15M --limit 100

# Continue after step failures (overall status becomes partial)
npm run research:pipeline -- --series KXBTC15M --limit 100 --continue-on-error
```

Writes `data/research-results/pipeline-summary.json` with per-step commands, exit codes, durations, and import throttle settings (`config.importThrottle`). Default is fail-fast.

Batch import uses **adaptive throttling** by default (`--adaptive-throttle`, 100–3000 ms). Override with fixed delay:

```bash
npm run research:pipeline -- --series KXBTC15M --limit 500 --request-delay-ms 1000
npm run research:pipeline -- --series KXBTC15M --limit 500 --no-adaptive-throttle
```

Long-running **batch import** and **strategy sweep** steps stream live progress to stderr (`[Import]` / `[Sweep]` blocks with bar, ETA, and counters). Stdout remains machine-readable JSON summaries.

### Smoke-test debugging

Runner-format `research-output.json` files double-encode `dataset` and `researchRun`, and fills live under `backtestResult.strategyRun.steps` — not at the top level. Use the inspect CLI instead of ad hoc PowerShell property access:

```bash
# Single run
npm run research:inspect -- --input data/research-results/buy-first-ask/KXBTC15M/KXBTC15M-26APR301900-00/research-output.json

# Scan a strategy folder
npm run research:inspect -- --input-dir data/research-results --strategy buy-first-ask --limit 5
```

Stdout is compact JSON with `strategyId`, PnL, fill/rejection counts, replay step count, diagnostics warnings, and `decisionTracePath` when available.

### Hypothesis evidence report

`npm run research:hypotheses` writes `data/research-results/hypothesis-candidates.json` and a human-readable `data/reports/research-hypotheses.html` with per-hypothesis evidence cards (metrics, confidence summary, and example markets). The generator scans expanded mispricing atlas bucket combinations (probability × time, probability × moneyness, moneyness × time, volatility × moneyness, and volatility × probability × time when sample sizes permit), emits separate over/under confidence hypotheses per qualifying cell, and filters single-day-dominated buckets via `--min-unique-days` (default 2). Override paths with `--output` and `--html-output`.

### Research artifact index

Inspect the health of all canonical research outputs in one place:

```bash
npm run research:artifact-index
```

Writes `data/research-results/research-artifact-index.json` and `data/reports/research-artifact-index.html`. Each entry includes artifact name, path, generated timestamp, producing pipeline step, upstream/downstream dependencies, file size, and status (`present`, `stale`, or `missing`). This is read-only — it does not run or modify the research pipeline.

### Historical coverage expansion planner

Analyze current historical coverage and get prioritized import recommendations:

```bash
npm run research:coverage-plan
```

Writes `data/research-results/historical-coverage-plan.json` and `data/reports/historical-coverage-plan.html` with market counts, month coverage, missing months, volatility regime coverage, market-type/ticker pattern coverage, and recommended next import windows with priority scores. Read-only — does not run imports or modify importer/replay/research calculations.

### Research dashboard

```bash
npm run research:dashboard
```

Writes `data/reports/research-dashboard.html` — a read-only landing page with pipeline status, artifact health, hypothesis/strategy summaries, and research health from existing artifacts.

### Full research orchestrator

```bash
npm run research:full
```

Invokes existing research CLIs in order: data health → mispricing atlas → hypotheses → validation → synthesis → harness (with `--input data/research-results/strategy-synthesis-candidates.json`) → harness results → candidate registry → candidate promotions → artifact index → lifecycle → dashboard. Writes `data/research-results/full-research-summary.json` with per-step status, duration, outputs, warnings, and failures. Independent reporting steps still run when upstream analysis fails. When no synthesized strategies match harness filters, the harness step no-ops with an empty summary and a single warning. Use `--continue-on-error` to keep executing the core chain after step failures.

### Strategy harness

```bash
npm run research:harness -- --input data/research-results/strategy-synthesis-candidates.json
```

Evaluates promotion-eligible synthesized strategies (`experimental`, `candidate`) through the historical research pipeline. Rejected strategies are excluded by default; pass `--include-rejected` for research experiments. When no strategies match filters, the harness exits successfully with an empty summary and one warning.

### Strategy synthesis

`npm run research:strategy-synthesis` reads `hypothesis-candidates.json` and `hypothesis-validation.json`, then writes `data/research-results/strategy-synthesis-candidates.json` with parameterized strategy specs (direction, entry conditions, promotion status). Read-only — does not execute or modify strategies.

### Harness results

`npm run research:harness-results` reads `strategy-synthesis-candidates.json` and M8.15B harness outputs under `data/research-results/harness/`, then writes `data/research-results/harness-results.json` and `data/reports/research-harness-results.html` with per-strategy PnL metrics and promotion recommendations. Reporting only — does not modify replay or baseline strategy results.

### Candidate promotions

`npm run research:candidate-promotions` reads hypothesis validation, strategy synthesis, harness results (with harness-summary fallback), and optional statistical significance, then writes `data/research-results/candidate-promotions.json` and `data/reports/research-candidate-promotions.html` with advisory promotion decisions (`rejected`, `exploratory`, `needs-more-data`, `candidate`, `production-watchlist`). Read-only — does not modify strategy execution, trading, leaderboard, or sweep behavior.

### Candidate registry

`npm run research:candidate-registry` merges hypothesis, validation, synthesis, and harness artifacts into `data/research-results/research-candidate-registry.json` and `data/reports/research-candidate-registry.html` with stable candidate IDs, status tracking, promotion history, and rejection reasons. Read-only append/update registry — does not modify replay, strategies, sweep, or hypothesis generation.

### Research experiment manager

```bash
npm run research:experiments
```

Snapshots the current research outputs as an immutable experiment under `data/research-results/experiments/<experimentId>/experiment.json`, updates `data/research-results/experiment-index.json` (latest pointer + history), and writes `data/reports/research-experiments.html` with deltas vs the previous experiment (hypothesis counts, robustness, promotions, candidates, runtime, artifact status). Read-only — does not modify replay, strategy execution, trading, or hypothesis calculations.


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
| 6.24C | Strategy leaderboard (`leaderboard:strategies`, `strategy-leaderboard.json`) — **complete** |
| 6.24D | Strategy sweep runner (`research:sweep`, per-strategy research outputs) — **complete** |
| 6.25A | Execution cost model foundation (fees, gross/net PnL metrics, optional `costModelConfig`) — **complete** |
| 6.25C | Historical bid/ask preservation audit (trade-close-only API; `missing-bid-ask` flag on live imports) — **complete** |
| 6.25D | Kalshi fee schedule execution cost model (`zero`, `per-contract-fee`, `kalshi-fee-schedule` via `costModelConfig`) — **complete** |
| 6.26A | Diffusion fair value strategy (`fair-value-diffusion`, realized vol + edge threshold) — **complete** |
| 6.26B | Probability calibration reports (`research:calibration`, Brier/log-loss/ECE/reliability) — **complete** |
| 6.26C | Historical market sampling controls (`discover:markets` `--limit`/`--offset`/`--after`/`--before`) — **complete** |
| 6.27A | Walk-forward validation engine (`research:walk-forward`, rolling train/validation folds) — **complete** |
| 6.27B | Experiment registry (`experiments:register`, immutable reproducibility records) — **complete** |
| 6.27C | Walk-forward strategy sweep (`research:walk-forward-sweep`, OOS validation research) — **complete** |
| 6.27D | Kalshi discovery rate-limit handling (`discover:markets` throttle + 429 retry/backoff) — **complete** |
| 6.27E | Discovery early stop + progress logging (`--limit` smoke pagination stop, stderr progress) — **complete** |
| 8.4 | Official research pipeline (`research:pipeline`, end-to-end orchestration CLI) — **complete** |
| 8.17 | Research artifact index (`research:artifact-index`, centralized output health dashboard) — **complete** |
| 8.18 | Research pipeline dashboard (`research:dashboard`, read-only research landing page) — **complete** |
| 8.19 | End-to-end research orchestrator (`research:full`, post-pipeline workflow CLI) — **complete** |
| 8.19B | Full orchestrator update (harness input, harness-results, registry, promotions) — **complete** |
| 8.21 | Candidate promotion engine (`research:candidate-promotions`, advisory read-only classification) — **complete** |
| 8.20 | Research candidate registry (`research:candidate-registry`, canonical pipeline candidate records) — **complete** |
| 8.25 | Research experiment manager (`research:experiments`, immutable run snapshots + comparison report) — **complete** |

## Intentionally deferred

Dynamic AI recommendations, trade execution, auth, database, journal, analytics, WebSockets beyond current polling, historical replay/backtesting, filesystem/DB bronze persistence, Zustand, Drizzle, Auth.js, Vercel AI SDK, Playwright e2e. See [technical debt](docs/technical-debt.md).
