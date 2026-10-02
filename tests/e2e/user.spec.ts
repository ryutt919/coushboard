import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { allowedHost, expectNoSeriousA11y, FIX, trackHosts } from './helpers'

// 실제 Supabase(로컬 스택 또는 테스트 프로젝트) + 테스트 사용자. 픽스처만 사용한다.
// 환경변수: E2E_EMAIL, E2E_PASSWORD (이 사용자는 테스트 전용이어야 한다. 시작할 때 데이터를 모두 지운다)
// E2E_MODE=demo 이면 서버 없이 예시 화면(메모리 저장소)으로 같은 화면 시나리오를 돌린다(저장 유지 검사 8, 12 제외).
const demo = process.env.E2E_MODE === 'demo'
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD ?? 'Test-pass-12345!'

async function login(page: Page) {
  await page.goto('/')
  if (demo) {
    await page.getByRole('button', { name: '예시 화면 보기' }).click()
    await expect(page.getByRole('button', { name: '예시 끝내기' })).toBeVisible()
    return
  }
  await page.getByLabel('이메일').fill(email!)
  await page.getByLabel(/^비밀번호/).fill(password)
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible({ timeout: 20000 })
}

async function wipe(page: Page) {
  await page.goto('/#/upload')
  await page.getByRole('button', { name: '내 데이터 전체 삭제' }).click()
  await page.getByRole('button', { name: '계속' }).click()
  await page.getByRole('button', { name: '네, 전부 삭제' }).click()
  await expect(page.getByRole('button', { name: '내 데이터 전체 삭제' })).toBeVisible()
}

/** 예시 모드는 탭마다 메모리가 새로 시작하므로, 이어지는 시나리오 앞에서 픽스처를 다시 올린다 */
async function ensureData(page: Page) {
  if (!demo) return
  await wipe(page)
  await page.getByTestId('file-input').setInputFiles(FIX('orders_fixture.csv'))
  await expect(page.getByTestId('res-raw')).toHaveText('21행')
  await page.getByTestId('file-input').setInputFiles(FIX('receipts_fixture.csv'))
  await expect(page.getByTestId('res-dedupe')).toHaveText('2행')
}

async function moveEggCookerToLiving(page: Page) {
    await page.getByRole('searchbox', { name: '상품명 검색' }).fill('에그밥솥')
    await page.getByTestId('row').first().getByRole('button', { name: /카테고리 변경/ }).click()
    const panel = page.getByRole('region', { name: '카테고리 바꾸기' })
    await panel.getByRole('button', { name: '생활용품', exact: true }).click()
    await panel.getByLabel('같은 품목 전부').check()
    await panel.getByRole('button', { name: '저장' }).click()
    await expect(page.getByTestId('row').first()).toContainText('생활용품')
}

const total = (page: Page) => page.getByTestId('kpi-total')
const allPeriod = (page: Page) => page.getByRole('button', { name: '전체', exact: true }).click()

test.describe.configure({ mode: 'serial' })
test.skip(!email && !demo, 'E2E_EMAIL이 없어 건너뜁니다 (로컬 Supabase 스택 또는 테스트 사용자 필요)')

test.describe('H5: 화면 E2E (Supabase)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('1~7: 업로드부터 대시보드 숫자까지', async ({ page, baseURL }) => {
    const net = trackHosts(page)
    await wipe(page)

    // 1. 주문 픽스처 업로드 -> 21행, 중복 제거 3행
    await page.getByTestId('file-input').setInputFiles(FIX('orders_fixture.csv'))
    await expect(page.getByTestId('res-raw')).toHaveText('21행', { timeout: 20000 })
    await expect(page.getByTestId('res-dedupe')).toHaveText('3행')

    // 2. 영수증 픽스처 -> 복원 1행
    await page.getByTestId('file-input').setInputFiles(FIX('receipts_fixture.csv'))
    await expect(page.getByTestId('res-dedupe-note')).toContainText('1행', { timeout: 20000 })
    await expect(page.getByTestId('res-dedupe')).toHaveText('2행')
    await expectNoSeriousA11y(page, '업로드 결과')

    // 3. 대시보드 전체 + 받은 상품만
    await page.goto('/#/')
    await allPeriod(page)
    await expect(total(page)).toContainText('361,540')
    await expectNoSeriousA11y(page, '대시보드')

    // 4. 반품·취소만
    await page.getByLabel('주문 상태').selectOption('ret')
    await expect(total(page)).toContainText('1,074,000')
    await page.getByLabel('주문 상태').selectOption('ok')

    // 5. 건강·의료 클릭 -> 표에 2행
    await page.getByTestId('cat-건강·의료').click()
    await expect(page.getByTestId('row')).toHaveCount(2)
    await page.getByTestId('cat-건강·의료').click()

    // 6. 세부 내역: 펩시 제로 슈거 라임향
    await page.getByRole('tab', { name: '세부 내역' }).click()
    await page.getByRole('button', { name: /펩시 제로 슈거 라임향/ }).first().click()
    await expect(page.getByTestId('prod-count')).toContainText('4건')
    await expect(page.getByTestId('prod-amount')).toContainText('92,580')
    await expect(page.getByTestId('unit-best').first()).toContainText('790원')
    await expect(page.getByTestId('alias')).toHaveCount(3)

    // 7. 기간 2025-01-01 ~ 2026-06-30 -> 막대 18개, 2026년 6월은 막대 없이 —
    await page.getByRole('tab', { name: '개요' }).click()
    await page.getByLabel('시작일').fill('2025-01-01')
    await page.getByLabel('종료일').fill('2026-06-30')
    await expect(page.getByTestId('bar')).toHaveCount(18)
    await expect(page.getByTestId('bar').last()).toHaveAttribute('data-future', 'true')
    await expect(page.getByTestId('bars').locator('.bar-val').last()).toHaveText('—')

    for (const h of net.hosts) expect(allowedHost(h, baseURL!), h).toBe(true)
  })

  test('8: 카테고리를 바꾸면 새로고침, 로그아웃 후 재로그인해도 유지된다', async ({ page }) => {
    await ensureData(page)
    await page.goto('/#/')
    await allPeriod(page)
    await moveEggCookerToLiving(page)
    if (demo) return // 예시 화면은 새로고침하면 초기화되므로 저장 유지는 Supabase 모드에서만 검사한다

    await page.reload()
    await page.getByRole('searchbox', { name: '상품명 검색' }).fill('에그밥솥')
    await expect(page.getByTestId('row').first()).toContainText('생활용품')

    await page.getByRole('button', { name: '로그아웃' }).click()
    await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible()
    await login(page)
    await page.getByRole('searchbox', { name: '상품명 검색' }).fill('에그밥솥')
    await expect(page.getByTestId('row').first()).toContainText('생활용품')
  })

  test('9: 규칙과 지정 내역 내보내기, 초기화, 가져오기로 같은 숫자가 복원된다', async ({ page }, info) => {
    await ensureData(page)
    await page.goto('/#/')
    await allPeriod(page)
    if (demo) await moveEggCookerToLiving(page)
    const before = ((await page.getByTestId('cat-생활용품').textContent()) ?? '').replace(/\s+/g, ' ').trim()

    await page.goto('/#/categories')
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: '규칙 내보내기 (JSON)' }).click()
    const file = info.outputPath('settings.json')
    await (await dl).saveAs(file)
    const json = JSON.parse(readFileSync(file, 'utf-8'))
    expect(json.kind).toBe('coushboard-settings')
    expect(Object.keys(json.overrides.group).length).toBeGreaterThan(0)

    await page.getByRole('button', { name: '규칙과 지정 초기화' }).click()
    await page.getByTestId('reset-confirm').click()
    await expect(page.getByTestId('st-manual')).toContainText('0')

    await page.getByTestId('import-input').setInputFiles(file)
    await expect(page.getByTestId('st-manual')).not.toContainText(/^0/, { timeout: 15000 })
    await page.goto('/#/')
    await allPeriod(page)
    await expect(page.getByTestId('cat-생활용품')).toHaveText(before)
  })

  test('11: 같은 파일을 두 번 올리면 안내하고 데이터는 그대로다', async ({ page }) => {
    await ensureData(page)
    await page.goto('/#/upload')
    await page.getByTestId('file-input').setInputFiles(FIX('orders_fixture.csv'))
    await expect(page.getByTestId('duplicate-notice')).toContainText('이미 올린 파일')
    await page.goto('/#/')
    await allPeriod(page)
    await expect(total(page)).toContainText('361,540')
  })

  test('12: 로그아웃 상태 새 브라우저에서 접근하면 로그인 화면이고 데이터 요청은 0건이다', async ({ browser, baseURL }) => {
    test.skip(demo, '로그인 화면 검사는 demo.spec에서 한다')
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    const net = trackHosts(p)
    await p.goto(baseURL! + '/#/')
    await expect(p.getByRole('heading', { name: '로그인' })).toBeVisible()
    await p.waitForTimeout(500)
    expect(net.urls.filter((u) => /\/rest\/v1\//.test(u))).toEqual([])
    await ctx.close()
  })
})
