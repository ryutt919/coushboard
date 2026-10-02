import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// 테스트는 운영 프로젝트가 아니라 로컬 스택(또는 일회용 테스트 프로젝트)에만 붙인다.
// 환경변수: SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY
// 로컬 스택은 이메일 확인이 꺼져 있어 가입 즉시 세션이 생긴다.
// 이메일 확인이 켜진 프로젝트에서는 미리 만든 테스트 사용자로 로그인한다:
//   SUPABASE_TEST_PASSWORD, SUPABASE_TEST_USER_A, SUPABASE_TEST_USER_B (이메일)
export const URL = process.env.SUPABASE_TEST_URL
export const ANON = process.env.SUPABASE_TEST_ANON_KEY
export const dbEnabled = Boolean(URL && ANON)

export function newClient(): SupabaseClient {
  return createClient(URL!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function login(label: 'A' | 'B'): Promise<{ client: SupabaseClient; userId: string }> {
  const client = newClient()
  const premade = process.env[`SUPABASE_TEST_USER_${label}`]
  const password = process.env.SUPABASE_TEST_PASSWORD ?? 'Test-pass-12345!'
  if (premade) {
    const { data, error } = await client.auth.signInWithPassword({ email: premade, password })
    if (error || !data.user) throw new Error(`테스트 사용자 ${label} 로그인 실패: ${error?.message}`)
    return { client, userId: data.user.id }
  }
  const email = `rls-${label.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const { data, error } = await client.auth.signUp({ email, password })
  if (error) throw new Error(`가입 실패: ${error.message}`)
  if (!data.session || !data.user) {
    throw new Error('가입 후 세션이 없습니다. 이메일 확인이 켜진 프로젝트입니다. SUPABASE_TEST_USER_A/B 로 미리 만든 사용자를 지정하세요.')
  }
  return { client, userId: data.user.id }
}
