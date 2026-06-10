import { createContext } from 'react';
import type { PageContext } from './types';

export interface AssistantContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
  sessionId: number | null;
  setSessionId: (id: number | null) => void;
  pageContext: PageContext;
  setPageContext: (next: PageContext) => void;
}

export const AssistantContext = createContext<AssistantContextValue | null>(null);
