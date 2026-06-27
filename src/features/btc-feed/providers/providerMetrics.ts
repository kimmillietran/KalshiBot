import type { ProviderHealthSnapshot } from "./providerHealth";

export type ProviderMetricEvent =
  | {
      type: "provider_success";
      providerId: string;
      health: ProviderHealthSnapshot;
    }
  | {
      type: "provider_failure";
      providerId: string;
      errorName: string;
      message: string;
      health: ProviderHealthSnapshot;
    }
  | {
      type: "circuit_opened";
      providerId: string;
      openUntil: number;
      health: ProviderHealthSnapshot;
    }
  | {
      type: "circuit_closed";
      providerId: string;
      health: ProviderHealthSnapshot;
    }
  | {
      type: "circuit_skipped";
      providerId: string;
      openUntil: number;
      health: ProviderHealthSnapshot;
    };

export type ProviderMetricsObserver = (event: ProviderMetricEvent) => void;

const observers = new Set<ProviderMetricsObserver>();

export function subscribeProviderMetrics(
  observer: ProviderMetricsObserver,
): () => void {
  observers.add(observer);
  return () => observers.delete(observer);
}

export function resetProviderMetricsObservers(): void {
  observers.clear();
}

export function emitProviderMetric(event: ProviderMetricEvent): void {
  for (const observer of observers) {
    observer(event);
  }
}

function formatMetricPayload(event: ProviderMetricEvent): Record<string, unknown> {
  const base = {
    scope: "btc-feed",
    metric: event.type,
    providerId: event.providerId,
    healthScore: event.health.healthScore,
    status: event.health.status,
  };

  switch (event.type) {
    case "provider_failure":
      return {
        ...base,
        errorName: event.errorName,
        message: event.message,
        consecutiveFailures: event.health.consecutiveFailures,
      };
    case "circuit_opened":
    case "circuit_skipped":
      return {
        ...base,
        openUntil: new Date(event.openUntil).toISOString(),
      };
  }

  return base;
}

/** Default structured log sink — JSON line for aggregation beyond console.warn. */
export function logProviderMetric(event: ProviderMetricEvent): void {
  const payload = formatMetricPayload(event);
  const line = JSON.stringify(payload);

  if (event.type === "provider_failure" || event.type === "circuit_opened") {
    console.warn(`[btc-feed:metric] ${line}`);
    return;
  }

  console.info(`[btc-feed:metric] ${line}`);
}

export function createDefaultProviderMetricsPipeline(): ProviderMetricsObserver {
  return (event) => {
    logProviderMetric(event);
    emitProviderMetric(event);
  };
}
