import { fingerprintPrivateKeyPem } from "./kalshiAuthHeaders";

export type KalshiPrivateKeySource =
  | "path"
  | "raw-env"
  | "fallback-raw-env"
  | "cli-path"
  | "missing"
  | "invalid";

export type KalshiPrivateKeyMaterialStatus =
  | "loaded"
  | "missing"
  | "invalid-private-key-path"
  | "invalid-private-key-format"
  | "read-error";

export type KalshiPrivateKeyMaterial = {
  status: KalshiPrivateKeyMaterialStatus;
  source: KalshiPrivateKeySource;
  privateKeyPem: string | null;
  privateKeyLoaded: boolean;
  privateKeyFingerprint: string | null;
  warnings: string[];
  error: string | null;
};

const PEM_BEGIN_MARKERS = [
  "-----BEGIN RSA PRIVATE KEY-----",
  "-----BEGIN PRIVATE KEY-----",
  "-----BEGIN EC PRIVATE KEY-----",
];

function readEnv(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function normalizeRawPem(value: string): string {
  return value.replaceAll("\\n", "\n").trim();
}

function looksLikePem(value: string): boolean {
  return PEM_BEGIN_MARKERS.some((marker) => value.includes(marker));
}

function loadFromPath(input: {
  path: string;
  readFile: (path: string) => string;
}): KalshiPrivateKeyMaterial {
  try {
    const contents = normalizeRawPem(input.readFile(input.path));
    if (!looksLikePem(contents)) {
      return {
        status: "invalid-private-key-format",
        source: "path",
        privateKeyPem: null,
        privateKeyLoaded: false,
        privateKeyFingerprint: null,
        warnings: [],
        error: "Private key file does not contain recognizable PEM markers.",
      };
    }

    return {
      status: "loaded",
      source: "path",
      privateKeyPem: contents,
      privateKeyLoaded: true,
      privateKeyFingerprint: fingerprintPrivateKeyPem(contents),
      warnings: [],
      error: null,
    };
  } catch (error) {
    return {
      status: "read-error",
      source: "path",
      privateKeyPem: null,
      privateKeyLoaded: false,
      privateKeyFingerprint: null,
      warnings: [],
      error: error instanceof Error ? error.message : "Failed to read private key file.",
    };
  }
}

function loadFromRawEnv(source: KalshiPrivateKeySource, value: string): KalshiPrivateKeyMaterial {
  const contents = normalizeRawPem(value);
  if (!looksLikePem(contents)) {
    return {
      status: "invalid-private-key-format",
      source,
      privateKeyPem: null,
      privateKeyLoaded: false,
      privateKeyFingerprint: null,
      warnings: [],
      error: "Private key env var does not contain recognizable PEM markers.",
    };
  }

  return {
    status: "loaded",
    source,
    privateKeyPem: contents,
    privateKeyLoaded: true,
    privateKeyFingerprint: fingerprintPrivateKeyPem(contents),
    warnings: [],
    error: null,
  };
}

/** Resolves Kalshi private key material from path or env vars. */
export function resolveKalshiPrivateKeyMaterial(input: {
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string) => string;
  privateKeyPathOverride?: string;
}): KalshiPrivateKeyMaterial {
  const env = input.env ?? process.env;
  const warnings: string[] = [];
  const pathFromCli = input.privateKeyPathOverride?.trim() || null;
  const pathFromEnv = readEnv(env, "KALSHI_API_PRIVATE_KEY_PATH");
  const rawPrimary = readEnv(env, "KALSHI_API_PRIVATE_KEY");
  const rawFallback = readEnv(env, "KALSHI_PRIVATE_KEY");

  if (pathFromCli && (pathFromEnv || rawPrimary || rawFallback)) {
    warnings.push(
      "CLI private-key path override is set; it takes precedence over env private-key values.",
    );
  } else if (pathFromEnv && (rawPrimary || rawFallback)) {
    warnings.push(
      "Both private-key path and raw private-key env vars are set; using KALSHI_API_PRIVATE_KEY_PATH.",
    );
  }

  const selectedPath = pathFromCli ?? pathFromEnv;
  if (selectedPath) {
    if (!input.readFile) {
      return {
        status: "read-error",
        source: pathFromCli ? "cli-path" : "path",
        privateKeyPem: null,
        privateKeyLoaded: false,
        privateKeyFingerprint: null,
        warnings,
        error: "Private key path requires a readFile implementation.",
      };
    }

    const loaded = loadFromPath({
      path: selectedPath,
      readFile: input.readFile,
    });
    return {
      ...loaded,
      source: pathFromCli ? "cli-path" : loaded.source,
      warnings: [...warnings, ...loaded.warnings],
    };
  }

  if (rawPrimary) {
    const loaded = loadFromRawEnv("raw-env", rawPrimary);
    return { ...loaded, warnings: [...warnings, ...loaded.warnings] };
  }

  if (rawFallback) {
    const loaded = loadFromRawEnv("fallback-raw-env", rawFallback);
    return { ...loaded, warnings: [...warnings, ...loaded.warnings] };
  }

  return {
    status: "missing",
    source: "missing",
    privateKeyPem: null,
    privateKeyLoaded: false,
    privateKeyFingerprint: null,
    warnings,
    error: null,
  };
}
