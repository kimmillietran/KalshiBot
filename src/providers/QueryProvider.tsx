"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { createQueryClient } from "@/lib/query";

type QueryProviderProps = {
  children: React.ReactNode;
  client?: QueryClient;
};

/** App-wide TanStack Query client — wraps dashboard server-state consumers. */
export function QueryProvider({ children, client }: QueryProviderProps) {
  const [defaultClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={client ?? defaultClient}>{children}</QueryClientProvider>
  );
}
