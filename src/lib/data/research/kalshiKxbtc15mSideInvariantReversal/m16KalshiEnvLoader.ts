/**
 * M16.2c portable Kalshi env-loader path selection (operational).
 * Mirrors scripts/shell/run-m16-validation-daily.sh — keep priorities in sync.
 * Never reads or returns secret contents.
 */
export const M16_LEGACY_DESKTOP_KALSHI_ENV_LOADER =
  "/Users/builder/Desktop/KalshiBot/load-kalshi-env.sh" as const;

export type M16KalshiEnvLoaderSelection = {
  selectedPath: string | null;
  source:
    | "KALSHI_ENV_LOADER"
    | "repo-local"
    | "legacy-desktop"
    | "none";
};

/**
 * Resolve which load-kalshi-env.sh the unattended wrapper should source.
 * Priority:
 * 1. explicit KALSHI_ENV_LOADER (if file exists)
 * 2. ${repoRoot}/load-kalshi-env.sh
 * 3. legacy Desktop path (interactive fallback only)
 */
export function resolveM16KalshiEnvLoaderPath(input: {
  repoRoot: string;
  env?: Record<string, string | undefined>;
  fileExists?: (path: string) => boolean;
}): M16KalshiEnvLoaderSelection {
  const env = input.env ?? {};
  const exists = input.fileExists ?? (() => false);
  const override = (env.KALSHI_ENV_LOADER ?? "").trim();
  if (override.length > 0 && exists(override)) {
    return { selectedPath: override, source: "KALSHI_ENV_LOADER" };
  }
  const repoLocal = `${input.repoRoot.replace(/\/$/, "")}/load-kalshi-env.sh`;
  if (exists(repoLocal)) {
    return { selectedPath: repoLocal, source: "repo-local" };
  }
  if (exists(M16_LEGACY_DESKTOP_KALSHI_ENV_LOADER)) {
    return {
      selectedPath: M16_LEGACY_DESKTOP_KALSHI_ENV_LOADER,
      source: "legacy-desktop",
    };
  }
  return { selectedPath: null, source: "none" };
}

/** True when relocated unattended runtime would not need Desktop. */
export function m16EnvLoaderAvoidsDesktop(selection: M16KalshiEnvLoaderSelection): boolean {
  return (
    selection.source === "KALSHI_ENV_LOADER"
    || selection.source === "repo-local"
  );
}
