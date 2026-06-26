# lib/utils

Pure, dependency-light, unit-testable helpers. No React, no I/O.

`cn` (the Tailwind class merger) currently lives at `@/lib/utils` (file) for
shadcn compatibility. As helpers grow, this folder will hold:

```
utils/
  format/    # currency, percent, compact-number, date/time
  trading/   # impliedProbability, expectedValue, kellyFraction, pnl, roi
  date.ts
  guards.ts
```

The `trading/` math powers analytics + recommendations and must be well tested.
