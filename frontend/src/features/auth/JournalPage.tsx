import { useState } from 'react';
import { ArrowRight, Mail, ShieldCheck, Sparkles, X } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import type { LoginFormValues, ToastKind } from './types';
import type { UseFormReturn } from 'react-hook-form';

const DEMO_USERNAME = import.meta.env.VITE_DEMO_USERNAME || 'DEMO';
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || '123';

const LEGAL_MODAL_COPY = {
  terms: {
    title: '服务条款（Beta）',
    paragraphs: [
      '这是 Marketing Hub beta 阶段的服务条款占位文本，用于测试版本追踪和用户同意流程。',
      '正式上线前，服务范围、账户责任、可接受使用、AI 输出责任、暂停/终止、免责声明和争议处理条款必须由法务复核后替换。',
      '当前产品中的 AI 生成内容均为初稿，发布前需要用户自行进行真实性、合法性、广告合规和知识产权审核。',
    ],
  },
  privacy: {
    title: '隐私政策（Beta）',
    paragraphs: [
      '这是 Marketing Hub beta 阶段的隐私政策占位文本，用于测试个人信息告知、版本追踪和同意记录。',
      '正式上线前，需要补齐运营主体、联系方式、数据类型、处理目的、保存期限、第三方共享、跨境数据和用户权利流程。',
      '平台会处理账号信息、组织成员信息、项目/品牌上下文、生成输入输出、素材、AI provider 调用记录、审计日志和额度记录。',
    ],
  },
} as const;

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
    acceptedTerms: false,
    acceptedPrivacy: false,
  });
  const [legalModal, setLegalModal] = useState<keyof typeof LEGAL_MODAL_COPY | null>(null);
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
          accepted_terms: registerForm.acceptedTerms,
          accepted_privacy: registerForm.acceptedPrivacy,
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
          <label className="flex items-start gap-2 text-[10px] font-bold leading-5 text-[var(--editorial-text-muted)]">
            <input
              type="checkbox"
              checked={registerForm.acceptedTerms}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, acceptedTerms: event.target.checked }))}
              className="mt-1"
            />
            <span>
              我已阅读并同意{' '}
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setLegalModal('terms');
                }}
                className="underline"
              >
                服务条款
              </button>
            </span>
          </label>
          <label className="flex items-start gap-2 text-[10px] font-bold leading-5 text-[var(--editorial-text-muted)]">
            <input
              type="checkbox"
              checked={registerForm.acceptedPrivacy}
              onChange={(event) => setRegisterForm((prev) => ({ ...prev, acceptedPrivacy: event.target.checked }))}
              className="mt-1"
            />
            <span>
              我已阅读并同意{' '}
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setLegalModal('privacy');
                }}
                className="underline"
              >
                隐私政策
              </button>
            </span>
          </label>
          <button
            type="button"
            className="auth-page__submit"
            onClick={submitRegister}
            disabled={busy || !registerForm.acceptedTerms || !registerForm.acceptedPrivacy}
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

      {legalModal ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={LEGAL_MODAL_COPY[legalModal].title}
          onClick={() => setLegalModal(null)}
        >
          <section
            className="max-h-[82vh] w-full max-w-lg overflow-y-auto border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-5 text-[var(--editorial-text)] shadow-[8px_8px_0_var(--editorial-stroke)]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="mb-4 flex items-start justify-between gap-4 border-b border-[var(--editorial-stroke)] pb-3">
              <div>
                <span className="font-mono text-[9px] font-black uppercase text-[var(--editorial-text-gray)]">Marketing Hub Legal</span>
                <h3 className="serif-header mt-1 text-2xl font-black">{LEGAL_MODAL_COPY[legalModal].title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="border border-[var(--editorial-stroke)] p-1 hover:bg-[var(--editorial-stroke)] hover:text-[var(--editorial-bg)]"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="grid gap-3 text-xs font-semibold leading-6 text-[var(--editorial-text-muted)]">
              {LEGAL_MODAL_COPY[legalModal].paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <p className="mt-4 border-t border-dashed border-[var(--editorial-stroke)] pt-3 text-[10px] font-bold text-[var(--danger-accent)]">
              Beta 占位文本，不构成正式法律意见；公开上线前必须由律师复核替换。
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
