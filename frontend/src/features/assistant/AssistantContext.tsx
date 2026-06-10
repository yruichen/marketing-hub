import { useMemo, useState, type ReactNode } from 'react';
import {
  AssistantContext,
  type AssistantContextValue,
} from './assistantContextObject';
import type { PageContext } from './types';

interface AssistantProviderProps {
  children: ReactNode;
  initialPageContext?: PageContext;
}

export function AssistantProvider({ children, initialPageContext }: AssistantProviderProps) {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [pageContext, setPageContext] = useState<PageContext>(initialPageContext ?? {});

  const value = useMemo<AssistantContextValue>(
    () => ({ open, setOpen, sessionId, setSessionId, pageContext, setPageContext }),
    [open, sessionId, pageContext],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}
