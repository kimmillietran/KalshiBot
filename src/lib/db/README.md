# lib/db (future)

Persistence layer. The rest of the app depends on repositories, not SQL.

Deferred to a later milestone. Planned: Postgres + Drizzle ORM.

```
db/
  client.ts       # Drizzle client / pool
  schema/         # users, accounts, trades, journalEntries, watchlists, signals
  repositories/   # userRepo, journalRepo, watchlistRepo
  seed.ts
```

Only Server Actions / route handlers call repositories. Swapping providers
touches only this folder.
