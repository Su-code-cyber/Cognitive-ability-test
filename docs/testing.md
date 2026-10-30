# 测试策略与验收

选择加分题 1：AI 辅助测试策略与自动化测试。重点验证真实业务行为和数据不变量，不以覆盖率数字或固定成功响应代替测试。

## 分层与风险

| 优先级 | 风险 | 测试方式 |
| --- | --- | --- |
| P0 | 新用户不能完成考试 | 浏览器完整注册、退出、登录、作答及交卷；接口完整流程 |
| P0 | 越权读取或修改他人场次 | 两个独立 Cookie 会话，对恢复、进度、提交、交卷分别越权测试 |
| P0 | 交卷后仍能改答案、重复请求跳题 | 提前和正常结束后的写请求；重试与两线程并发提交；数据库唯一记录检查 |
| P0 | 服务重启丢数据 | 文件 SQLite；重建应用及实际停止/重启 HTTP 服务进程后验证用户、会话和进度 |
| P1 | 刷新获得额外时间、超时规则失效 | 注入可推进的服务端时钟做边界测试；真实浏览器等到超时 |
| P1 | 前端和后端字段不匹配 | 真实页面单选、多选、续考、完成页恢复和提前交卷 |
| P1 | 密码泄露、Cookie 失效处理错误 | 哈希与加盐检查、凭据摘要检查、刷新轮换、旧凭据失效、退出后重放 |
| P1 | 网络响应丢失导致误操作 | 浏览器让服务端保存后返回模拟 503，再点击重试，验证只推进一次 |
| P2 | 参数和初始化错误 | 非法手机号/密码/选项/题号、分页、重复种子与题库变更快照 |

接口层使用 pytest + FastAPI TestClient，访问真实文件数据库，不 mock 数据库。通过工厂注入测试时钟仅控制时间，HTTP 接口不提供修改时间入口。浏览器层用 Playwright Chromium，通过实际 Vite 代理访问实际 FastAPI 服务。

## 环境与命令

先按 README 安装依赖，并在项目根目录执行：

```powershell
npm run test:api
npm run test:e2e:install
npm run test:e2e
npm run lint
npm run build
```

测试命令会把 TEMP、TMP、TMPDIR、Python 字节码策略和浏览器目录限制在项目内。API 测试每次使用 `.runtime/pytest-*` 下的新目录；浏览器测试每次使用 `.runtime/e2e-*` 下的新数据库，单题时限 8 秒。不接触 `backend/data/exam.sqlite3`。

浏览器服务端口为 18003 和 15173，测试失败时也由 Playwright 关闭它启动的服务，不复用开发服务。API 进程重启测试使用系统分配的空闲回环端口，客户端关闭环境代理。

`npm run test:api` 输出 JUnit 报告到 `.runtime/backend-results.xml`；浏览器生成 `.runtime/browser-results.xml` 和 `.runtime/playwright-report/index.html`。浏览器失败截图及 trace 位于 `.runtime/playwright-results`。测试默认不重试，避免把不稳定问题隐藏为成功。

停止测试后执行 `npm run test:clean`，仅清理脚本指定的项目内测试目录和报告，保留开发数据、浏览器、虚拟环境和依赖缓存。如需保存报告，应先复制到交付目录。

## 手工验收清单

1. 从新检出目录安装依赖并运行数据库初始化、后端和前端，不预置用户。
2. 新注册测试号码 A（11位且符合页面规则），退出后用错误和正确密码分别登录；重复注册 A 应拒绝。
3. 使用另一浏览器或独立浏览器配置注册 B。A 做到第二题，B 应仍从第一题开始。
4. 单选选择一项，多选选择多项，提交后查 answers 表；最后一题后显示提交成功。
5. 刷新后点击继续，题号保持，剩余时间不恢复为完整时限；当前题未提交选择不要求保存。
6. 等待超时，页面自动进入下一题，answers 中对应题的 answer 为空、timed_out 为 1。
7. 在中途点击“交卷”，确认后显示完成；重发答题请求应为 409。
8. 分别用 A/B Cookie 请求另一人的 sessionCode，恢复、进度、提交和交卷都应拒绝。
9. 停止后端并重启，账号仍能登录，已提交答案和场次状态仍存在。
10. 刷新已交卷页面，仍显示完成；退出后考试接口返回 401。

测试号码只作为本机数据，不发送短信或验证真实归属。每套卷每个用户一次场次，新的验收轮次使用新号码或独立测试数据库。

## 如何检查数据库

可使用 SQLite 查看工具打开测试运行目录中的 `.sqlite3`，或通过 Python 的 sqlite3 以只读方式查询：

```sql
SELECT id, phone, created_at FROM users;
SELECT session_code, user_id, status, current_index, finish_reason FROM exam_sessions;
SELECT session_code, question_index, answer, timed_out FROM answers ORDER BY session_code, question_index;
PRAGMA foreign_key_check;
```

不要公开真实密码、会话 Cookie 或包含实际个人数据的数据库。自动化测试均使用合成账号。

## 已发现并修复的问题

- 原前端把第一条考试记录直接当作续考目标，已增加状态和试卷匹配，完成页可恢复。
- 原前端提交前清空选择，失败后无法可靠重试，已保留选择并增加显式重试。
- 原前端只靠 setState 防重复点击，同一轮事件可能尚未更新，已增加同步锁，后端也用事务保护。
- 本地缓存曾使首次页面加载跳过身份检查，已每次通过后端 `/auth/me` 校验。
- 欢迎页固定30题与实际示例卷不一致，已调整为实际题量说明。

实际执行结果、环境限制及浏览器执行过程中发现的问题见 verification.md；设计边界见 design.md。
