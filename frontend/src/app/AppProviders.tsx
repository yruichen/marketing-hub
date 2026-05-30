import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactFlowProvider } from '@xyflow/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ReactFlowProvider>
          <Tooltip.Provider delayDuration={250}>{children}</Tooltip.Provider>
        </ReactFlowProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
