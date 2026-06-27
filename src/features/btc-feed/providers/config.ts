export type BtcProviderMode = "coinbase" | "kraken" | "auto";

const VALID_MODES: ReadonlySet<string> = new Set(["coinbase", "kraken", "auto"]);

/** Resolves `BTC_PROVIDER` env — defaults to `auto` (provider chain). */
export function getBtcProviderMode(
  env: NodeJS.ProcessEnv = process.env,
): BtcProviderMode {
  const raw = env.BTC_PROVIDER?.trim().toLowerCase();
  if (!raw || !VALID_MODES.has(raw)) {
    return "auto";
  }
  return raw as BtcProviderMode;
}
