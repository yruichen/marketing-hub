import type { LoginFormValues, ToastKind } from './types';
import type { UseFormReturn } from 'react-hook-form';

interface JournalPageProps {
  loading: boolean;
  authError: string;
  loginForm: UseFormReturn<LoginFormValues>;
  onSubmit: (values: LoginFormValues) => Promise<void> | void;
  triggerToast: (text: string, type: ToastKind) => void;
}

/**
 * 手帐内页：放真实的登录表单。
 * 表单状态完全透传自 App.tsx（loginForm / authError / loading），
 * 本身不持有 useForm，不重复状态，避免双源数据同步。
 */
export function JournalPage({
  loading,
  authError,
  loginForm,
  onSubmit,
  triggerToast,
}: JournalPageProps) {
  const { register, handleSubmit, formState, reset } = loginForm;
  const usernameErr = formState.errors.username?.message;
  const passwordErr = formState.errors.password?.message;

  return (
    <div className="journal-face journal-face--page bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] shadow-editorial p-8 paper-sheet-2 relative">
      <div className="flex flex-col items-center mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--editorial-text)] serif-header mb-1">
          进入工作台
        </h2>
        <p className="text-[var(--editorial-text-gray)] text-[10px] uppercase tracking-widest font-mono font-bold">
          // sign in to continue
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {authError && (
          <div className="border border-[var(--editorial-stroke)] text-rose-600 bg-rose-50 dark:bg-rose-950/20 p-3 text-xs font-mono font-semibold">
            <span>{authError}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider block font-mono">
            // USERNAME
          </label>
          <input
            type="text"
            {...register('username')}
            className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] px-2 py-2 text-sm focus:outline-none focus:border-b-2 font-mono transition-all"
            placeholder="输入管理员账号"
            aria-invalid={Boolean(usernameErr)}
          />
          {usernameErr && (
            <span className="text-[10px] text-rose-600 font-bold">{usernameErr}</span>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider block font-mono">
            // PASSWORD
          </label>
          <input
            type="password"
            {...register('password')}
            className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] px-2 py-2 text-sm focus:outline-none focus:border-b-2 font-mono transition-all"
            placeholder="输入密码"
            aria-invalid={Boolean(passwordErr)}
          />
          {passwordErr && (
            <span className="text-[10px] text-rose-600 font-bold">{passwordErr}</span>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
          ) : null}
          {loading ? '正在登录工作台...' : '进入工作台'}
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-dashed border-[var(--editorial-stroke)] text-center font-mono">
        <span className="text-[10px] text-[var(--editorial-text-gray)] font-semibold block">
          演示账号: ROOT / 123
        </span>
        <button
          type="button"
          onClick={() => {
            reset({ username: 'ROOT', password: '123' });
            triggerToast('预设凭据已载入', 'info');
          }}
          className="mt-2 text-[10px] text-[var(--editorial-accent-blue)] font-bold hover:underline"
        >
          [ 自动填充演示凭据 ]
        </button>
      </div>
    </div>
  );
}
