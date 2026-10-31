# Question：认知能力测试系统

React / TypeScript 前端 + Python / FastAPI 后端 + SQLite 数据库。无需原 task4 服务。选做题为 **加分题 1：AI 辅助测试策略与自动化测试**。

提供手机号加密码注册、登录、退出、Cookie 会话刷新；6 题示例试卷（含单选、多选）；逐题提交、单题倒计时、超时空答、刷新续考、正常及提前交卷。用户、登录会话、试卷、场次和答案均持久化。

- [设计与接口约定](docs/design.md)
- [测试策略、场景和验收方法](docs/testing.md)
- [加分题1逐项交付与活动用户隔离说明](docs/bonus1.md)
- [实际验证记录](docs/verification.md)
- [AI 使用说明与完整记录交付提醒](docs/ai-usage.md)
- [原始笔试要求](笔试题说明.md)

## 环境

- Python 3.12（本次实测 3.12.14）。
- Node.js 20.19+ 或 22.12+；本次实测 Node 24.15.0、npm 11.12.1。
- 普通本地部署即可，不需要外部数据库、短信服务或云服务。

下列命令在项目根目录执行。Windows 示例使用 PowerShell，不需要激活虚拟环境。Python 和 npm 的依赖、缓存、临时文件及浏览器全部放在项目内。

## 首次安装（Windows PowerShell）

```powershell
cd D:\Blue\intern-written-test
New-Item -ItemType Directory -Force .runtime/tmp | Out-Null
$env:TEMP = Join-Path (Get-Location) '.runtime\tmp'
$env:TMP = $env:TEMP
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:npm_config_cache = Join-Path (Get-Location) '.runtime\npm-cache'
python -m venv .venv
.\.venv\Scripts\python.exe -B -m pip install --disable-pip-version-check --no-cache-dir -r backend/requirements.lock.txt
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run db:init
```

如果 `python` 提示不可用，需要一个已有 Python 3.12 解释器。当前开发机已建好 `.venv`，可直接使用。创建虚拟环境时使用的宿主解释器是 `C:\Users\32533\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`，只读取该解释器，不安装全局依赖。

Linux/macOS 可使用 `python3.12 -m venv .venv`，安装时将解释器路径替换为 `.venv/bin/python`；Node 启动和测试脚本会自动选择平台对应路径。临时目录可用 `TMPDIR="$PWD/.runtime/tmp"`。本次仅在 Windows 上实测。

## 启动

终端一：

```powershell
npm run dev:api
```

终端二：

```powershell
npm run dev
```

- 页面：http://localhost:5173
- 健康检查：http://localhost:8003/health
- 可交互 API 文档：http://localhost:8003/docs

模拟多个用户时，只需要一份后端和一份前端服务。用户 A 用普通浏览器窗口，用户 B 用同一浏览器的隐私窗口，或使用另一个浏览器；两人都访问 `http://localhost:5173`，分别注册、登录不同账号。不要为每个用户再运行一次 `npm run dev`。同一浏览器的普通标签页共享 Cookie，不能当作独立用户；同一浏览器的多个隐私窗口也可能共享隐私会话。

若看到 `Port 5173 is in use, trying another one...`，说明又启动了一份前端服务，Vite 自动尝试 5174，并不代表新增了一位用户。停止多开的那份前端，保留原来的 5173 服务即可。不同端口也不能可靠隔离登录 Cookie，而且默认后端来源允许列表不包含 5174。

Vite 的 `h + enter`、`o + enter` 是在正在运行 Vite 的终端内输入单个字母后按回车，分别显示帮助、打开默认浏览器。它们不是考试功能；若终端没有响应，直接在浏览器地址栏输入上述页面地址即可，无需依赖快捷键。

前端 `.env.local` 默认 `VITE_API_PROXY_TARGET=http://localhost:8003`；修改后需重启前端。后端启动时也会自动建表和初始化示例卷，重复启动不会清空数据或重复插入题目。

没有预置账号。使用以 `1` 开头、第二位为 `3～9`、总长 11 位的测试号码自行注册，例如 `13800002001`，密码为 8～128 位。`12345612345` 虽然有 11 位，但第二位为 `2`，因此不能通过格式校验。手机号只作为账号标识，不验证真实归属、不发送短信。文档及测试中的号码和密码都是测试数据，不要用于外部服务。

页面保留原工程的蓝色光标品牌和视觉设计，外观相同不代表连接原公司的账号库。默认开发配置的前端将请求代理到本机 `localhost:8003`，由本项目 FastAPI 服务读写本地 SQLite 数据库。

每个账号对每套试卷只有一次场次：进行中继续，完成后显示完成页。示例卷默认每题 60 秒。刷新保留已提交答案和当前题剩余时间，未提交选择不保存；服务端截止后提交记为空答。

## 配置和数据库

后端从进程环境变量读取配置，`backend/.env.example` 是说明文件，**不会自动加载**。例如：

```powershell
$env:EXAM_DATABASE_PATH = Join-Path (Get-Location) 'backend/data/exam.sqlite3'
$env:COOKIE_SECURE = 'false'
$env:ALLOWED_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8003,http://127.0.0.1:8003'
npm run dev:api
```

默认数据库为 `backend/data/exam.sqlite3`，其 `-wal`、`-shm` 附属文件也在同目录。不要将数据库或 `.venv` 提交到 Git；备份时先停止服务，再复制该目录。建表迁移位于 `backend/migrations/`，示例数据位于 `backend/seed.json`。

`QUESTION_TIME_LIMIT_SECONDS` 仅作用于首次初始化示例题，默认 60；不会重写已存在的题目和场次快照。测试使用独立数据库和较短时限，不修改开发数据库。

## 查看各用户的提交结果

在项目根目录另开终端执行，不需要停止正在运行的前后端：

```powershell
npm run db:results
npm run db:results -- --phone 13800002001
npm run db:results -- --all
npm run --silent db:results -- --all --json
```

默认列出所有用户及场次汇总，包括未开始考试的账号。`--phone` 查看指定用户每道题的题干、所选选项及内容、标准答案、是否正确、是否超时、提交时间；`--all` 查看所有用户逐题详情。也可用 `--session 场次编号` 精确查询，或添加 `--json` 输出结构化结果。

命令通过 SQLite 的只读模式查询，与后端使用相同的 `EXAM_DATABASE_PATH` 配置，默认数据库为 `backend/data/exam.sqlite3`。显示的正确答案来自开考时的题目快照；未提交题显示“未提交”，超时题显示“超时空答”，不能据此推断用户曾在页面选择但未提交的选项。时间为北京时间（UTC+08:00）。

这是拥有本机数据库访问权限的开发者查询工具，不是考生页面或公开接口，不会让考生查看其他人的答案，也不输出密码哈希、登录 Cookie 或会话凭据。

## 检查与自动化测试

依赖和浏览器首次安装应在开始服务用户之前完成；测试期间不要重装依赖、修改业务源码或重启用户服务。依赖已准备好后，可在用户作答期间单独运行隔离测试：

```powershell
node scripts/test-all.mjs
```

也可以单独执行 API 或浏览器测试；首次准备测试浏览器时使用安装命令：

```powershell
npm run test:api
npm run test:e2e:install
npm run test:e2e
```

`test:api` 使用真实 SQLite 文件验证接口和数据库不变量，只停止、重启测试自己创建的 HTTP 进程。`test:e2e` 在动态回环端口启动独立前后端，以无界面 Chromium 操作真实页面，明确排除开发端口 5173/8003，不复用已有服务。

每轮的源码快照、数据库、浏览器资料、缓存和报告都在 `.runtime/node_modules/test-runs/<运行ID>/`。`node_modules` 这一层用于避开开发 Vite 的文件监听，避免测试创建的配置和 HTML 导致正在考试的页面热更新。数据库和浏览器请求还受本轮目录、地址及服务身份守卫限制，配置缺失时直接失败，不回退到开发库。

最新运行位置见 `.runtime/latest-api.json`、`.runtime/latest-e2e.json`；完整验收汇总见 `.runtime/latest-validation.json`。每轮 `reports/` 包含 JUnit、日志及浏览器 HTML 报告。成功运行后执行 `.\.venv\Scripts\python.exe -B scripts/archive-test-reports.py`，将不含数据库或 Cookie 的交付证据保存到 `docs/reports/bonus1/`。

`npm run test:clean -- --run 运行ID` 只清理指定的已结束自有测试，不带参数时清理所有已结束自有测试。活动测试、未知目录、开发数据、浏览器安装和依赖均保留；测试运行时清理会被互斥锁拒绝。详见 [加分题1说明](docs/bonus1.md)。

部署前还可运行 `npm run lint`、`npm run build` 做前端静态检查和构建；这些不属于活动用户期间的隔离业务测试。

## 构建与部署

`npm run build` 生成 `dist/`。在部署服务器上提供静态目录，History 路由回退到 `index.html`，并将 `/api/blue/` 代理到后端。`nginx.conf` 是参考模板，需要将 `${API_PROXY_TARGET}` 替换为实际后端地址。`npm run preview` 只预览静态产物，不提供 API 代理，不能单独用来验收完整考试。

本仓库没有 Dockerfile，不提供未经验证的 Docker 启动命令。公网部署还需配置 HTTPS、`COOKIE_SECURE=true` 和实际 `ALLOWED_ORIGINS`。当前默认配置用于本机开发。

原单 HTML 构建保留为 `npm run build:html`，产物改为项目内 `dist/question.html`。默认后端不允许 `file://` 的 `Origin: null` Cookie 请求，请通过有 API 代理的 HTTP 服务访问，不将双击 HTML 作为验收方式。

## 目录

```text
backend/
  main.py                 # HTTP 接口、会话和权限
  exams.py                # 考试状态变更与超时规则
  db.py                   # SQLite 连接、迁移和初始化
  migrations/             # 版本化建表脚本
  seed.json               # 六题示例卷
  tests/                  # 接口、隔离、并发、持久化测试
src/                      # 现有 React 前端及必要对接修改
tests/e2e/                # 真实浏览器完整流程
scripts/                  # 启动、测试、构建和清理命令
docs/                     # 设计、测试、验收和 AI 使用说明
```

## 常见问题

- **“无法连接后端”**：确认后端终端没有报错，`/health` 可访问，前端代理地址正确。
- **Cookie 不生效**：本机 HTTP 使用 `COOKIE_SECURE=false`；不要在一次操作中混用 `localhost` 和 `127.0.0.1`。
- **注册失败**：检查手机号格式、重复注册和密码长度。密码错误返回统一提示，不暴露账号是否存在。
- **已交卷后无法重考**：这是一次性场次规则。验收新流程时使用另一个测试账号。
- **测试卡在事件循环或无法启动浏览器**：受限环境需允许本机回环通信、子进程启动及浏览器执行；应用不应为绕过限制而降级权限检查。

## Git 与交付

功能开发位于 `feature/python-backend-tests` 分支。代码、迁移和测试分阶段提交，运行数据和依赖不入库。尚未推送远程。

提交笔试前还须从使用过的 AI 工具导出完整对话及可导出的工具记录，放入交付包或提供评审可访问的链接。`docs/ai-usage.md` 不是完整对话的替代物。
