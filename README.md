# 认知能力测试系统

基于现有 React / TypeScript 前端，使用 Python、FastAPI 和 SQLite 实现注册、登录、限时答题、续考和交卷。示例试卷共 6 题，包含单选和多选。账号、场次、已提交答案和剩余作答时间保存到数据库。

选做加分题 1：AI 辅助测试策略与自动化测试。已完成 55 项接口、数据库及隔离测试和 9 项浏览器测试，全部通过。

## 文档

| 内容 | 位置 |
| --- | --- |
| 项目范围与交付内容 | [交付说明](DELIVERY.md) |
| 数据结构、接口与权限 | [设计说明](docs/design.md) |
| 测试策略与运行方法 | [测试说明](docs/testing.md) |
| 加分题实现 | [自动化测试](docs/bonus1.md) |
| 实际测试结果 | [验证报告](docs/verification.md)、[手工测试](docs/manual-test-results.md) |
| 计时与续考 | [计时规则](docs/offline-timer.md) |
| 已知问题与未覆盖范围 | [局限性](docs/limitations.md) |
| AI 工具及对话记录 | [AI 使用说明](docs/ai-usage.md) |

## 环境与安装

需要 Python 3.12、Node.js 20.x（20.19 及以上）或 22.12 及以上版本。本次使用 Windows、Python 3.12.14、Node.js 24.15.0 和 npm 11.12.1 验证。

在仓库根目录执行以下 PowerShell 命令：

```powershell
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

若 `python` 命令不可用，替换为已安装的 Python 3.12 解释器路径。Linux/macOS 可使用 `python3.12` 创建虚拟环境，并将解释器路径改为 `.venv/bin/python`；这两个平台尚未实测。

## 启动与使用

在两个终端分别执行：

```powershell
npm run dev:api
```

```powershell
npm run dev
```

浏览器访问 http://localhost:5173。后端健康检查为 http://localhost:8003/health，接口文档为 http://localhost:8003/docs。

系统没有预置账号。使用有效格式的 11 位手机号和 8～128 位密码注册，例如测试号码 `13800002001`。手机号只作为账号标识，不发送短信或验证号码归属。

每个账号每套试卷只能参加一次。进行中的场次可以继续，交卷后不能重新作答。默认每题 60 秒，联网作答时计时；刷新或重新登录后从已保存进度和剩余时间继续。连接中断后暂停计时，在线超时记为空答并进入下一题。当前题未提交的选择不会保存为草稿。

测试两个用户时，共用一份前端和一份后端，分别使用独立浏览器或独立浏览器配置登录不同账号。普通标签页共享 Cookie，不能作为两个独立用户。无需为第二位用户再启动一份前端。

## 配置与数据库

前端 `.env.local` 默认将 API 请求代理至本机 8003 端口。后端读取进程环境变量，`backend/.env.example` 仅作为配置示例，不会自动加载。

| 环境变量 | 默认值与用途 |
| --- | --- |
| EXAM_DATABASE_PATH | `backend/data/exam.sqlite3`，数据库路径 |
| COOKIE_SECURE | `false`，HTTPS 部署时设为 `true` |
| ALLOWED_ORIGINS | 本机 5173/8003 地址，部署时替换为实际来源 |
| QUESTION_TIME_LIMIT_SECONDS | `60`，仅影响首次初始化的示例题 |

例如指定数据库后启动：

```powershell
$env:EXAM_DATABASE_PATH = Join-Path (Get-Location) 'backend/data/exam.sqlite3'
$env:COOKIE_SECURE = 'false'
npm run dev:api
```

启动时自动建表和初始化示例卷，重复执行不会清空数据。迁移位于 `backend/migrations/`，题目种子位于 `backend/seed.json`。已开始场次使用题目快照，后续题库变更不会影响其内容和时限。

备份数据库前应停止后端并复制数据库目录，包括可能存在的 WAL/SHM 文件。已有数据的计时结构升级见 [计时规则](docs/offline-timer.md#数据库升级)。

## 查看作答结果

```powershell
npm run db:results
npm run db:results -- --phone 13800002001
npm run db:results -- --all
npm run --silent db:results -- --all --json
```

默认显示账号和场次汇总；按手机号或添加 `--all` 可查看逐题题干、保存的选项、正确答案、超时状态和提交时间。查询采用 SQLite 只读模式，不修改考试数据。它是本机管理命令，未向考生开放结果查询接口。

## 自动化测试

首次安装测试浏览器，然后运行完整测试：

```powershell
npm run test:e2e:install
node scripts/test-all.mjs
```

也可分别运行 `npm run test:api` 和 `npm run test:e2e`。测试会创建独立数据库、源码快照、缓存、服务端口和浏览器会话，不使用现有考试服务。依赖安装、业务源码修改和服务重启应安排在无用户作答时进行。

执行结果见终端输出及 `.runtime/latest-validation.json`。报告归档和测试数据清理见 [测试说明](docs/testing.md)。

## 构建与部署

```powershell
npm run lint
npm run build
```

构建产物位于 `dist/`。部署时需为前端配置 History 路由回退，并将 `/api/blue/` 代理至后端。`nginx.conf` 提供参考配置，`${API_PROXY_TARGET}` 应替换为实际后端地址。`npm run preview` 仅用于静态预览，不提供 API 代理。

本机部署即可完成验收。公网运行还需配置 HTTPS、Cookie 和允许来源，并评估负载、备份与监控。

## 常见问题

- **无法连接后端**：检查 8003 服务和前端代理地址。
- **5173 已被占用**：确认是否已有前端运行，直接使用现有地址。默认后端不允许 5174 来源。
- **登录 Cookie 不生效**：本机 HTTP 使用 `COOKIE_SECURE=false`，同一次操作中保持使用同一主机名。
- **注册失败**：检查手机号格式、是否重复注册，以及密码长度。
- **已交卷后无法重考**：属于一次性场次规则，新的验收流程应使用新账号。
