# Kalshi BTC Edge — Engineering Standards

Permanent guidance for all contributors and Cursor Agent runs. Enforced automatically via [Cursor Rules](../.cursor/rules/).

## Architecture principles

Kalshi BTC Edge uses a **feature-module (vertical slice)** architecture:

- **`src/app/`** — Thin routing layer only. Pages compose features; route handlers act as a BFF/proxy. No business logic.
- **`src/features/`** — Business capabilities as self-contained modules (`components`, `hooks`, `api`, `types`, `index.ts` barrel).
- **`src/components/`** — Shared, presentation-only UI (layout shell, design-system primitives, shadcn/ui).
- **`src/lib/`** — Infrastructure: design system, API clients, formatting utils, future `db/` and `ai/` stubs.
- **`src/providers/`**, **`src/hooks/`**, **`src/types/`** — App-wide providers, generic hooks, shared domain types.

### Rules of thumb

1. **Analyze before building** — Identify which feature module owns the change.
2. **Reuse before creating** — Extend existing components and hooks.
3. **Thin pages** — Dashboard pages import from `features/*`, not the reverse.
4. **Barrel exports** — Cross-feature imports use `features/<name>/index.ts` only.
5. **Design system first** — Use tokens from `src/lib/design-system/` and `src/styles/tokens.css`. Never hardcode colors, spacing, typography, motion, or radii.

## Testing philosophy

Tests are not optional. The stack is:

- **Vitest** — unit and integration tests
- **React Testing Library** — component smoke/render tests
- **jsdom** — browser-like environment
- **@testing-library/jest-dom** — DOM matchers

| Layer | Expectation |
|-------|-------------|
| Pure utilities | Unit tests with edge cases |
| Hooks | Tests when behavior is non-trivial |
| Shared components | Smoke tests (renders without crash, key content visible) |
| API routes | Success and failure paths |
| Bug fixes | Regression test |

Keep tests **practical**: no large snapshots, no brittle Tailwind class assertions outside design-system exports.

Helper: `src/test/test-utils.tsx` (e.g. `renderWithBtcFeed` for dashboard tests).

## Roadmap philosophy

Development proceeds in **milestones**. Each milestone is scoped, reviewable, and shippable.

- Implement **only** what the current milestone requests.
- Do not "helpfully" add auth, database, AI, Kalshi integration, journal, or analytics early.
- When future work affects today's design, create **interfaces and folder stubs** — implement behavior later.
- Prefer mocks and static data until the integration milestone arrives.

See milestone progress in the project README and `.cursor/rules/roadmap.mdc`.

## Definition of Done

A task is complete when:

1. Code meets architecture and design-system standards.
2. Appropriate tests are added or updated.
3. All quality gates pass:

```bash
npm run lint
npm run build
npm run test
```

4. The implementation summary documents decisions, files, dependencies, tests, and deferred work.

## Quality gates

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint — style and import hygiene |
| `npm run build` | TypeScript strict + Next.js production build |
| `npm run test` | Vitest unit/component suite |
| `npm run test:coverage` | Optional coverage report |

## Dependency policy

Before adding a package:

1. Explain **why** it is needed.
2. Check if an existing dependency already solves the problem.
3. Prefer lean, well-maintained libraries.
4. Avoid heavy frameworks (TradingView, ORMs, state libraries) until their milestone.

## Implementation workflow

Every feature or fix should follow this sequence:

1. **Review milestone** — Confirm scope; identify what is explicitly out of scope.
2. **Analyze architecture** — Map the change to `features/`, `components/`, or `lib/`.
3. **Plan implementation** — List files to create/modify; note design-system tokens to use.
4. **Build feature** — Minimal diff; no unrelated changes.
5. **Add tests** — Unit, smoke, or API tests as appropriate.
6. **Run lint** — `npm run lint`
7. **Run build** — `npm run build`
8. **Run tests** — `npm run test`
9. **Summarize work** — Architecture decisions, files, dependencies, tests, deferred items.

## Cursor Rules (automatic enforcement)

These rules apply to every Agent session:

| Rule | File |
|------|------|
| Architecture | [`.cursor/rules/architecture.mdc`](../.cursor/rules/architecture.mdc) |
| Testing | [`.cursor/rules/testing.mdc`](../.cursor/rules/testing.mdc) |
| Roadmap | [`.cursor/rules/roadmap.mdc`](../.cursor/rules/roadmap.mdc) |

Cursor loads `alwaysApply: true` rules automatically — no manual paste required per session.
