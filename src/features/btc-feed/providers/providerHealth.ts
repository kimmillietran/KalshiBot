export type ProviderHealthStatus =
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "circuit_open";

export type ProviderHealthSnapshot = {
  providerId: string;
  status: ProviderHealthStatus;
  healthScore: number;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  circuitOpenUntil: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastErrorName: string | null;
};

export type ProviderHealthConfig = {
  failureThreshold: number;
  cooldownMs: number;
  exemptProviderIds: ReadonlySet<string>;
};

type ProviderHealthRecord = {
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  circuitOpenUntil: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastErrorName: string | null;
};

const DEFAULT_CONFIG: ProviderHealthConfig = {
  failureThreshold: 3,
  cooldownMs: 60_000,
  exemptProviderIds: new Set(["fallback"]),
};

const healthByProvider = new Map<string, ProviderHealthRecord>();

let activeConfig: ProviderHealthConfig = DEFAULT_CONFIG;

function createEmptyRecord(): ProviderHealthRecord {
  return {
    successCount: 0,
    failureCount: 0,
    consecutiveFailures: 0,
    circuitOpenUntil: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastErrorName: null,
  };
}

function getRecord(providerId: string): ProviderHealthRecord {
  let record = healthByProvider.get(providerId);
  if (!record) {
    record = createEmptyRecord();
    healthByProvider.set(providerId, record);
  }
  return record;
}

function getErrorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  return "UnknownError";
}

export function configureProviderHealth(config: Partial<ProviderHealthConfig>): void {
  activeConfig = {
    ...activeConfig,
    ...config,
    exemptProviderIds: config.exemptProviderIds ?? activeConfig.exemptProviderIds,
  };
}

export function resetProviderHealth(providerId?: string): void {
  if (providerId) {
    healthByProvider.delete(providerId);
    return;
  }
  healthByProvider.clear();
  activeConfig = DEFAULT_CONFIG;
}

export function isProviderExemptFromCircuit(providerId: string): boolean {
  return activeConfig.exemptProviderIds.has(providerId);
}

export function isProviderCircuitOpen(
  providerId: string,
  now: number = Date.now(),
): boolean {
  if (isProviderExemptFromCircuit(providerId)) {
    return false;
  }

  const record = getRecord(providerId);
  if (record.circuitOpenUntil === null) {
    return false;
  }

  return now < record.circuitOpenUntil;
}

export function computeHealthScore(
  record: ProviderHealthRecord,
  circuitOpen: boolean,
): number {
  if (circuitOpen) return 0;

  const total = record.successCount + record.failureCount;
  if (total === 0) return 100;

  const successRate = record.successCount / total;
  const penalty = record.consecutiveFailures * 15;
  return Math.max(0, Math.min(100, Math.round(successRate * 100 - penalty)));
}

export function computeHealthStatus(
  record: ProviderHealthRecord,
  circuitOpen: boolean,
): ProviderHealthStatus {
  if (circuitOpen) return "circuit_open";
  if (record.consecutiveFailures >= 2) return "unhealthy";
  if (record.consecutiveFailures >= 1 || record.failureCount > record.successCount) {
    return "degraded";
  }
  return "healthy";
}

export function toHealthSnapshot(
  providerId: string,
  now: number = Date.now(),
): ProviderHealthSnapshot {
  const record = getRecord(providerId);
  const circuitOpen = isProviderCircuitOpen(providerId, now);

  return {
    providerId,
    status: computeHealthStatus(record, circuitOpen),
    healthScore: computeHealthScore(record, circuitOpen),
    successCount: record.successCount,
    failureCount: record.failureCount,
    consecutiveFailures: record.consecutiveFailures,
    circuitOpenUntil: record.circuitOpenUntil,
    lastSuccessAt: record.lastSuccessAt,
    lastFailureAt: record.lastFailureAt,
    lastErrorName: record.lastErrorName,
  };
}

export function getProviderHealth(
  providerId: string,
  now: number = Date.now(),
): ProviderHealthSnapshot {
  return toHealthSnapshot(providerId, now);
}

export function getAllProviderHealth(now: number = Date.now()): ProviderHealthSnapshot[] {
  return [...healthByProvider.keys()].map((providerId) =>
    toHealthSnapshot(providerId, now),
  );
}

export type ProviderSuccessResult = {
  health: ProviderHealthSnapshot;
  circuitClosed: boolean;
};

export function recordProviderSuccess(
  providerId: string,
  now: number = Date.now(),
): ProviderSuccessResult {
  const record = getRecord(providerId);
  const hadOpenCircuit = record.circuitOpenUntil !== null;

  record.successCount += 1;
  record.consecutiveFailures = 0;
  record.lastSuccessAt = now;
  record.circuitOpenUntil = null;
  record.lastErrorName = null;

  return {
    health: toHealthSnapshot(providerId, now),
    circuitClosed: hadOpenCircuit,
  };
}

export type ProviderFailureResult = {
  health: ProviderHealthSnapshot;
  circuitOpened: boolean;
  errorName: string;
};

export function recordProviderFailure(
  providerId: string,
  error: unknown,
  now: number = Date.now(),
): ProviderFailureResult {
  const record = getRecord(providerId);
  const errorName = getErrorName(error);
  const wasCircuitOpen = isProviderCircuitOpen(providerId, now);

  record.failureCount += 1;
  record.consecutiveFailures += 1;
  record.lastFailureAt = now;
  record.lastErrorName = errorName;

  let circuitOpened = false;

  if (
    !isProviderExemptFromCircuit(providerId) &&
    record.consecutiveFailures >= activeConfig.failureThreshold
  ) {
    const openUntil = now + activeConfig.cooldownMs;
    if (!wasCircuitOpen) {
      circuitOpened = true;
    }
    record.circuitOpenUntil = openUntil;
  }

  return {
    health: toHealthSnapshot(providerId, now),
    circuitOpened,
    errorName,
  };
}
