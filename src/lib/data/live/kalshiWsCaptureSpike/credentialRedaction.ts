const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/g,
  /KALSHI-ACCESS-SIGNATURE:\s*[^\s"']+/gi,
  /"KALSHI-ACCESS-SIGNATURE"\s*:\s*"[^"]+"/gi,
];

const ENV_SECRET_KEYS = [
  "KALSHI_API_PRIVATE_KEY",
  "KALSHI_PRIVATE_KEY",
  "KALSHI_API_PRIVATE_KEY_PATH",
];

/** Redacts private key material and auth signature values from serialized artifacts. */
export function redactCaptureArtifactText(text: string): string {
  let redacted = text;

  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }

  for (const key of ENV_SECRET_KEYS) {
    redacted = redacted.replaceAll(key, "[REDACTED-ENV-KEY]");
  }

  return redacted;
}

export function assertArtifactContainsNoSecrets(text: string): void {
  if (text.includes("BEGIN RSA PRIVATE KEY") || text.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Artifact contains private key PEM content");
  }

  if (/KALSHI-ACCESS-SIGNATURE["\s:=]+[A-Za-z0-9+/=]{8,}/.test(text)) {
    throw new Error("Artifact contains auth signature value");
  }
}
