# Git Workflow

This document describes the standard Git workflow for Kalshi BTC Edge milestone development.

## Milestone workflow

For every milestone:

### 1. Create a feature branch

```bash
git checkout -b milestone-x
```

Replace `x` with the milestone number (e.g. `milestone-4`).

### 2. Complete implementation

Implement the milestone scope only. Do not build future milestones early. See [Engineering Standards](engineering-standards.md) and [Roadmap](../.cursor/rules/roadmap.mdc) for scope boundaries.

### 3. Run quality checks

Before requesting review, all checks must pass:

```bash
npm run lint
npm run build
npm run test
```

### 4. Review

Have the Reviewer Agent review the branch. Address critical issues and recommended improvements before merge.

### 5. Merge into `main`

Merge the feature branch into `main` once review is complete and all checks pass.

```bash
git checkout main
git merge milestone-x
```

### 6. Tag the milestone

Tag the merge commit on `main`:

```bash
git tag milestone-x
```

## Branch naming

| Pattern | Purpose |
|---------|---------|
| `main` | Stable, milestone-complete code |
| `milestone-x` | Milestone feature work |

## Commit messages

Write concise messages that explain **why**, not just what changed. Examples:

- `Add Binance BFF routes for live BTC feed`
- `Fix stale feed detection when candles fail silently`

## Initial state

The repository was initialized with Milestones 1–3 complete on `main`.
