import { existsSync } from "node:fs";

import { OperatorCliError } from "./argv";

/**
 * Require Kalshi credential env vars without reading secret file contents.
 * Never prints key ID values or private-key material.
 */
export function requireKalshiEnv(
  env: NodeJS.ProcessEnv = process.env,
): { keyIdPresent: true; privateKeyPath: string } {
  const keyId = env.KALSHI_API_KEY_ID?.trim() ?? "";
  const privateKeyPath = env.KALSHI_API_PRIVATE_KEY_PATH?.trim() ?? "";

  if (!keyId || !privateKeyPath) {
    throw new OperatorCliError(
      "Missing Kalshi credentials. Set KALSHI_API_KEY_ID and "
        + "KALSHI_API_PRIVATE_KEY_PATH (source load-kalshi-env), then retry.",
    );
  }

  if (!existsSync(privateKeyPath)) {
    throw new OperatorCliError(
      "KALSHI_API_PRIVATE_KEY_PATH does not exist on disk. "
        + "Check the path configured by load-kalshi-env (path only; never paste key contents).",
    );
  }

  return { keyIdPresent: true, privateKeyPath };
}

export function describeKalshiEnvPresence(
  env: NodeJS.ProcessEnv = process.env,
): { keyIdSet: boolean; privateKeyPathSet: boolean } {
  return {
    keyIdSet: Boolean(env.KALSHI_API_KEY_ID?.trim()),
    privateKeyPathSet: Boolean(env.KALSHI_API_PRIVATE_KEY_PATH?.trim()),
  };
}
