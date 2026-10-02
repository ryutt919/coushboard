import { expect, test } from '@playwright/test'
import { allowedHost, expectNoSeriousA11y, trackHosts } from './helpers'

// 예시(mock) 화면: 서버 없이 동작해야 한다. 가입 없이 누구나 볼 수 있다.
test.describe('예시 화면 (mock 데이터)', () => {
  test('로그아웃 상태에서는 로그인 화면만 보이고 데이터 요청이 없다', async ({ page, baseURL }) => {
    const net = trackHosts(page)
    for (const hash of ['#/', '#/upload', '#/categories']) {
      await page.goto('/' + hash)
      await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible()
      await expect(page.getByTestId('kpi-total')).toHaveCount(0)
    }
    expect(net.urls.filter((u) => /\/rest\/v1\//.test(u))).toEqual([])
    for (const h of net.hosts) expect(allowedHost(h, baseURL!), h).toBe(true)
  })

  test('예시 화면에서 대시보드, 세부 내역, 카테고리 정리, 업로드를 모두 쓸 수 있다', async ({ page, baseURL }) => {
    const net = trackHosts(page)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

    await page.goto('/')
    await page.getByRole('button', { name: '예시 화면 보기' }).click()
    await expect(page.getByTestId('kpi-total')).toContainText('원')
    const total = await page.getByTestId('kpi-total').innerText()

    // 반품·취소 포함은 합계가 커진다
    await page.getByLabel('주문 상태').selectOption('all')
    await expect(page.getByTestId('kpi-total')).not.toHaveText(total)
    await page.getByLabel('주문 상태').selectOption('ok')
    await expect(page.getByTestId('kpi-total')).toHaveText(total)

    // 카테고리 클릭으로 표가 걸러진다
    await page.getByTestId('cat-건강·의료').click()
    const rows = page.getByTestId('row')
    await expect(rows.first()).toBeVisible()
    for (const c of await rows.locator('button[aria-label^="카테고리 변경"]').all()) {
      await expect(c).toHaveAttribute('aria-label', /건강·의료/)
    }
    await page.getByTestId('cat-건강·의료').click()

    await expect(page.getByTestId('bar').first()).toBeVisible()
    await expectNoSeriousA11y(page, '대시보드(예시)')

    // 세부 내역: 자주 산 품목과 최저 개당 가격 강조
    await page.getByRole('tab', { name: '세부 내역' }).click()
    await expect(page.getByTestId('product-name')).toBeVisible()
    await expect(page.getByTestId('unit-best').first()).toBeVisible()
    await expectNoSeriousA11y(page, '세부 내역(예시)')

    // 카테고리 편집(예시라 저장은 메모리에만)
    await page.getByRole('tab', { name: '개요' }).click()
    await page.getByTestId('row').first().getByRole('button', { name: /카테고리 변경/ }).click()
    const panel = page.getByRole('region', { name: '카테고리 바꾸기' })
    await expect(panel).toBeVisible()
    await panel.getByRole('button', { name: '생활용품', exact: true }).click()
    await panel.getByRole('button', { name: '저장' }).click()
    await expect(panel).toHaveCount(0)

    await page.getByRole('link', { name: /카테고리 정리/ }).click()
    await expect(page.getByTestId('st-auto')).toBeVisible()
    await expect(page.getByTestId('st-manual')).not.toHaveText(/^0/)
    await expectNoSeriousA11y(page, '카테고리 정리(예시)')

    await page.getByRole('link', { name: 'CSV 올리기' }).click()
    await expect(page.getByRole('heading', { name: '주문목록 CSV 올리기' })).toBeVisible()
    await expectNoSeriousA11y(page, '업로드(예시)')

    expect(errors).toEqual([])
    for (const h of net.hosts) expect(allowedHost(h, baseURL!), h).toBe(true)
    expect(net.urls.filter((u) => /\/rest\/v1\//.test(u))).toEqual([])
  })

  test('키보드만으로 탭과 버튼을 조작할 수 있다', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '예시 화면 보기' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('kpi-total')).toBeVisible()
    await page.getByRole('tab', { name: '세부 내역' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('product-name')).toBeVisible()
    await page.getByRole('tab', { name: '개요' }).focus()
    await page.keyboard.press('Space')
    await expect(page.getByTestId('kpi-total')).toBeVisible()
  })

  test('예시 화면을 끝내면 로그인 화면으로 돌아간다', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '예시 화면 보기' }).click()
    await page.getByTestId('kpi-total').waitFor()
    await page.getByRole('button', { name: '예시 끝내기' }).click()
    await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible()
  })
})
