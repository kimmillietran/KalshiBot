# lib/api

Outbound integrations and HTTP plumbing. Features depend on typed functions
here, never on raw fetch.

Deferred to a later milestone. Planned contents:

```
api/
  http.ts        # base fetch wrapper (auth, retries, error mapping)
  errors.ts      # ApiError taxonomy
  kalshi/        # REST + WS client, endpoints, mappers
  btc/           # REST + WS client, mappers
  internal/      # typed client for our own app/api routes
  query-keys.ts  # central query-key factory
```

Vendor payloads are mapped into `@/types/domain` before leaving this layer.
