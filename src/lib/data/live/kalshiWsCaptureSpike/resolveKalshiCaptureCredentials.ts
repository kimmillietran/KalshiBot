import type { KalshiCredentialStatus } from "./kalshiWsCaptureSpikeTypes";
import {
  resolveKalshiPrivateKeyMaterial,
  type KalshiPrivateKeyMaterial,
  type KalshiPrivateKeySource,
} from "./resolveKalshiPrivateKeyMaterial";

export type KalshiCaptureCredentials = {
  status: KalshiCredentialStatus;
  apiKeyId: string | null;
  apiBaseUrl: string | null;
  wsUrl: string | null;
  privateKeyMaterial: KalshiPrivateKeyMaterial;
  privateKeySource: KalshiPrivateKeySource;
  privateKeyLoaded: boolean;
  privateKeyFingerprint: string | null;
  keyIdPresent: boolean;
  warnings: string[];
  error: string | null;
};

function readEnv(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function mapPrivateKeyStatusToCredentialStatus(
  material: KalshiPrivateKeyMaterial,
  apiKeyId: string | null,
): KalshiCredentialStatus {
  if (!apiKeyId && material.status === "missing") {
    return "missing";
  }

  if (!apiKeyId) {
    return "invalid";
  }

  if (material.status === "missing") {
    return "invalid";
  }

  switch (material.status) {
    case "loaded":
      return "available";
    case "invalid-private-key-path":
      return "invalid-private-key-path";
    case "invalid-private-key-format":
      return "invalid-private-key-format";
    case "read-error":
      return "read-error";
    default:
      return "unknown";
  }
}

/** Reads Kalshi credential env vars and resolves private key material without logging secrets. */
export function resolveKalshiCaptureCredentials(input?: {
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string) => string;
  privateKeyPathOverride?: string;
}): KalshiCaptureCredentials {
  const env = input?.env ?? process.env;
  const apiKeyId = readEnv(env, "KALSHI_API_KEY_ID");
  const apiBaseUrl = readEnv(env, "KALSHI_API_BASE_URL");
  const wsUrl = readEnv(env, "KALSHI_WS_URL");

  const privateKeyMaterial = resolveKalshiPrivateKeyMaterial({
    env,
    readFile: input?.readFile,
    privateKeyPathOverride: input?.privateKeyPathOverride,
  });

  const status = mapPrivateKeyStatusToCredentialStatus(privateKeyMaterial, apiKeyId);

  return {
    status,
    apiKeyId,
    apiBaseUrl,
    wsUrl,
    privateKeyMaterial,
    privateKeySource: privateKeyMaterial.source,
    privateKeyLoaded: privateKeyMaterial.privateKeyLoaded,
    privateKeyFingerprint: privateKeyMaterial.privateKeyFingerprint,
    keyIdPresent: apiKeyId !== null,
    warnings: privateKeyMaterial.warnings,
    error: privateKeyMaterial.error,
  };
}
