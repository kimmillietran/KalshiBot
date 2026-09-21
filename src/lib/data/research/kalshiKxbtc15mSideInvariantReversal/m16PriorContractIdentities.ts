/**
 * M16.1 prior (superseded) contract identity constants.
 * Economic outcomes were never opened under these contracts.
 */
export const M16_FAMILY_DEFINITION_IDENTITY =
  "e98e6180b1edc468d544cbc41a624b8201535b2e9e58121d7669079fcf5cbce0" as const;

export const M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY =
  "d1a6ca1288ac9b5c7a6fc72c36e9e8c0a9faf58c61383e74d91a659c34c99e4a" as const;

export const M16_1_PRIOR_DEPENDENCE_PLAN_IDENTITY =
  "feefd4f9d88e872e0e16523acfe42ae2e6d6add5d2cf8b159195fc18dde61264" as const;

export const M16_1_PRIOR_COHORT_PLAN_IDENTITY =
  "ec642619e47b7c091ec10447747090d4f2dd3d58a9f7dc8de3eb8dafc2ed6e43" as const;

/** Fee authority unchanged by M16.1a / M16.1b. */
export const M16_AUTHORITATIVE_FEE_CONTRACT_IDENTITY =
  "86f5f152308096fb365bb4ef41dca8beb488a302f038a915c8b228c0b645b44d" as const;

/** M16.1a cohort (14:00–18:00Z) — superseded by M16.1b before first capture. */
export const M16_1A_PRIOR_COHORT_PLAN_IDENTITY =
  "294aa283c8b99269e7c5fd36282b826ffc6a601ee9d1b7b88af62b8bfc2e71f8" as const;

/** M16.2 scientific protocol under 14:00–18:00Z — superseded by M16.1b. */
export const M16_1A_PRIOR_SCIENTIFIC_PROTOCOL_IDENTITY =
  "453d5f2469642cdfc0d66989fe6fc40d6d9d59852266aaf2f9473cf4bd93bc59" as const;

export const M16_1A_AMENDMENT_REASON =
  "Prospective dependence/power collection amendment before any M16 validation capture or P&L open. IID N=155 was not power-aligned with UTC-day clustered inference; 8h/day was operational not inferential." as const;

export const M16_1B_WINDOW_AMENDMENT_REASON =
  "Prospective sampling-window amendment before first M16 validation capture. Replace unused 14:00–18:00Z operational window with 18:00–22:00Z to align with California daytime historical discretionary context. Strategy, N/G, CR2, fees, and 140h budget unchanged. Not selected from P&L or hourly incidence mining." as const;
