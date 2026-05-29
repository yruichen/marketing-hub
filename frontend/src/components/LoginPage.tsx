interface LoginPageProps {
  loading: boolean;
  authError: string;
  loginForm: { username: string; password: string };
  setLoginForm: (form: { username: string; password: string }) => void;
  handleLogin: (e: React.FormEvent) => void;
  triggerToast: (text: string, type: 'success' | 'info' | 'error') => void;
}

export default function LoginPage({
  loading,
  authError,
  loginForm,
  setLoginForm,
  handleLogin,
  triggerToast,
}: LoginPageProps) {
  return (
    <div className="min-h-screen bg-[var(--editorial-bg)] flex flex-col justify-center items-center p-4 relative overflow-hidden editorial-grid transition-colors duration-250">
      
      {/* Asymmetrical hand-cut sheet container */}
      <div className="w-full max-w-md bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] shadow-editorial p-8 paper-sheet-1 relative">
        
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--editorial-text)] serif-header mb-1">
            Marketing-Hub
          </h1>
          <p className="text-[var(--editorial-text-gray)] text-[10px] uppercase tracking-widest font-mono font-bold">
            // ANALOG EDITORIAL WORKSPACE
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {authError && (
            <div className="border border-[var(--editorial-stroke)] text-rose-600 bg-rose-50 dark:bg-rose-950/20 p-3 text-xs font-mono font-semibold">
              <span>{authError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider block font-mono">// USERNAME</label>
            <input
              type="text"
              required
              value={loginForm.username}
              onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
              className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] px-2 py-2 text-sm focus:outline-none focus:border-b-2 font-mono transition-all"
              placeholder="输入管理员账号"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider block font-mono">// PASSWORD</label>
            <input
              type="password"
              required
              value={loginForm.password}
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] px-2 py-2 text-sm focus:outline-none focus:border-b-2 font-mono transition-all"
              placeholder="输入密码"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
            ) : null}
            {loading ? '正在载入稿件...' : '翻开设计手账'}
          </button>
        </form>

        {/* Quick preset credentials helper */}
        <div className="mt-6 pt-5 border-t border-dashed border-[var(--editorial-stroke)] text-center font-mono">
          <span className="text-[10px] text-[var(--editorial-text-gray)] font-semibold block">演示凭证预置: ROOT / 123</span>
          <button 
            onClick={() => {
              setLoginForm({ username: 'ROOT', password: '123' });
              triggerToast('预设凭据已载入', 'info');
            }}
            className="mt-2 text-[10px] text-[var(--editorial-accent-blue)] font-bold hover:underline"
          >
            [ 自动填充演示凭据 ]
          </button>
        </div>
      </div>
    </div>
  );
}
