import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../state/AppState'

function korean(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return '이메일 또는 비밀번호가 맞지 않습니다.'
  if (m.includes('already registered') || m.includes('already been registered')) return '이미 가입된 이메일입니다. 로그인해 주세요.'
  if (m.includes('email not confirmed')) return '이메일 인증이 아직 끝나지 않았습니다. 받은 메일의 링크를 눌러 주세요.'
  if (m.includes('rate limit')) return '요청이 너무 많습니다. 잠시 뒤에 다시 시도해 주세요.'
  if (m.includes('password')) return '비밀번호가 조건에 맞지 않습니다. 8자 이상으로 정해 주세요.'
  if (m.includes('valid email') || m.includes('invalid email')) return '이메일 형식이 올바르지 않습니다.'
  return msg
}

export function Login() {
  const app = useApp()
  const [kind, setKind] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setErr(null)
    setInfo(null)
    if (kind === 'up' && pw.length < 8) {
      setErr('비밀번호는 8자 이상으로 정해 주세요.')
      return
    }
    setBusy(true)
    try {
      if (kind === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
        if (error) setErr(korean(error.message))
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw })
        if (error) setErr(korean(error.message))
        else if (!data.session) {
          setInfo('가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요.')
          setKind('in')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="shell">
      <div className="auth-wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="brand-mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 10h18" />
              <path d="M7 15h4" />
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4 }}>쿠팡 지출 기록</h1>
            <div className="sub">주문목록 CSV로 기간별, 카테고리별, 품목별 지출을 봅니다</div>
          </div>
        </div>

        <section className="card card-pad" aria-labelledby="auth-title" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 id="auth-title" className="h2">
            {kind === 'in' ? '로그인' : '회원가입'}
          </h2>
          {!app.supabaseConfigured && (
            <div className="notice err" role="alert">
              서버 연결 설정(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)이 없어 로그인할 수 없습니다. 예시 화면은 볼 수 있습니다.
            </div>
          )}
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="field">
              이메일
              <input className="input lg" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field">
              비밀번호 {kind === 'up' && <span>(8자 이상)</span>}
              <input
                className="input lg"
                type="password"
                autoComplete={kind === 'in' ? 'current-password' : 'new-password'}
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </label>
            {err && (
              <div className="notice err" role="alert">
                {err}
              </div>
            )}
            {info && (
              <div className="notice info" role="status">
                {info}
              </div>
            )}
            <button type="submit" className="btn primary" style={{ justifyContent: 'center' }} disabled={busy || !app.supabaseConfigured}>
              {busy ? '처리 중…' : kind === 'in' ? '로그인' : '가입하기'}
            </button>
          </form>
          <button
            type="button"
            className="btn ghost"
            style={{ alignSelf: 'flex-start', height: 'auto', padding: 0 }}
            onClick={() => {
              setKind(kind === 'in' ? 'up' : 'in')
              setErr(null)
              setInfo(null)
            }}
          >
            {kind === 'in' ? '계정이 없나요? 회원가입' : '이미 계정이 있나요? 로그인'}
          </button>
          <p className="sub" style={{ margin: 0, lineHeight: 1.6 }}>
            가입하면 내 계정에만 보이는 공간이 생깁니다. 다른 사용자는 내 주문을 볼 수 없습니다(행 단위 접근 제한). 업로드한 CSV는 브라우저에서 읽고, 원본 행과 설정만 저장합니다.
          </p>
        </section>

        <section className="card card-pad" aria-labelledby="demo-title" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 id="demo-title" className="h2">
            먼저 둘러보기
          </h2>
          <p className="sub" style={{ margin: 0, lineHeight: 1.6 }}>
            가입 없이 가짜(mock) 주문 데이터로 만든 예시 화면을 볼 수 있습니다. 서버와 통신하지 않고, 어디에도 저장되지 않습니다.
          </p>
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={app.enterDemo}>
            예시 화면 보기
          </button>
        </section>
      </div>
    </div>
  )
}
