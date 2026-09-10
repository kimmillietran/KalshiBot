import type { LegacyGrandfatheredFrozenHypothesis } from "./candidatePreregistrationEligibilityTypes";

/**
 * Narrow, explicit allowlist of historical freezes that predate M12.7a
 * promotion-binding requirements. New hypothesis paths/SHAs cannot use this.
 *
 * Paths/SHAs are string literals (not imported from freeze modules) to avoid
 * circular imports with loaders that call enforceFrozenHypothesisPromotionGovernance.
 */
export const LEGACY_GRANDFATHERED_FROZEN_HYPOTHESES: readonly LegacyGrandfatheredFrozenHypothesis[] = [
  {
    kind: "legacy-frozen-lineage",
    configPath:
      "config/research/hypotheses/high-volatility-late-market-calibration-fade-v1.json",
    provenancePath:
      "config/research/hypotheses/provenance/high-volatility-late-market-calibration-fade-v1.json",
    freezeCommitSha: "f2598cf960472f368cd6ad25f67d4c97a3b3956e",
    hypothesisVersion: "v1",
    hypothesisId:
      "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
  },
  {
    kind: "legacy-frozen-lineage",
    configPath:
      "config/research/hypotheses/high-volatility-late-market-calibration-fade-v2.json",
    provenancePath:
      "config/research/hypotheses/provenance/high-volatility-late-market-calibration-fade-v2.json",
    freezeCommitSha: "1c5ef9da3ef5e48af26c05b850183b0e8d4290d0",
    hypothesisVersion: "v2",
    hypothesisId:
      "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
  },
] as const;

export function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function findLegacyGrandfatheredFrozenHypothesis(input: {
  configPath: string;
  freezeCommitSha?: string | null;
  hypothesisVersion: string;
  hypothesisId?: string;
}): LegacyGrandfatheredFrozenHypothesis | null {
  const configPath = normalizeRepoPath(input.configPath);
  const freezeCommitSha = input.freezeCommitSha?.trim().toLowerCase() || null;
  const hypothesisVersion = input.hypothesisVersion.trim();

  for (const entry of LEGACY_GRANDFATHERED_FROZEN_HYPOTHESES) {
    if (normalizeRepoPath(entry.configPath) !== configPath) {
      continue;
    }
    if (entry.hypothesisVersion !== hypothesisVersion) {
      continue;
    }
    if (input.hypothesisId && entry.hypothesisId !== input.hypothesisId) {
      continue;
    }
    if (freezeCommitSha && entry.freezeCommitSha.toLowerCase() !== freezeCommitSha) {
      continue;
    }
    return entry;
  }
  return null;
}

/**
 * True only for the exact historical freezes. A new config cannot inherit
 * grandfathering by copying lineage fields alone.
 */
export function isLegacyGrandfatheredFrozenHypothesis(input: {
  configPath: string;
  freezeCommitSha?: string | null;
  hypothesisVersion: string;
  hypothesisId?: string;
}): boolean {
  return findLegacyGrandfatheredFrozenHypothesis(input) !== null;
}
