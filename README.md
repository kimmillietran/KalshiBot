# Kalshi BTC Edge

AI-powered trading assistant for Kalshi BTC markets. Built in milestones.

**Current:** Live BTC/USD feed (Milestone 3) + mock Kalshi trading cockpit, design system, and test suite.

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
  app/                    # thin routes + BFF (api/btc)
  components/             # shared UI + layout shell
  features/               # business modules (btc-feed, trading-dashboard, …)
  lib/                    # design-system, utils, infrastructure
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
| 3 | Live BTC price feed (Binance BFF, polling) |
| 4+ | Kalshi API, dynamic recommendations, auth, db, journal, analytics |

## Intentionally deferred

Kalshi API, dynamic AI recommendations, trade execution, auth, database, journal, analytics, WebSockets beyond current BTC polling, TanStack Query, Zustand, Drizzle, Auth.js, Vercel AI SDK, Playwright e2e.
