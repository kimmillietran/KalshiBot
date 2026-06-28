/** Semantic version for historical data contracts. Bump when schema shapes change. */
export const DATA_CONTRACT_VERSION = "6.1.0" as const;

export type DatasetVersion = typeof DATA_CONTRACT_VERSION;
