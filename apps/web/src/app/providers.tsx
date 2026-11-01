/** TanStack Query owns all server data (section 12). */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { CLIENT_POLL_MS } from '@railpulse/shared';

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: CLIENT_POLL_MS / 2,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export function Providers({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
