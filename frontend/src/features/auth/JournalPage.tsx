import { useState } from 'react';
import { ArrowRight, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import type { LoginFormValues, ToastKind } from './types';
import type { UseFormReturn } from 'react-hook-form';

const DEMO_USERNAME = import.meta.env.VITE_DEMO_USERNAME || 'DEMO';
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || '123';

interface JournalPageProps {
  loading: boolean;
  authError: string;
  loginForm: UseFormReturn<LoginFormValues>;
  onSubmit: (values: LoginFormValues) => Promise<void> | void;
  triggerToast: (text: string, type: ToastKind) => void;
  enableDemoLogin: boolean;
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
  enableDemoLogin,
}: JournalPageProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [registerForm, setRegisterForm] = useState({
    email: '',
    username: '',
    organizationName: '',
    password: '',
  });
  const [accountEmail, setAccountEmail] = useState('');
  const [localError, setLocalError] = useState('');
  const [localMessage, setLocalMessage] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const { register, handleSubmit, formState, reset } = loginForm;
  const usernameErr = formState.errors.username?.message;
  const passwordErr = formState.errors.password?.message;
  const busy = loading || localLoading;

  const submitRegister = async () => {
    setLocalError('');
    setLocalMessage('');
    setLocalLoading(true);
    try {
      const response = await apiFetch('/auth/register/', {
        method: 'POST',
        body: JSON.stringify({
          email: registerForm.email,
          username: registerForm.username,
          organization_name: registerForm.organizationName,
          password: registerForm.password,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLocalError(data.error || '注册失败。');
        return;
      }
      setAccountEmail(registerForm.email);
      setLocalMessage(data.message || '验证邮件已发送。');
      triggerToast('验证邮件已发送', 'success');
    } catch {
      setLocalError('无法连接服务器。');
    } finally {
      setLocalLoading(false);
    }
  };

  const resendVerification = async () => {
    const email = accountEmail || registerForm.email;
    if (!email) {
      setLocalError('请输入注册邮箱。');
      return;
    }
    setLocalError('');
    setLocalLoading(true);
    try {
      const response = await apiFetch('/auth/email/resend/', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLocalError(data.error || '重发失败。');
        return;
      }
      setLocalMessage(data.message || '验证邮件已发送。');
    } catch {
      setLocalError('无法连接服务器。');
    } finally {
      setLocalLoading(false);
    }
  };

  const requestPasswordReset = async () => {
    if (!accountEmail) {
      setLocalError('请输入账号邮箱。');
      return;
    }
    setLocalError('');
    setLocalMessage('');
    setLocalLoading(true);
    try {
      const response = await apiFetch('/auth/password-reset/request/', {
        method: 'POST',
        body: JSON.stringify({ email: accountEmail }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLocalError(data.error || '重置请求失败。');
        return;
      }
      setLocalMessage(data.message || '重置邮件已发送。');
    } catch {
      setLocalError('无法连接服务器。');
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page__header">
        <div className="auth-page__mark">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="auth-page__eyebrow">创意工作台</p>
          <h2 className="auth-page__title">{mode === 'login' ? '登录工作台' : mode === 'register' ? '申请测试席位' : '重置密码'}</h2>
        </div>
      </div>

      <div className="auth-page__mode-row" aria-label="认证模式">
        <button
          type="button"
          className={`auth-page__mode ${mode === 'login' || mode === 'forgot' ? 'auth-page__mode--active' : ''}`}
          onClick={() => setMode('login')}
        >
          登录
        </button>
        <button
          type="button"
          className={`auth-page__mode ${mode === 'register' ? 'auth-page__mode--active' : ''}`}
          onClick={() => setMode('register')}
        >
          注册
        </button>
      </div>

      {mode === 'login' ? (
        <form onSubmit={handleSubmit(onSubmit)} className="auth-page__form">
          {authError && (
            <div className="auth-page__error">
              <span>{authError}</span>
            </div>
          )}

          <div className="auth-page__field">
            <label>账号 / 邮箱</label>
            <input
              type="text"
              {...register('username')}
              placeholder="DEMO 或 name@company.com"
              aria-invalid={Boolean(usernameErr)}
            />
            {usernameErr && (
              <span className="auth-page__field-error">{usernameErr}</span>
            )}
          </div>

          <div className="auth-page__field">
            <label>密码</label>
            <input
              type="password"
              {...register('password')}
              placeholder="输入密码"
              aria-invalid={Boolean(passwordErr)}
            />
            {passwordErr && (
              <span className="auth-page__field-error">{passwordErr}</span>
            )}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="auth-page__submit"
          >
            {busy ? (
              <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
            ) : null}
            {busy ? '正在打开工作台...' : '进入工作台'}
            {!busy ? <ArrowRight className="h-4 w-4" /> : null}
          </button>
          <button type="button" className="auth-page__link-btn" onClick={() => setMode('forgot')}>
            忘记密码？
          </button>
        </form>
      ) : mode === 'forgot' ? (
        <div className="auth-page__register-preview">
          {localError ? <div className="auth-page__error">{localError}</div> : null}
          {localMessage ? <div className="auth-page__success">{localMessage}</div> : null}
          <div className="auth-page__field">
            <label>邮箱</label>
            <input
              type="email"
              value={accountEmail}
              onChange={(event) => setAccountEmail(event.target.value)}
              placeholder="you@brand.com"
            />
          </div>
          <button type="button" className="auth-page__submit" onClick={requestPasswordReset} disabled={busy}>
            {busy ? '正在发送重置链接...' : '发送重置链接'}
          </button>
        </div>
      ) : (
        <div className="auth-page__register-preview">
          {localError ? <div className="auth-page__error">{localError}</div> : null}
          {localMessage ? <div className="auth-page__success">{localMessage}</div> : null}
          <div className="auth-page__notice-card">
            <Mail className="h-5 w-5" />
            <div>
              <strong>邮箱验证码注册</strong>
              <p>使用已验证邮箱创建你的测试工作区。</p>
            </div>
          </div>
          <div className="auth-page__field">
            <label>邮箱</label>
            <input
              type="email"
              value={registerForm.email}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="you@brand.com"
            />
          </div>
          <div className="auth-page__field">
            <label>用户名</label>
            <input
              type="text"
              value={registerForm.username}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, username: event.target.value }))}
              placeholder="brand-operator"
            />
          </div>
          <div className="auth-page__field">
            <label>工作区</label>
            <input
              type="text"
              value={registerForm.organizationName}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, organizationName: event.target.value }))}
              placeholder="品牌工作室"
            />
          </div>
          <div className="auth-page__field">
            <label>密码</label>
            <input
              type="password"
              value={registerForm.password}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="至少 8 位字符"
            />
          </div>
          <button
            type="button"
            className="auth-page__submit"
            onClick={submitRegister}
            disabled={busy}
          >
            {busy ? '正在创建账号...' : '创建账号'}
          </button>
          <button type="button" className="auth-page__link-btn" onClick={resendVerification} disabled={busy}>
            重发验证邮件
          </button>
        </div>
      )}

      <div className="auth-page__footer">
        {enableDemoLogin ? (
          <div className="auth-page__demo">
            <span>测试账号：{DEMO_USERNAME} / {DEMO_PASSWORD}</span>
            <button
              type="button"
              onClick={() => {
                reset({ username: DEMO_USERNAME, password: DEMO_PASSWORD });
                triggerToast('预设凭据已载入', 'info');
              }}
            >
              自动填充
            </button>
          </div>
        ) : (
          <p><ShieldCheck className="h-3.5 w-3.5" /> 注册、邮箱验证和密码重置将在下一阶段开放。</p>
        )}
      </div>
    </div>
  );
}
