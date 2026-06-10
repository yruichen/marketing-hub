import { useContext } from 'react';
import {
  AssistantContext,
  type AssistantContextValue,
} from './assistantContextObject';

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (ctx === null) {
    throw new Error('useAssistant must be used inside <AssistantProvider>');
  }
  return ctx;
}
