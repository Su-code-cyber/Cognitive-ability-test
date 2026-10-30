# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: exam.spec.ts >> 真实页面：注册、退出、登录、单选多选、正常交卷和完成页恢复
- Location: tests\e2e\exam.spec.ts:27:1

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: locator.click: Test timeout of 45000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '注册', exact: true })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e5]:
    - generic [ref=e27]:
      - img "BlueFocus 校招" [ref=e28]
      - paragraph [ref=e29]: 蓝色光标
    - generic [ref=e30]:
      - generic [ref=e31]:
        - generic [ref=e32]:
          - heading "注册" [level=2] [ref=e33]
          - radiogroup "segmented control" [ref=e34]:
            - generic [ref=e35]:
              - generic [ref=e36] [cursor=pointer]:
                - radio "登录"
                - generic "登录" [ref=e37]
              - generic [ref=e38] [cursor=pointer]:
                - radio "注册" [checked]
                - generic "注册" [ref=e39]
        - paragraph [ref=e40]: 首次使用请用手机号和密码完成注册
      - generic [ref=e41]:
        - textbox "手机号" [ref=e51]: "13800001001"
        - generic [ref=e57]:
          - textbox "密码" [active] [ref=e62]: Local-test-123!
          - img "eye-invisible" [ref=e64] [cursor=pointer]
        - generic [ref=e72]:
          - generic [ref=e74] [cursor=pointer]:
            - checkbox "我已阅读并同意 《用户协议》" [checked] [ref=e76]
            - generic [ref=e79]:
              - text: 我已阅读并同意
              - button "《用户协议》" [ref=e80]
          - button "注 册" [ref=e81] [cursor=pointer]
  - generic:
    - generic:
      - paragraph:
        - generic: Copyright@ 2026-2026 BlueFocus. All rights reserved
        - generic: "|"
        - generic: 京ICP备09036360号-3
        - generic: "|"
        - generic: 京公网安备11010502032247
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test'
  2   | 
  3   | const prefix = '/api/blue/bluecommonservice'
  4   | const password = 'Local-test-123!'
  5   | 
  6   | async function authenticate(page: Page, phone: string, mode: '注册' | '登录' = '注册') {
  7   |   await page.goto('/login')
  8   |   if (mode === '注册') await page.getByText('注册', { exact: true }).click()
  9   |   await page.getByRole('textbox', { name: '手机号', exact: true }).fill(phone)
  10  |   await page.getByLabel('密码', { exact: true }).fill(password)
  11  |   await page.getByRole('checkbox').check()
> 12  |   await page.getByRole('button', { name: mode, exact: true }).click()
      |                                                               ^ Error: locator.click: Test timeout of 45000ms exceeded.
  13  |   await expect(page).toHaveURL(/\/exam$/)
  14  | }
  15  | 
  16  | async function begin(page: Page) {
  17  |   await page.getByRole('button', { name: '开始测评', exact: true }).click()
  18  |   await expect(page.getByRole('radio').first()).toBeVisible()
  19  | }
  20  | 
  21  | async function next(page: Page, index: number) {
  22  |   const response = page.waitForResponse((r) => r.url().endsWith('/exam/submitAnswer') && r.request().method() === 'POST')
  23  |   await page.getByRole('button', { name: index === 6 ? '提交并完成' : '下一题', exact: true }).click()
  24  |   expect((await response).status()).toBe(200)
  25  | }
  26  | 
  27  | test('真实页面：注册、退出、登录、单选多选、正常交卷和完成页恢复', async ({ page }) => {
  28  |   await authenticate(page, '13800001001')
  29  |   await page.getByRole('button', { name: '退出', exact: true }).click()
  30  |   await page.getByRole('button', { name: '确认退出', exact: true }).click()
  31  |   await expect(page).toHaveURL(/\/login$/)
  32  |   await authenticate(page, '13800001001', '登录')
  33  |   await begin(page)
  34  |   for (let index = 1; index <= 6; index++) {
  35  |     if (index === 2 || index === 5) {
  36  |       await expect(page.getByRole('checkbox').first()).toBeVisible()
  37  |       await page.getByRole('checkbox').nth(0).check()
  38  |       await page.getByRole('checkbox').nth(2).check()
  39  |     } else {
  40  |       await page.getByRole('radio').nth(({ 1: 2, 3: 0, 4: 1, 6: 3 } as Record<number, number>)[index]).check()
  41  |     }
  42  |     await next(page, index)
  43  |   }
  44  |   await expect(page.getByRole('heading', { name: '提交成功' })).toBeVisible()
  45  |   await page.reload()
  46  |   await expect(page.getByRole('heading', { name: '提交成功' })).toBeVisible()
  47  |   await page.screenshot({ path: '.runtime/completed.png' })
  48  | })
  49  | 
  50  | test('真实页面：刷新续考、倒计时不重置、提前交卷', async ({ page }) => {
  51  |   await authenticate(page, '13800001002')
  52  |   await begin(page)
  53  |   await page.getByRole('radio').first().check()
  54  |   await next(page, 1)
  55  |   await expect(page.getByRole('checkbox').first()).toBeVisible()
  56  |   const before = await page.request.post(prefix + '/exam/getMyExamRecords', { data: {} })
  57  |   const code = (await before.json()).data.list[0].sessionCode
  58  |   await page.waitForTimeout(1500)
  59  |   await page.reload()
  60  |   await page.getByRole('button', { name: '继续测评', exact: true }).click()
  61  |   await expect(page.getByRole('checkbox').first()).toBeVisible()
  62  |   const resumed = await page.request.post(prefix + '/exam/resumeExam', { data: { sessionCode: code } })
  63  |   const q = (await resumed.json()).data.currentQuestion
  64  |   expect(q.questionIndex).toBe(2)
  65  |   expect(q.remainingSeconds).toBeLessThan(8)
  66  |   await page.getByRole('button', { name: '交卷', exact: true }).click()
  67  |   await page.getByRole('button', { name: '确认交卷', exact: true }).click()
  68  |   await expect(page.getByRole('heading', { name: '提交成功' })).toBeVisible()
  69  |   const forbidden = await page.request.post(prefix + '/exam/submitAnswer', {
  70  |     data: { sessionCode: code, questionId: q.questionId, questionIndex: 2, answer: 'A' },
  71  |   })
  72  |   expect(forbidden.status()).toBe(409)
  73  | })
  74  | 
  75  | test('真实页面：未选答案超时自动切题', async ({ page }) => {
  76  |   await authenticate(page, '13800001003')
  77  |   await begin(page)
  78  |   const response = await page.waitForResponse((r) => r.url().endsWith('/exam/submitAnswer'), { timeout: 15_000 })
  79  |   expect(response.status()).toBe(200)
  80  |   const result = (await response.json()).data
  81  |   expect(result.timedOut).toBe(true)
  82  |   expect(result.nextQuestion.questionIndex).toBe(2)
  83  |   await expect(page.getByRole('checkbox').first()).toBeVisible()
  84  | })
  85  | 
  86  | test('真实页面：提交响应丢失后重试不重复推进', async ({ page }) => {
  87  |   await authenticate(page, '13800001004')
  88  |   await begin(page)
  89  |   await page.route('**/exam/submitAnswer', async (route) => {
  90  |     // The server saves the answer but the browser loses the response.
  91  |     await route.fetch()
  92  |     await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, message: '测试：响应丢失' }) })
  93  |   }, { times: 1 })
  94  |   await page.getByRole('radio').first().check()
  95  |   await page.getByRole('button', { name: '下一题', exact: true }).click()
  96  |   await page.getByRole('button', { name: '重试提交', exact: true }).click()
  97  |   await expect(page.getByRole('checkbox').first()).toBeVisible()
  98  |   await expect(page.getByRole('radio')).toHaveCount(0)
  99  |   await page.screenshot({ path: '.runtime/answering.png' })
  100 | })
  101 | 
  102 | test('真实页面：两个独立用户进度互不影响', async ({ browser }) => {
  103 |   const a = await browser.newContext()
  104 |   const b = await browser.newContext()
  105 |   try {
  106 |     const pageA = await a.newPage()
  107 |     const pageB = await b.newPage()
  108 |     await authenticate(pageA, '13800001005')
  109 |     await begin(pageA)
  110 |     await pageA.getByRole('radio').first().check()
  111 |     await next(pageA, 1)
  112 |     await authenticate(pageB, '13800001006')
```