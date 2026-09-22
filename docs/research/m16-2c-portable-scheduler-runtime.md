# M16.2c — Portable unattended scheduler runtime path

## Problem

launchd under Full Disk Access / Desktop privacy cannot `getcwd` / execute
scripts under `~/Desktop/...` (exit 126). Manual Terminal invocation works.

Also, the wrapper previously preferred
`/Users/builder/Desktop/KalshiBot/load-kalshi-env.sh` over repo-local
`${REPO_ROOT}/load-kalshi-env.sh`, which would defeat relocation.

## Fix (operational only)

Env loader priority:

1. `KALSHI_ENV_LOADER` (explicit)
2. `${REPO_ROOT}/load-kalshi-env.sh`
3. legacy Desktop KalshiBot loader (interactive fallback only)

Scientific identities unchanged. No real validation capture in this PR.

## Follow-up (operator, post-merge)

Relocate unattended checkout to `/Users/builder/Developer/kalshi-builder2`,
credentials to `~/.kalshi`, reinstall launchd, smoke-test outside 17:55–18:05Z.
