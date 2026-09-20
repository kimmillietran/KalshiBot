import { M16_FORBIDDEN_INCIDENCE_FIELD_PATTERNS, M16ReversalError } from "./m16Types";

/**
 * Fail closed if incidence / census artifacts contain economic outcome fields.
 * Quarantine attestation keys (…Opened / …Inspected = false) are allowed.
 */
export function assertM16BlindIncidenceHasNoOutcomeFields(
  value: unknown,
  path = "root",
): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertM16BlindIncidenceHasNoOutcomeFields(item, `${path}[${i}]`));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const isQuarantineAttestation =
      path.endsWith(".quarantine") || path === "root.quarantine";
    if (!isQuarantineAttestation) {
      for (const pattern of M16_FORBIDDEN_INCIDENCE_FIELD_PATTERNS) {
        if (pattern.test(key)) {
          throw new M16ReversalError(
            `M16 incidence blindness violation at ${path}.${key}`,
          );
        }
      }
    }
    assertM16BlindIncidenceHasNoOutcomeFields(child, `${path}.${key}`);
  }
}
