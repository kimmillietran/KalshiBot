export type BtcProviderMode = "coinbase" | "kraken" | "auto";

const VALID_MODES: ReadonlySet<string> = new Set(["coinbase", "kraken", "auto"]);

/** Resolves `BTC_PROVIDER` env — defaults to `coinbase`. */
export function getBtcProviderMode(
  env: NodeJS.ProcessEnv = process.env,
): BtcProviderMode {
  const raw = env.BTC_PROVIDER?.trim().toLowerCase();
  if (!raw || !VALID_MODES.has(raw)) {
    return "coinbase";
  }
  return raw as BtcProviderMode;
}
