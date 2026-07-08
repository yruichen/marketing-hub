import type { ErrorAction } from '../api/errorActions';

export type ToastType = 'success' | 'info' | 'error';

export interface ToastMessage {
  text: string;
  type: ToastType;
  /** Actionable CTAs — e.g. jump to billing or accept policies. */
  actions?: ErrorAction[];
}

export type TriggerToastFn = (input: string | ToastMessage, type?: ToastType) => void;
