import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAssistant } from './useAssistant';
import type { PageContext } from './types';

interface PageContextTrackerProps {
  /**
   * Map from current route → extra context fields. The tracker will
   * shallow-merge this map's entry on each route change. Optional —
   * fall back to route-only if you don't need domain context.
   */
  contextByPath?: Record<string, PageContext>;
}

/**
 * Subscribes to react-router location changes and writes the resolved
 * PageContext into the assistant context. Mount once inside the
 * AssistantProvider tree.
 */
export function PageContextTracker({ contextByPath = {} }: PageContextTrackerProps) {
  const location = useLocation();
  const { setPageContext } = useAssistant();

  useEffect(() => {
    const path = location.pathname;
    const extra = contextByPath[path] ?? {};
    setPageContext({ route: path, ...extra });
  }, [location.pathname, contextByPath, setPageContext]);

  return null;
}
