import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { createQueryClient } from "@/lib/query";

/** Query client tuned for Vitest — no retries, always fetch. */
export function createTestQueryClient() {
  return createQueryClient({
    retry: false,
  });
}

export function QueryTestProvider({
  children,
  client,
}: {
  children: ReactNode;
  client?: QueryClient;
}) {
  const [queryClient] = useState(() => client ?? createTestQueryClient());

  useEffect(() => {
    return () => {
      void queryClient.cancelQueries();
      queryClient.clear();
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
