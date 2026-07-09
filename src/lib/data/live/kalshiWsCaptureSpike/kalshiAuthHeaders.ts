/**
 * Kalshi authenticated request signing.
 *
 * Official signing string (per Kalshi docs):
 *   `${timestampMs}${method}${pathWithoutQuery}`
 *
 * WebSocket handshake uses method `GET` and path `/trade-api/ws/v2`.
 * Signature: RSA-PSS with SHA-256, MGF1-SHA256, salt length = digest length, base64-encoded.
 */
import { constants, createHash, createPrivateKey, sign } from "node:crypto";

export const KALSHI_WS_SIGN_METHOD = "GET";
export const KALSHI_WS_SIGN_PATH = "/trade-api/ws/v2";

export const KALSHI_ACCESS_KEY_HEADER = "KALSHI-ACCESS-KEY";
export const KALSHI_ACCESS_SIGNATURE_HEADER = "KALSHI-ACCESS-SIGNATURE";
export const KALSHI_ACCESS_TIMESTAMP_HEADER = "KALSHI-ACCESS-TIMESTAMP";

export type KalshiAuthHeaderNames = {
  accessKey: typeof KALSHI_ACCESS_KEY_HEADER;
  accessSignature: typeof KALSHI_ACCESS_SIGNATURE_HEADER;
  accessTimestamp: typeof KALSHI_ACCESS_TIMESTAMP_HEADER;
};

export type KalshiAuthHeaders = Record<
  | typeof KALSHI_ACCESS_KEY_HEADER
  | typeof KALSHI_ACCESS_SIGNATURE_HEADER
  | typeof KALSHI_ACCESS_TIMESTAMP_HEADER,
  string
>;

export type KalshiAuthSigner = (
  message: string,
  privateKeyPem: string,
) => string;

/** Strips query string from a URL path before signing. */
export function normalizeKalshiSignPath(path: string): string {
  return path.split("?")[0] ?? path;
}

/** Builds the Kalshi signing payload string. */
export function buildKalshiSignMessage(input: {
  timestampMs: string;
  method: string;
  path: string;
}): string {
  return `${input.timestampMs}${input.method}${normalizeKalshiSignPath(input.path)}`;
}

/** Default RSA-PSS SHA-256 signer for Kalshi API requests. */
export function signKalshiMessageRsaPss(message: string, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(
    "sha256",
    Buffer.from(message, "utf8"),
    {
      key,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    },
  );

  return signature.toString("base64");
}

/** Creates Kalshi auth headers for a REST or WebSocket handshake request. */
export function createKalshiAuthHeaders(input: {
  apiKeyId: string;
  privateKeyPem: string;
  method: string;
  path: string;
  timestampMs?: string;
  signMessage?: KalshiAuthSigner;
}): KalshiAuthHeaders {
  const timestampMs = input.timestampMs ?? String(Date.now());
  const message = buildKalshiSignMessage({
    timestampMs,
    method: input.method,
    path: input.path,
  });
  const signMessage = input.signMessage ?? signKalshiMessageRsaPss;
  const signature = signMessage(message, input.privateKeyPem);

  return {
    [KALSHI_ACCESS_KEY_HEADER]: input.apiKeyId,
    [KALSHI_ACCESS_SIGNATURE_HEADER]: signature,
    [KALSHI_ACCESS_TIMESTAMP_HEADER]: timestampMs,
  };
}

/** Creates WebSocket handshake auth headers for Kalshi trade API v2. */
export function createKalshiWebSocketAuthHeaders(input: {
  apiKeyId: string;
  privateKeyPem: string;
  timestampMs?: string;
  signMessage?: KalshiAuthSigner;
}): KalshiAuthHeaders {
  return createKalshiAuthHeaders({
    apiKeyId: input.apiKeyId,
    privateKeyPem: input.privateKeyPem,
    method: KALSHI_WS_SIGN_METHOD,
    path: KALSHI_WS_SIGN_PATH,
    timestampMs: input.timestampMs,
    signMessage: input.signMessage,
  });
}

/** Short non-sensitive fingerprint for diagnostics (SHA-256 prefix). */
export function fingerprintPrivateKeyPem(privateKeyPem: string): string {
  return createHash("sha256").update(privateKeyPem).digest("hex").slice(0, 12);
}
