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

  test('결제 내역을 거래일시, 1개당 가격, 금액으로 정렬할 수 있다', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '예시 화면 보기' }).click()
    await page.getByTestId('kpi-total').waitFor()
    const nums = async (id: string) => (await page.getByTestId(id).allInnerTexts()).map((t) => Number(t.replace(/[^\d]/g, '')))
    const dates = async () => (await page.getByTestId('rows').locator('tbody tr td:first-child').allInnerTexts()).map((t) => t.trim())
    const sorted = (a: number[], dir: 1 | -1) => a.every((v, i) => i === 0 || (dir === 1 ? a[i - 1] <= v : a[i - 1] >= v))

    // 기본: 거래일시 최근 순
    const d0 = await dates()
    expect(d0).toEqual([...d0].sort().reverse())
    await expect(page.getByTestId('sort-dt').locator('xpath=..')).toHaveAttribute('aria-sort', 'descending')

    // 금액: 처음 누르면 높은 순, 다시 누르면 낮은 순
    await page.getByTestId('sort-amount').click()
    await expect(page.getByTestId('sort-amount').locator('xpath=..')).toHaveAttribute('aria-sort', 'descending')
    const a1 = await nums('row-amount')
    expect(sorted(a1, -1)).toBe(true)
    expect(a1[0]).toBeGreaterThan(0)
    await page.getByTestId('sort-amount').click()
    await expect(page.getByTestId('sort-amount').locator('xpath=..')).toHaveAttribute('aria-sort', 'ascending')
    expect(sorted(await nums('row-amount'), 1)).toBe(true)

    // 1개당 가격: 맨 위가 "가장 큰 구매(1개당 가격)"와 같고, 상품당 평균은 총 지출 / 총 수량이다
    await page.getByTestId('sort-price').click()
    const p1 = await nums('row-price')
    expect(sorted(p1, -1)).toBe(true)
    expect(p1[0]).toBe(Number((await page.getByTestId('kpi-max').innerText()).replace(/[^\d]/g, '')))
    expect(Number((await page.getByTestId('kpi-avg').innerText()).replace(/[^\d]/g, ''))).toBeLessThanOrEqual(p1[0])
    await page.getByTestId('sort-price').click()
    expect(sorted(await nums('row-price'), 1)).toBe(true)

    // 거래일시: 다른 정렬에서 돌아오면 최근 순, 다시 누르면 오래된 순
    await page.getByTestId('sort-dt').click()
    const d1 = await dates()
    expect(d1).toEqual([...d1].sort().reverse())
    await page.getByTestId('sort-dt').click()
    const d2 = await dates()
    expect(d2).toEqual([...d2].sort())
    await expect(page.getByTestId('count-label')).toContainText('거래일시 오래된 순')

    // 정렬은 카테고리 필터와 함께 동작한다
    await page.getByTestId('cat-건강·의료').click()
    await page.getByTestId('sort-amount').click()
    expect(sorted(await nums('row-amount'), -1)).toBe(true)
    await expectNoSeriousA11y(page, '결제 내역 정렬')
  })

  test('세부 내역: 검색하면 일치하는 모든 품목의 합계가 기본으로 보이고, 개별 품목도 고를 수 있다', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '예시 화면 보기' }).click()
    await page.getByTestId('kpi-total').waitFor()
    await page.getByRole('tab', { name: '세부 내역' }).click()
    await page.getByRole('searchbox', { name: '품목 검색' }).fill('샘플')

    const all = page.getByTestId('all-item')
    await expect(all).toBeVisible()
    await expect(all).toHaveAttribute('aria-pressed', 'true') // 기본 선택
    await expect(page.getByTestId('product-name')).toContainText('샘플')
    await expect(page.getByTestId('product-name')).toContainText('검색 결과 전체')
    // 전체 항목의 건수와 상세의 구매 건수가 같다
    const allCount = ((await all.innerText()).match(/(\d+)건/) ?? ['', '0'])[1]
    await expect(page.getByTestId('prod-count')).toContainText(`${allCount}건`)
    expect(Number(allCount)).toBeGreaterThan(1)

    // 개별 품목을 누르면 그 품목만, 건수는 전체보다 적다
    const first = page.getByTestId('product-list').getByRole('button').nth(1)
    await first.click()
    await expect(all).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('product-name')).not.toContainText('검색 결과 전체')
    const oneCount = Number(((await page.getByTestId('prod-count').innerText()).match(/\d+/) ?? ['0'])[0])
    expect(oneCount).toBeLessThan(Number(allCount))
    await expect(page.getByRole('button', { name: '다른 이름 합치기' })).toBeVisible()

    // 다시 전체로
    await all.click()
    await expect(page.getByTestId('product-name')).toContainText('검색 결과 전체')
    await expect(page.getByRole('button', { name: '다른 이름 합치기' })).toHaveCount(0)

    // 검색어를 바꾸면 선택이 전체로 돌아간다
    await first.click().catch(() => undefined)
    await page.getByRole('searchbox', { name: '품목 검색' }).fill('모의')
    await expect(page.getByTestId('all-item')).toHaveAttribute('aria-pressed', 'true')
    await expectNoSeriousA11y(page, '세부 내역 검색 전체')
  })

  test('세부 내역 그래프: 기간을 직접 정하고 월별과 연도별을 고를 수 있다', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '예시 화면 보기' }).click()
    await page.getByTestId('kpi-total').waitFor()
    await page.getByRole('tab', { name: '세부 내역' }).click()
    const bars = page.getByTestId('pbar')

    // 전체 기간(18개월 초과)은 자동으로 연도별
    await expect(page.getByTestId('chart-title')).toContainText('연도별')
    await expect(bars).toHaveCount(3)

    // 월별로 바꾸면 달마다 막대가 나온다(2024-11 ~ 2026-09 = 23개월)
    await page.getByTestId('chart-unit-month').click()
    await expect(page.getByTestId('chart-title')).toContainText('월별')
    await expect(bars).toHaveCount(23)

    // 그래프 기간을 직접 정한다: 2026-01 ~ 2026-06 = 6개월
    await page.getByTestId('chart-from').fill('2026-01-01')
    await page.getByTestId('chart-to').fill('2026-06-30')
    await expect(bars).toHaveCount(6)
    await expect(page.getByTestId('chart-title')).toContainText('2026.01.01')

    // 자동으로 돌리면 18개월 이하라 월별 그대로, 연도별로 강제하면 한 해
    await page.getByTestId('chart-unit-auto').click()
    await expect(bars).toHaveCount(6)
    await page.getByTestId('chart-unit-year').click()
    await expect(bars).toHaveCount(1)

    // 바로 선택: 최근 12개월 -> 월별 12개, 위에서 고른 기간으로 되돌리기
    await page.getByTestId('chart-unit-auto').click()
    await page.getByRole('button', { name: '최근 12개월' }).click()
    await expect(bars).toHaveCount(12)
    await page.getByRole('button', { name: '위에서 고른 기간' }).click()
    await expect(bars).toHaveCount(3)

    // 그래프 기간은 위쪽 기간과 별개: 위에서 올해로 좁혀도 그래프는 직접 정한 기간을 쓴다
    await page.getByRole('button', { name: '전체 기간' }).click()
    await expect(bars).toHaveCount(3)
    await expectNoSeriousA11y(page, '세부 내역 그래프')
  })

  test('카테고리 정리는 받은 상품만 다루고, 카테고리를 직접 추가할 수 있다', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: '예시 화면 보기' }).click()
    await page.getByTestId('kpi-total').waitFor()

    // 대시보드의 "받은 상품만" 건수와 카테고리 정리의 전체 건수가 같다(반품, 취소 제외)
    const count = ((await page.getByTestId('kpi-count').innerText()).match(/[\d,]+/) ?? ['0'])[0].replace(/,/g, '')
    await page.getByLabel('주문 상태').selectOption('all')
    const countAll = ((await page.getByTestId('kpi-count').innerText()).match(/[\d,]+/) ?? ['0'])[0].replace(/,/g, '')
    expect(Number(countAll)).toBeGreaterThan(Number(count))
    await page.getByRole('link', { name: /카테고리 정리/ }).click()
    await expect(page.getByTestId('st-auto')).toContainText(`/ ${count}`)

    // 새 카테고리 추가
    await page.getByTestId('new-category-input').fill('반려동물')
    await page.getByTestId('new-category-add').click()
    await expect(page.getByTestId('category-chip').filter({ hasText: '반려동물' })).toBeVisible()
    // 같은 이름은 거부
    await page.getByTestId('new-category-input').fill('반려동물')
    await page.getByTestId('new-category-add').click()
    await expect(page.getByRole('alert').filter({ hasText: '이미 있는' })).toBeVisible()
    // 추가한 카테고리는 규칙 추가의 선택지에도 나온다
    await expect(page.getByTestId('rule-category').locator('option', { hasText: '반려동물' })).toHaveCount(1)
    // 삭제
    await page.getByRole('button', { name: '반려동물 카테고리 삭제' }).click()
    await page.getByRole('button', { name: '삭제', exact: true }).click()
    await expect(page.getByTestId('category-chip').filter({ hasText: '반려동물' })).toHaveCount(0)

    // 직접 확인할 상품: 상품마다 카테고리를 골라 지정한다
    const review = page.getByTestId('review-section')
    await expect(review).toBeVisible()
    if ((await page.getByTestId('conflict').count()) > 0) {
      const before = await page.getByTestId('st-conflicts').innerText()
      await page.getByTestId('conflict').first().getByRole('button', { name: /상품 확인하기|접기/ }).click()
      const item = page.getByTestId('review-item').first()
      await expect(item).toBeVisible()
      await item.getByRole('button', { name: '생활용품', exact: true }).click()
      await expect(page.getByTestId('st-manual')).not.toHaveText(/^0/)
      expect(await page.getByTestId('st-conflicts').innerText()).not.toBe(before)
    }
    await expectNoSeriousA11y(page, '카테고리 정리(확인 섹션)')
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
