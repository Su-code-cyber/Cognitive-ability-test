import { test, expect, type Page } from '@playwright/test'

const prefix = '/api/blue/bluecommonservice'
const password = 'Local-test-123!'

async function authenticate(page: Page, phone: string, mode: '注册' | '登录' = '注册') {
  await page.goto('/login')
  if (mode === '注册') await page.getByRole('radiogroup').getByText('注册', { exact: true }).click()
  await page.getByRole('textbox', { name: '手机号', exact: true }).fill(phone)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByRole('checkbox').check()
  // Ant Design inserts visual spacing into two-character Chinese button labels.
  await page.getByRole('button', { name: mode === '注册' ? /^注\s*册$/ : /^登\s*录$/ }).click()
  await expect(page).toHaveURL(/\/exam$/)
}

async function begin(page: Page) {
  await page.getByRole('button', { name: '开始测评', exact: true }).click()
  await expect(page.getByRole('radio').first()).toBeVisible()
}

async function next(page: Page, index: number) {
  const response = page.waitForResponse((r) => r.url().endsWith('/exam/submitAnswer') && r.request().method() === 'POST')
  await page.getByRole('button', { name: index === 6 ? /提交并完成$/ : /下一题$/ }).click()
  expect((await response).status()).toBe(200)
  if (index < 6) await expect(page.locator('strong').first()).toHaveText(String(index + 1))
}

test('真实页面：注册、退出、登录、单选多选、正常交卷和完成页恢复', async ({ page }) => {
  await authenticate(page, '13800001001')
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await page.getByRole('button', { name: '确认退出', exact: true }).click()
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  await authenticate(page, '13800001001', '登录')
  await begin(page)
  for (let index = 1; index <= 6; index++) {
    if (index === 2 || index === 5) {
      await expect(page.getByRole('checkbox').first()).toBeVisible()
      const optionA = page.getByRole('checkbox', { name: 'A', exact: true })
      const optionC = page.getByRole('checkbox', { name: 'C', exact: true })
      await optionA.click()
      await expect(optionA).toBeChecked()
      await optionC.click()
      await expect(optionC).toBeChecked()
    } else {
      await page.getByRole('radio').nth(({ 1: 2, 3: 0, 4: 1, 6: 3 } as Record<number, number>)[index]).check()
    }
    await next(page, index)
  }
  await expect(page.getByRole('heading', { name: '提交成功' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '提交成功' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '提交成功' }).locator('../..')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: '.runtime/completed.png', animations: 'disabled' })
})

test('真实页面：刷新续考、倒计时不重置、提前交卷', async ({ page }) => {
  await authenticate(page, '13800001002')
  await begin(page)
  await page.getByRole('radio').first().check()
  await next(page, 1)
  await expect(page.getByRole('checkbox').first()).toBeVisible()
  const before = await page.request.post(prefix + '/exam/getMyExamRecords', { data: {} })
  const code = (await before.json()).data.list[0].sessionCode
  await page.waitForTimeout(1500)
  await page.reload()
  await page.getByRole('button', { name: '继续测评', exact: true }).click()
  await expect(page.getByRole('checkbox').first()).toBeVisible()
  const resumed = await page.request.post(prefix + '/exam/resumeExam', { data: { sessionCode: code } })
  const q = (await resumed.json()).data.currentQuestion
  expect(q.questionIndex).toBe(2)
  expect(q.remainingSeconds).toBeLessThan(8)
  await page.getByRole('button', { name: /交\s*卷$/ }).click()
  await page.getByRole('button', { name: '确认交卷', exact: true }).click()
  await expect(page.getByRole('heading', { name: '提交成功' })).toBeVisible()
  const forbidden = await page.request.post(prefix + '/exam/submitAnswer', {
    data: { sessionCode: code, questionId: q.questionId, questionIndex: 2, answer: 'A' },
  })
  expect(forbidden.status()).toBe(409)
})

test('真实页面：未选答案超时自动切题', async ({ page }) => {
  await authenticate(page, '13800001003')
  await begin(page)
  const response = await page.waitForResponse((r) => r.url().endsWith('/exam/submitAnswer'), { timeout: 15_000 })
  expect(response.status()).toBe(200)
  const result = (await response.json()).data
  expect(result.timedOut).toBe(true)
  expect(result.nextQuestion.questionIndex).toBe(2)
  await expect(page.getByRole('checkbox').first()).toBeVisible()
})

test('真实页面：提交响应丢失后重试不重复推进', async ({ page }) => {
  await authenticate(page, '13800001004')
  await begin(page)
  await page.route('**/exam/submitAnswer', async (route) => {
    // The server saves the answer but the browser loses the response.
    await route.fetch()
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, message: '测试：响应丢失' }) })
  }, { times: 1 })
  await page.getByRole('radio').first().check()
  await page.getByRole('button', { name: /下一题$/ }).click()
  await page.getByRole('button', { name: '重试提交', exact: true }).click()
  await expect(page.getByRole('checkbox').first()).toBeVisible()
  await expect(page.getByRole('radio')).toHaveCount(0)
  await page.screenshot({ path: '.runtime/answering.png', animations: 'disabled' })
})

test('真实页面：两个独立用户进度互不影响', async ({ browser }) => {
  const a = await browser.newContext()
  const b = await browser.newContext()
  try {
    const pageA = await a.newPage()
    const pageB = await b.newPage()
    await authenticate(pageA, '13800001005')
    await begin(pageA)
    await pageA.getByRole('radio').first().check()
    await next(pageA, 1)
    await authenticate(pageB, '13800001006')
    await begin(pageB)
    await expect(pageA.getByRole('checkbox').first()).toBeVisible()
    await expect(pageB.getByRole('radio').first()).toBeVisible()
    const recordsA = await pageA.request.post(prefix + '/exam/getMyExamRecords', { data: {} })
    const code = (await recordsA.json()).data.list[0].sessionCode
    const denied = await pageB.request.post(prefix + '/exam/resumeExam', { data: { sessionCode: code } })
    expect(denied.status()).toBe(404)
  } finally {
    await a.close()
    await b.close()
  }
})

test('真实页面：访问 Cookie 丢失时自动刷新，缓存身份不能绕过登录', async ({ page, context }) => {
  await authenticate(page, '13800001007')
  await context.clearCookies({ name: 'exam_access' })
  const refreshed = page.waitForResponse((r) => r.url().endsWith('/auth/refresh'))
  await page.reload()
  expect((await refreshed).status()).toBe(200)
  await expect(page.getByRole('button', { name: '开始测评', exact: true })).toBeEnabled()
  await context.clearCookies()
  // localStorage still has user_info, but the server has no authenticating cookie.
  await page.reload()
  await expect(page).toHaveURL(/\/login/)
})
