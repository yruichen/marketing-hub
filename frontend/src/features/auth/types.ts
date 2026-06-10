import type { UseFormReturn } from 'react-hook-form';

export type ToastKind = 'success' | 'info' | 'error';

export interface LoginFormValues {
  username: string;
  password: string;
}

export interface LoginPortalProps {
  loading: boolean;
  authError: string;
  loginForm: UseFormReturn<LoginFormValues>;
  handleLogin: (values: LoginFormValues) => Promise<void> | void;
  triggerToast: (text: string, type: ToastKind) => void;
}
