# Feature: recommendations

AI trade signals UI: recommendation cards, confidence, and human-readable
rationale. Stays a thin presentation layer over the AI engine in `lib/ai`.

Deferred to a later milestone.

Interacts with: `lib/ai` (engine), `app/api/ai` (BFF), `@/types/domain`.
Consumed by the recommendations route and dashboard.
