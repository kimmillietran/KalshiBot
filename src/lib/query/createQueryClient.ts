import { QueryClient } from "@tanstack/react-query";

const MAX_QUERY_RETRIES = 2;

function getHttpStatusFromError(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/\b([1-5]\d{2})\b/);
  if (!match) return null;
  return Number.parseInt(match[1] ?? "", 10);
}

/** Skip retries for client-side HTTP failures (4xx). */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES) return false;

  const status = getHttpStatusFromError(error);
  if (status != null && status >= 400 && status < 500) return false;

  return true;
}

export type CreateQueryClientOptions = {
  /** Disable retries — use in tests. */
  retry?: boolean;
};

/** Shared QueryClient factory with dashboard-friendly defaults. */
export function createQueryClient(options: CreateQueryClientOptions = {}) {
  const retry =
    options.retry === false ? false : shouldRetryQuery;

  return new QueryClient({
    defaultOptions: {
      queries: {
        /** Data considered fresh for 5s unless a query overrides. */
        staleTime: 5_000,
        gcTime: 5 * 60_000,
        retry,
        /** Polling feeds manage their own refetch intervals. */
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: true,
      },
    },
  });
}
