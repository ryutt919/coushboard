// npm run verify : lint -> typecheck -> H1 -> H2 -> H3 -> H4(픽스처) -> H6 -> (supabase start -> db reset -> H8 -> H9) -> build -> H5
// CI도 같은 명령을 쓴다. 건너뛴 단계는 SKIPPED로 크게 표시하고 요약에 남긴다(조용히 넘어가지 않는다).
import { spawnSync } from 'node:child_process'

const isWin = process.platform === 'win32'
const results = []

function run(name, cmd, args, env = {}) {
  console.log(`\n=== ${name}: ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: isWin, env: { ...process.env, ...env } })
  const ok = r.status === 0
  results.push({ name, status: ok ? 'PASS' : 'FAIL' })
  if (!ok) summary(1)
  return r
}

function skip(name, why) {
  console.log(`\n=== ${name}: SKIPPED (${why})`)
  results.push({ name, status: 'SKIPPED', why })
}

function summary(code) {
  console.log('\n──────── verify 요약 ────────')
  for (const r of results) console.log(`${r.status.padEnd(8)} ${r.name}${r.why ? '  — ' + r.why : ''}`)
  process.exit(code)
}

const has = (cmd) => spawnSync(isWin ? 'where' : 'which', [cmd], { shell: isWin }).status === 0

run('lint', 'npx', ['eslint', 'src', 'tests', 'scripts'])
run('typecheck', 'npx', ['tsc', '-p', 'tsconfig.app.json', '--noEmit'])
run('H1 단위', 'npx', ['vitest', 'run', 'tests/unit'])
run('H2 골든', 'npx', ['vitest', 'run', 'tests/golden.test.ts'])
run('H3 성질', 'npx', ['vitest', 'run', 'tests/property.test.ts'])
run('H4 차등(픽스처)', 'npx', ['vitest', 'run', 'tests/oracle.test.ts'])
run('H6 개인정보 가드', 'node', ['scripts/privacy-scan.mjs'])

// H8, H9: 로컬 Supabase 스택(권장) 또는 일회용 테스트 프로젝트. 운영 프로젝트에는 절대 붙이지 않는다.
let dbEnv = null
if (process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_ANON_KEY) {
  dbEnv = {}
} else if (has('supabase')) {
  run('supabase start', 'supabase', ['start'])
  run('supabase db reset', 'supabase', ['db', 'reset'])
  run('H8 pgTAP (supabase test db)', 'supabase', ['test', 'db'])
  const st = spawnSync('supabase', ['status', '-o', 'env'], { shell: isWin, encoding: 'utf-8' })
  const get = (k) => new RegExp(`^${k}="?([^"\\n]+)"?`, 'm').exec(st.stdout)?.[1]
  dbEnv = { SUPABASE_TEST_URL: get('API_URL'), SUPABASE_TEST_ANON_KEY: get('ANON_KEY') }
} else {
  skip('H8 pgTAP / H8 supabase-js / H9 저장 왕복', 'supabase CLI도 SUPABASE_TEST_URL도 없음. 로컬 스택 또는 테스트 프로젝트가 필요합니다')
}
if (dbEnv) {
  run('H8 supabase-js RLS', 'npx', ['vitest', 'run', 'tests/db/rls.test.ts'], dbEnv)
  run('H9 저장 왕복', 'npx', ['vitest', 'run', 'tests/db/roundtrip.test.ts'], dbEnv)
}

run('build', 'npm', ['run', 'build'])
run('H6 개인정보 가드 (빌드 결과물 포함)', 'node', ['scripts/privacy-scan.mjs'])
run('H5 E2E 예시 화면', 'npx', ['playwright', 'test', 'tests/e2e/demo.spec.ts'])
run('H5 E2E 화면 시나리오(예시 모드, 픽스처)', 'npx', ['playwright', 'test', 'tests/e2e/user.spec.ts'], { E2E_MODE: 'demo' })
// Supabase 연결 E2E: 로컬 스택은 이메일 확인이 꺼져 있어 테스트 사용자를 바로 만들 수 있다.
let e2e = null
if (dbEnv) {
  const url = dbEnv.SUPABASE_TEST_URL ?? process.env.SUPABASE_TEST_URL
  const key = dbEnv.SUPABASE_TEST_ANON_KEY ?? process.env.SUPABASE_TEST_ANON_KEY
  const password = process.env.E2E_PASSWORD ?? 'Test-pass-12345!'
  let email = process.env.E2E_EMAIL
  if (!email) {
    email = `e2e-${Date.now()}@example.com`
    const r = await fetch(`${url}/auth/v1/signup`, { method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
    const j = await r.json().catch(() => ({}))
    if (!j.access_token) email = null // 이메일 확인이 켜진 프로젝트: E2E_EMAIL로 미리 만든 사용자를 지정해야 한다
  }
  if (email) e2e = { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key, E2E_EMAIL: email, E2E_PASSWORD: password, E2E_MODE: '' }
}
if (e2e) run('H5 E2E Supabase', 'npx', ['playwright', 'test', 'tests/e2e/user.spec.ts'], e2e)
else skip('H5 E2E Supabase', 'Supabase 연결과 테스트 사용자(E2E_EMAIL)가 필요합니다')
summary(0)
