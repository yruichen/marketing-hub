import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAssistant } from './useAssistant';
import type { PageContext } from './types';

interface PageContextTrackerProps {
  /**
   * Extra context fields merged into the resolved PageContext on every
   * route change. The tracker will shallow-merge this object's fields
   * on top of the current `route` path.
   *
   * Omit to fall back to route-only context (still useful as a mount point).
   */
  extras?: PageContext;
}

/**
 * Subscribes to react-router location changes and writes the resolved
 * PageContext into the assistant context. Mount once inside the
 * AssistantProvider tree.
 */
export function PageContextTracker({ extras }: PageContextTrackerProps) {
  const location = useLocation();
  const { setPageContext } = useAssistant();

  useEffect(() => {
    const path = location.pathname;
    setPageContext({ ...(extras ?? {}), route: path });
  }, [location.pathname, extras, setPageContext]);

  return null;
}
