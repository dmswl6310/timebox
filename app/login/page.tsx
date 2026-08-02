import { LoginForm } from "./login-form";

export const metadata = {
  title: "로그인 — Timebox",
};

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="login-wordmark"><span>▥</span> TIMEBOX</div>
        <div>
          <p className="login-kicker">Plan less. Finish better.</p>
          <h1>오늘을<br />시간으로 설계하세요.</h1>
          <p>머릿속 할 일을 모두 꺼내고, 중요한 일부터 실제 시간에 배치하세요.</p>
        </div>
        <div className="login-mini-schedule" aria-hidden="true">
          <span className="mini-time">09:00</span><i className="mini-block coral" />
          <span className="mini-time">10:00</span><i className="mini-block green" />
          <span className="mini-time">13:00</span><i className="mini-block violet" />
        </div>
      </section>
      <section className="login-form-panel">
        <LoginForm />
      </section>
    </main>
  );
}
