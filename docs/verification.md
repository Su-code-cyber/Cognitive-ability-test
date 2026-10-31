# 实际验证记录

本次开发与验证环境：Windows、Python 3.12.14、Node.js 24.15.0、npm 11.12.1。Python 完整版本锁定在 `backend/requirements.lock.txt`，前端和 Playwright 锁定在 `package-lock.json`。

本文以下表格保留首次功能验收记录。加分题 1 后续补齐了活动用户保护、源码/缓存隔离、运行守卫和报告归档，最终交付以 [加分题1说明](bonus1.md) 和 [本轮结果](reports/bonus1/summary.json) 为准，不能把旧的固定端口或旧临时目录说明当成当前测试入口。

## 加分题1最终验收（当前结果）

2026-10-31 北京时间 20:22:40 至 20:24:02，实际执行 `node scripts/test-all.mjs` 返回成功。API 与浏览器按顺序执行，无自动重试、无跳过用例。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| API、数据库、重启与隔离守卫 | **47 通过，0 失败，0 错误，0 跳过** | [JUnit](reports/bonus1/api-results.xml)、[控制台记录](reports/bonus1/api-console.txt) |
| 真实浏览器流程与地址防护 | **7 通过，0 失败，0 错误，0 跳过** | [JUnit](reports/bonus1/e2e-results.xml)、[控制台记录](reports/bonus1/e2e-console.txt) |
| 浏览器请求路线审计 | 739 条记录，2 次开发地址尝试被发送前拒绝，允许发出的本轮地址以外请求为 0 | [审计](reports/bonus1/network-audit.jsonl)、[汇总](reports/bonus1/summary.json) |
| 未配置入口及覆盖参数 | 直接 pytest、直接 Playwright 和覆盖浏览器配置均以非零码拒绝 | [检查记录](reports/bonus1/entrypoint-guards.txt) |
| 活动测试清理保护 | 测试运行期间清理失败且目录保留；只有结束的自有目录可删除 | JUnit 中两项清理用例 |
| 指定已结束运行清理 | 实际清理已结束的自有失败运行 e2e-7ph8e3，成功且只选择该目录 | [清理记录](reports/bonus1/cleanup-verification.txt) |
| 旁路活动用户保护 | 另一数据库完成考试并重启后，旁路用户仍登录、进度不变，能够继续提交下一题 | `test_separate_test_database_restart_does_not_change_ongoing_session` |
| 开发文件监听隔离 | 运行目录位于被当前 Vite 默认忽略的 node_modules 层，检查了已安装版本实际规则 | `test_runtime_is_under_vite_ignored_node_modules` |

本轮 API 运行 ID 为 `api-BC5eMN`，浏览器为 `e2e-CvuPu2`，测试代码提交为 `ce210f3`。每轮源码 SHA-256 记录在对应 run.json，报告及截图有独立校验清单。测试地址为 `127.0.0.1:14176` 和 `127.0.0.1:14177`；开发服务 5173/8003 未被复用或重启。

交付证据还包括 [隔离配置](reports/bonus1/isolation.json)、[完整浏览器 HTML 报告压缩包](reports/bonus1/browser-report.zip)、[作答截图](reports/bonus1/answering.png)、[完成截图](reports/bonus1/completed.png) 以及 [SHA-256 清单](reports/bonus1/checksums.sha256)。没有把活动数据库、测试数据库或浏览器个人资料复制到交付目录。

源码快照复制器额外排除实际 .env 配置、数据库及其 WAL/SHM、日志和符号链接；最终对这些文件名规则进行了静态断言检查。样例 `.env.example` 属于非敏感配置说明，可以保留。

### 本轮问题和修复

1. 发现绕过启动脚本可误用默认数据库，以及缓存与清理缺少隔离边界；加入数据库连接守卫、专属服务标识、独立缓存和活动锁。
2. 审查 Vite 实际实现发现，普通临时目录中的 tsconfig/HTML 仍可能进入开发监听；将整个运行目录置于被 Vite 忽略的 node_modules 层，不修改运行中的开发配置。
3. 新目录触发 Node/Playwright 不处理 node_modules 中 TypeScript 的限制；将复制的测试预编译成独立 ESM。[实际失败日志](reports/bonus1/initial-node-ts-loader-failure.txt)。
4. Vite 把该目录中的应用别名误识别为待优化依赖，导致 CommonJS 默认导出加载错误；关闭依赖自动发现，并明确预构建应用依赖。[实际失败日志](reports/bonus1/initial-dependency-isolation-failure.txt)。
5. 修复后先重验浏览器流程，再执行完整串行入口，得到上表最终结果。失败尝试没有从完整 AI 记录中删去。

当前仍有上游 Starlette/httpx 弃用提示，以及测试终端 NO_COLOR/FORCE_COLOR 的显示提示，不影响断言。没有在有人作答时重新安装依赖、运行压测、重建开发数据库或重启其服务。物理 CPU/内存仍是同机共享，不能把数据和进程隔离描述成资源占用为零。

## 首次功能验收结果（历史记录）

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| npm run lint | 通过，无 lint 错误或警告 | 最终命令输出；源码可复跑 |
| npm run build | 通过，生成 dist/index.html 和本地资源 | 最终命令输出 |
| npm run build:html | 通过，产物约 5.33 MB，写入项目内 dist/question.html | 最终命令输出 |
| npm run db:init | 通过，项目内创建 SQLite 文件；重复初始化测试也通过 | 命令输出、seed 重复初始化测试 |
| npm run test:api | **38 通过，0 失败**，约 22 秒 | [JUnit](reports/backend-results.xml) |
| npm run test:e2e | **6 通过，0 失败**，约 40 秒 | [JUnit](reports/browser-results.xml) |
| npm run test:clean | 通过；清理前后开发数据库 SHA-256 一致 | 实际命令输出及哈希比较 |

浏览器测试实际通过 Vite 代理访问 FastAPI，账号、场次及答案写入该轮独立 SQLite 文件。自动化没有用静态题目响应替代后端；只在“响应丢失”场景中，让真实服务先保存，再故意向浏览器返回 503。

API 测试覆盖：注册与登录、错误密码、重复注册、密码哈希与随机盐、会话凭据摘要、Cookie 属性、刷新轮换及过期、退出后旧 Cookie 重放、未登录访问全部考试接口、跨来源写请求拒绝、完整单选多选交卷、提前结束、完成后拒绝修改、双用户隔离、续考、截止边界与超时空答、重试和并发不重复推进、非法题号和选项、题库变更后的快照保持、重复种子以及实际进程重启。

六条浏览器场景分别为：

1. 注册 → 退出 → 登录 → 单选/多选 → 正常交卷 → 刷新后保持完成页。
2. 提交后刷新 → 恢复同一题及真实剩余时间 → 提前交卷 → 后端拒绝结束后提交。
3. 未选答案等到倒计时结束 → 页面自动提交 → 后端记录超时并返回下一题。
4. 后端保存答案后丢失响应 → 页面重试 → 恢复到下一题，避免重复推进。
5. 两个独立浏览器会话分别注册考试 → 题号互不影响 → 越权恢复请求被拒绝。
6. 访问 Cookie 丢失、刷新 Cookie 保留 → 自动恢复；清空 Cookie 后即使有缓存用户信息也跳回登录页。

页面证据：[作答页面](reports/answering.png)、[交卷完成页面](reports/completed.png)。截图中的短倒计时来自测试数据库的 8 秒配置，开发示例卷仍是每题 60 秒。

首次验证后已将当轮固定报告和截图保存到 `docs/reports/`，并实际运行当时的测试清理命令，确认开发数据库保持不变。当前测试已改为带运行标识和活动锁的独立目录，清理规则见加分题1说明。

## 调试过程与限制

- 初次依赖下载被网络沙箱阻止；使用环境的自动审批后重试，依赖只安装到项目 `.venv` 和 `node_modules`，缓存和临时文件均在 `.runtime`。
- 初次 TestClient 启动被沙箱的回环 socket 限制阻塞。通过 faulthandler 确认停在 asyncio 的 socketpair 创建处，停止阻塞进程后，在允许本机回环通信的执行环境中运行成功。没有修改业务权限来绕过限制。
- 首次 Vite 构建被沙箱 realpath 权限阻止，在获准环境重跑通过。
- 浏览器首轮因 Ant Design 对两字中文按钮自动插空格而定位失败；后续还修正隐藏 segmented 输入框、装饰图标参与按钮名称、退出后的合法 redirect 参数以及受控多选框状态提交时序等测试假设。保留[初始失败上下文](reports/browser-initial-failure.md)和[定位失败 JUnit](reports/browser-locator-failure.xml)，最终成功报告单独保存。
- 切题测试明确等待页面题号更新后再选择下一题，避免把界面更新时序误当作业务完成；多选通过点击并等待可观察的选中状态验证。
- 完成页有淡入动画，初次截图过早；最终截图等待容器完全显示并禁用截图期间的动画。

## 非阻断警告与未覆盖风险

后端测试有一个上游 Starlette TestClient 对 httpx 的弃用提示，当前锁定依赖下全部测试通过。前端构建有原有动态/静态混合导入提示和大 chunk 提示；没有将它们描述为构建失败。浏览器命令还有执行环境 NO_COLOR/FORCE_COLOR 冲突提示，不影响断言。

本次没有做高并发容量测试、移动端/多浏览器兼容测试、公网 HTTPS 部署、完整生产安全审计或摄像头防作弊。SQLite 部署定位和网络迟到记为空答等取舍见设计说明。

## 版本与交付状态

后续增加本机只读结果查询命令 `npm run db:results`，针对用户筛选、场次筛选、开考快照、超时空答、未提交题、未开考用户及禁止写入新增 2 项测试，单独执行 **2 通过、0 失败**，见 [查询工具 JUnit](reports/inspection-results.xml)。并实际查询开发数据库，确认六道题结果可读，查询前后数据库 SHA-256 一致。原 38 项接口测试和 6 条浏览器测试报告保留为首次完整验收结果；新增查询测试没有改动考生接口。

实现按阶段提交到 `feature/python-backend-tests`，原 `main` 不改写，不执行 reset 或远程推送。运行数据、虚拟环境和测试浏览器不进入 Git；建表脚本、种子、锁文件、测试、说明和固定验证证据随源码提交。

完整可见 AI 会话已按时间顺序单独保存，模型宿主元数据、导出截止时间和刷新方法见 [AI 使用说明](ai-usage.md)。本验证记录不能替代完整对话；聊天继续后的新增内容仍需在最终提交前刷新导出。
