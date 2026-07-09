import { describe, expect, it } from "vitest";

import { resolveKalshiPrivateKeyMaterial } from "./resolveKalshiPrivateKeyMaterial";

const PEM = `-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----`;

describe("resolveKalshiPrivateKeyMaterial", () => {
  it("loads private key from path", () => {
    const material = resolveKalshiPrivateKeyMaterial({
      env: { KALSHI_API_PRIVATE_KEY_PATH: "C:\\Users\\me\\.kalshi\\key.pem" },
      readFile: () => PEM,
    });

    expect(material.status).toBe("loaded");
    expect(material.source).toBe("path");
    expect(material.privateKeyLoaded).toBe(true);
  });

  it("loads raw PEM with escaped newlines", () => {
    const material = resolveKalshiPrivateKeyMaterial({
      env: {
        KALSHI_API_PRIVATE_KEY:
          "-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----",
      },
    });

    expect(material.status).toBe("loaded");
    expect(material.source).toBe("raw-env");
    expect(material.privateKeyPem).toContain("\nabc\n");
  });

  it("falls back to KALSHI_PRIVATE_KEY", () => {
    const material = resolveKalshiPrivateKeyMaterial({
      env: { KALSHI_PRIVATE_KEY: PEM },
    });

    expect(material.source).toBe("fallback-raw-env");
    expect(material.privateKeyLoaded).toBe(true);
  });

  it("prefers path over raw env and warns", () => {
    const material = resolveKalshiPrivateKeyMaterial({
      env: {
        KALSHI_API_PRIVATE_KEY_PATH: "/tmp/key.pem",
        KALSHI_API_PRIVATE_KEY: PEM,
      },
      readFile: () => PEM,
    });

    expect(material.source).toBe("path");
    expect(material.warnings[0]).toContain("KALSHI_API_PRIVATE_KEY_PATH");
  });

  it("prefers CLI path override over env path", () => {
    const material = resolveKalshiPrivateKeyMaterial({
      env: { KALSHI_API_PRIVATE_KEY_PATH: "/env/key.pem" },
      privateKeyPathOverride: "C:\\cli\\key.pem",
      readFile: (path) => (path.includes("cli") ? PEM : "bad"),
    });

    expect(material.source).toBe("cli-path");
    expect(material.privateKeyLoaded).toBe(true);
  });

  it("reports invalid PEM format", () => {
    const material = resolveKalshiPrivateKeyMaterial({
      env: { KALSHI_API_PRIVATE_KEY: "not-a-pem" },
    });

    expect(material.status).toBe("invalid-private-key-format");
  });

  it("reports read errors for missing files", () => {
    const material = resolveKalshiPrivateKeyMaterial({
      env: { KALSHI_API_PRIVATE_KEY_PATH: "/missing.pem" },
      readFile: () => {
        throw new Error("ENOENT");
      },
    });

    expect(material.status).toBe("read-error");
  });
});
