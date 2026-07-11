<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Single Next.js 16 app (App Router), package manager is **npm** (`package-lock.json`). Standard commands live in `README.md` / `package.json` scripts: `npm run dev` (dashboard on port 3000 at `/`), `npm run lint`, `npm run test` (Vitest), `npm run build`.

Non-obvious notes for future agents:
- The dev server is the only service needed. The app's `src/app/api/*` BFF routes proxy to **public** external APIs (Coinbase for the live BTC price/candles, Kalshi for live BTC markets/pricing). No API keys/secrets are required for the core dashboard, but live UI use needs outbound internet to `api.exchange.coinbase.com` and `external-api.kalshi.com`.
- `npm run lint`, `npm run test`, and `npm run build` need **no** network — all external calls are mocked in the test suite.
- The many `scripts/research/*`, `scripts/import/*`, etc. `tsx` CLIs are offline research/backtesting tools that read/write `data/`; they are not part of the running app and are not needed to run or test the dashboard.
- The repo's git worktree guard (`scripts/git/pre-commit-worktree-guard.sh`) is only active in the user's local multi-worktree setup; it is not installed as a hook in the cloud VM, so it does not block cloud commits.
