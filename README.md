# Kalshi BTC Edge

AI-powered trading assistant for Kalshi BTC markets. Built in milestones.

**Current:** Live BTC/Kalshi feeds (4.6B) + trading engine (5.0–5.1) + feature builder (5.2) + feature-vector integration (5.3A) + guard layer (5.3B) + probability model (5.4A/B) + expected value model (5.5A). `estimateExpectedValue()` compares model probability to Kalshi asks; **not yet wired into `evaluate()`** — Builder #2 integrates in 5.5B; decisions remain `NO TRADE` until policy (5.6+).

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

## Project structure

```
src/
  app/                    # thin routes + BFF (api/btc, api/kalshi)
  components/             # shared UI + layout shell
  features/               # business modules (btc-feed, trading-dashboard, …)
  lib/                    # design-system, trading engine, feature builder, utils
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
| 5.5B | Engine EV wiring — in progress (Builder #2) |
| 5.6+ | Decision policy, Kelly, dashboard EV/probability UI, auth, db, journal |

## Intentionally deferred

Dynamic AI recommendations, trade execution, auth, database, journal, analytics, WebSockets beyond current polling, Zustand, Drizzle, Auth.js, Vercel AI SDK, Playwright e2e. See [technical debt](docs/technical-debt.md).
