import type { EngineConfig } from "@/types/domain/trading";

const CONFIG_HASH_PREFIX = "cfg-v1";

/**
 * Stable, order-independent serialization for config hashing.
 * Keys are sorted recursively so equivalent configs always produce the same string.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`,
  );
  return `{${entries.join(",")}}`;
}

/** FNV-1a 32-bit — deterministic across runtimes without Node crypto. */
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function hashConfig(config: EngineConfig): string {
  const payload = stableStringify(config);
  return `${CONFIG_HASH_PREFIX}-${fnv1a32(payload)}`;
}
