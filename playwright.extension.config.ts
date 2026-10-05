import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

// 크롬 확장 E2E: 확장 대시보드(npm run build:ext 결과)를 Chromium 에 로드해 웹앱과 같은 화면 시나리오와 수집 시나리오를 돌린다.
// 쿠팡 서버에는 접속하지 않는다(수집 시나리오는 mc.coupang.com 요청을 가로채 합성 응답을 준다). 실행: npm run test:e2e:ext
process.env.E2E_MODE = 'extension'
// 예시 데이터는 tsx 로 JSON 파일에 뽑아 두고 테스트가 읽는다
process.env.E2E_DEMO_JSON = resolve('test-results/ext-demo.json')
execFileSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'scripts/dump-demo.ts', process.env.E2E_DEMO_JSON], { stdio: 'inherit' })

export default defineConfig({
  testDir: './tests',
  testMatch: ['e2e/demo.spec.ts', 'e2e/user.spec.ts', 'e2e-ext/*.spec.ts'],
  timeout: 180000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
})
