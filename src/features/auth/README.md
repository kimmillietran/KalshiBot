# Feature: auth

Session, profile, and account settings.

Deferred to a later milestone. Will integrate Auth.js (NextAuth v5) and gate the
`(dashboard)` route group.

Interacts with: `app/api/auth`, `lib/db` (users/accounts). Consumed by the auth
routes and the dashboard layout guard.
