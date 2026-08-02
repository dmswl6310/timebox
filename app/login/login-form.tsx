"use client";

import { createClient } from "@/lib/supabase/client";
import { ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/` },
      });
      setLoading(false);
      if (error) return setMessage(error.message);
      if (!data.session) return setMessage("확인 메일을 보냈어요. 메일의 링크를 눌러 가입을 완료해 주세요.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return setMessage("이메일 또는 비밀번호를 확인해 주세요.");
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="login-card">
      <div className="login-form-heading">
        <span>TIMEBOX</span>
        <h2>{mode === "login" ? "다시 만나서 반가워요" : "오늘부터 시작해 볼까요?"}</h2>
        <p>{mode === "login" ? "내 계획과 기록을 이어서 확인하세요." : "계정을 만들고 첫 타임박스를 계획하세요."}</p>
      </div>
      <div className="login-mode-tabs">
        <button data-active={mode === "login"} onClick={() => setMode("login")}>로그인</button>
        <button data-active={mode === "signup"} onClick={() => setMode("signup")}>회원가입</button>
      </div>
      <form onSubmit={submit} className="auth-form">
        <label>
          <span>이메일</span>
          <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
        </label>
        <label>
          <span>비밀번호</span>
          <div className="password-input">
            <input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6자 이상 입력하세요" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
        </label>
        {message && <div className="auth-message"><CheckCircle2 size={16} /> {message}</div>}
        <button className="auth-submit" disabled={loading}>
          {loading ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
          {mode === "login" ? "로그인하고 계획 열기" : "무료로 시작하기"}
        </button>
      </form>
      <div className="demo-divider"><span>또는</span></div>
      <Link className="demo-link" href="/demo">계정 없이 데모 먼저 보기</Link>
      <p className="auth-footnote">가입하면 서비스 이용약관과 개인정보 처리방침에 동의하게 됩니다.</p>
    </div>
  );
}
