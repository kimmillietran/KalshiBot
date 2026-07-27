# macOS operator setup (M12.1I)

Cross-platform KalshiBot operator workflows. TypeScript under `scripts/operator/`
is the single source of truth. Bash launchers are thin; Windows PowerShell
launchers remain as thin compatibility wrappers.

## 1. Install Node.js and npm

Install Node.js 20+ (includes npm). Verify:

```bash
node -v
npm -v
```

## 2. Repository paths

| Checkout | Path | Purpose |
| --- | --- | --- |
| Primary (do not commit here) | `~/Desktop/KalshiBot` | `main` / local credentials |
| Review worktree | `~/Desktop/kalshi-review` | Feature / fix branches |

```bash
cd ~/Desktop/kalshi-review
git fetch origin
git status --short   # must be clean before milestone work
```

## 3. zsh environment loader

Credentials stay outside git. Copy the example and edit paths:

```bash
cp scripts/shell/load-kalshi-env.sh.example ~/Desktop/KalshiBot/load-kalshi-env.sh
# edit KALSHI_KEY_DIR or file paths — never paste private key contents into shell history docs
```

Source before live operator commands (must be sourced, not executed):

```bash
source ~/Desktop/KalshiBot/load-kalshi-env.sh
# or: source ./load-kalshi-env.sh   if kept at repo root (gitignored)
```

Required exports (values never printed by operator CLIs beyond path labels):

- `KALSHI_API_KEY_ID`
- `KALSHI_API_PRIVATE_KEY_PATH`

Typical local filenames (not committed):

- `kalshi-api-key-id.txt`
- `kalshi-api.key.txt`

## 4. chmod

```bash
chmod +x \
  run-6h-capture.sh \
  run-8h-capture.sh \
  run-capture-restart-smoke.sh \
  run-capture-reconnect-smoke.sh \
  audit-latest-capture.sh
```

## 5. Install dependencies

```bash
npm ci
```

## 6. Deterministic acceptance commands (no Kalshi)

```bash
npm run research:capture-recovery-acceptance
npm run research:ws-reconnect-acceptance
```

Dry-run operator plans (no credentials, no capture.lock, no Kalshi):

```bash
npm run operator:capture-6h -- --dry-run-plan
npm run operator:capture-8h -- --dry-run-plan
npm run operator:capture-restart-smoke -- --dry-run-plan
npm run operator:capture-reconnect-smoke -- --dry-run-plan
npm run operator:audit-capture -- --latest --full --dry-run-plan
```

## 7. Smoke commands (live — credentials required)

Normal restart smoke (15–30 minutes; default 20):

```bash
source ~/Desktop/KalshiBot/load-kalshi-env.sh
npm run operator:capture-restart-smoke -- --duration-minutes 20
# or: ./run-capture-restart-smoke.sh --duration-minutes 20
```

Controlled reconnect smoke (15–20 minutes; default 20):

```bash
npm run operator:capture-reconnect-smoke -- --duration-minutes 20
# or: ./run-capture-reconnect-smoke.sh --duration-minutes 20
```

## 8. Audit commands

```bash
npm run operator:audit-capture -- --latest --full
npm run operator:audit-capture -- --run-id <runId> --full
npm run operator:audit-capture -- --run-dir data/live-capture/forward-quotes/<runId>
# or: ./audit-latest-capture.sh --latest --full
```

`--latest` prints the selected `runId` before auditing and does not silently
substitute a different run after selection.

## 9. Six-hour capture

Supported for existing operator workflows. Uses the canonical series / markets /
throttle / BTC / watchdog profile with **duration 360**.

```bash
npm run operator:capture-6h
# or: ./run-6h-capture.sh
```

This is labeled **NONCANONICAL-DURATION**. It does **not** satisfy or claim the
eight-hour restart gate.

## 10. Gated eight-hour capture

Safety-critical. Requires:

1. Capture preflight success (`blockers=[]`, `lockPresent=false`)
2. Canonical profile and duration exactly **480**
3. Explicit authorization from successful smoke runs — both flags required:

```bash
npm run operator:capture-8h -- \
  --authorized-by-restart-smoke-run-dir data/live-capture/forward-quotes/<restart-smoke-runId> \
  --authorized-by-reconnect-smoke-run-dir data/live-capture/forward-quotes/<reconnect-smoke-runId>
# or: ./run-8h-capture.sh --authorized-by-restart-smoke-run-dir ... --authorized-by-reconnect-smoke-run-dir ...
```

There is **no** `--force` / `--skip-gate` path. Stale `capture.lock` is never
deleted by the launcher.

## 11. Interruption behavior

`SIGINT` / `SIGTERM` are forwarded to the capture child. The parent waits for
stdout/stderr drain and log closure before exiting. No detached orphan capture.

## 12. Log paths

Tee'd UTF-8 logs:

```text
data/live-capture/logs/capture-<timestamp>.log      # 6h / custom
data/live-capture/logs/capture-8h-<timestamp>.log   # 8h
```

Capture artifacts:

```text
data/live-capture/forward-quotes/<runId>/
```

## 13. Exact-run identity

Progress and audits bind only to the `runId` / `outputDir` JSON published by the
capture command. There is **no** newest-directory or mtime fallback. If identity
is missing or malformed, the wrapper fails closed and preserves the log.

## 14. Recovery after a failed run

1. Read the tee log under `data/live-capture/logs/`.
2. If a `runId` was printed, audit that exact run (`--run-id` / `--run-dir`).
3. If `capture.lock` remains, reconcile manually — do not delete blindly from
   automation.
4. Re-run preflight:
   `npm run research:capture-restart-gate -- --assert-no-active-capture`
5. Re-run the appropriate smoke before another eight-hour attempt.

## 15. Commands that must never be used on capture data or locks

- `git clean -fdx` / deleting `data/live-capture/` while a capture is active
- Automated deletion of `capture.lock` by operator launchers
- Newest-directory heuristics for audits
- `--force` / `--skip-gate` style bypasses (rejected)
- Committing `data/`, logs, audits, keys, or `.env` files

## Windows compatibility

Thin PowerShell launchers still exist and call the same TypeScript CLIs:

```powershell
.\run-capture-restart-smoke.ps1 -DurationMinutes 20
.\run-capture-reconnect-smoke.ps1 -DurationMinutes 20
.\audit-latest-capture.ps1 -Full
.\run-6h-capture.ps1
.\run-8h-capture.ps1 -AuthorizedByRestartSmokeRunDir ... -AuthorizedByReconnectSmokeRunDir ...
```

Prefer `npm run operator:*` on all platforms when possible.
