import type { LoginPortalProps } from './types';
import { useLoginAutoplay } from './useLoginAutoplay';
import { JournalBook } from './JournalBook';
import { JournalCover } from './JournalCover';
import { JournalPage } from './JournalPage';
import './journal.css';

/**
 * 顶层容器：把 App.tsx 的状态（form / loading / error / toast）编排成「手帐翻开」流程。
 *   1. 挂载 → 封面静置 600ms
 *   2. useLoginAutoplay 把 open 置 true → JournalBook 把封面沿左侧书脊翻起
 *   3. 翻完后内页可交互
 *
 * 不持有 useForm：表单状态全部透传，避免双源同步。
 */
export function LoginPortal(props: LoginPortalProps) {
  const open = useLoginAutoplay(600);
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-[var(--editorial-bg)] flex flex-col justify-center items-center p-4 relative overflow-hidden editorial-grid transition-colors duration-250">
      <JournalBook
        open={open}
        cover={<JournalCover year={year} />}
        page={
          <JournalPage
            loading={props.loading}
            authError={props.authError}
            loginForm={props.loginForm}
            onSubmit={props.handleLogin}
            triggerToast={props.triggerToast}
          />
        }
      />

      <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-[var(--editorial-text-gray)] font-bold">
        // Marketing-Hub · {year}
      </p>
    </div>
  );
}
