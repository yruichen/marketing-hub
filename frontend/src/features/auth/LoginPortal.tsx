import type { LoginPortalProps } from './types';
import { JournalPage } from './JournalPage';
import './journal.css';

export function LoginPortal(props: LoginPortalProps) {
  const year = new Date().getFullYear();

  return (
    <div className="auth-shell">
      <div className="auth-shell__grid">
        <section className="auth-hero" aria-label="Marketing Hub creative entrance">
          <div className="auth-hero__badge">Marketing-Hub / {year}</div>
          <h1 className="auth-hero__title">
            Draft less.
            <span>Launch sharper.</span>
          </h1>
          <div className="auth-hero__brief" aria-hidden="true">
            <div className="auth-hero__brief-head">
              <span>CAMPAIGN BRIEF</span>
              <b>LIVE</b>
            </div>
            <div className="auth-hero__prompt">
              <span className="auth-hero__cursor" />
              Turn a rough thought into a reusable marketing system.
            </div>
            <div className="auth-hero__metrics">
              <span><b>04</b> channels</span>
              <span><b>12</b> assets</span>
              <span><b>01</b> workflow</span>
            </div>
          </div>
        </section>

        <section className="auth-panel-wrap">
          <JournalPage
            loading={props.loading}
            authError={props.authError}
            loginForm={props.loginForm}
            onSubmit={props.handleLogin}
            triggerToast={props.triggerToast}
          />
        </section>
      </div>
    </div>
  );
}
