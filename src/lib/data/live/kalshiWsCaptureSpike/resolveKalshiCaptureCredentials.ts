import type { KalshiCredentialStatus } from "./kalshiWsCaptureSpikeTypes";

export type KalshiCaptureCredentials = {
  status: KalshiCredentialStatus;
  apiKeyId: string | null;
  apiPrivateKey: string | null;
  apiBaseUrl: string | null;
  wsUrl: string | null;
};

function readEnv(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

/** Reads Kalshi credential env vars without logging secrets. */
export function resolveKalshiCaptureCredentials(
  env: NodeJS.ProcessEnv = process.env,
): KalshiCaptureCredentials {
  const apiKeyId = readEnv(env, "KALSHI_API_KEY_ID");
  const apiPrivateKey =
    readEnv(env, "KALSHI_API_PRIVATE_KEY") ?? readEnv(env, "KALSHI_PRIVATE_KEY");
  const apiBaseUrl = readEnv(env, "KALSHI_API_BASE_URL");
  const wsUrl = readEnv(env, "KALSHI_WS_URL");

  if (!apiKeyId && !apiPrivateKey) {
    return {
      status: "missing",
      apiKeyId: null,
      apiPrivateKey: null,
      apiBaseUrl,
      wsUrl,
    };
  }

  if (!apiKeyId || !apiPrivateKey) {
    return {
      status: "invalid",
      apiKeyId,
      apiPrivateKey,
      apiBaseUrl,
      wsUrl,
    };
  }

  return {
    status: "available",
    apiKeyId,
    apiPrivateKey,
    apiBaseUrl,
    wsUrl,
  };
}
