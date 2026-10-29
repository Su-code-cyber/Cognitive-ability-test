# Question：认知能力测试

笔试任务、验收标准和提交要求见 [笔试题说明](./笔试题说明.md)。

独立前端工程，使用 React 19、TypeScript、Vite 7、Ant Design 5 和 Tailwind CSS 4。

仅保留认知能力测试及其必要的登录认证：

- 手机号加密码登录/注册、退出登录及 Cookie 会话刷新。
- 测试欢迎页、开始测评、单选/多选、题干/材料/图片展示、提交答案及提前交卷。
- 单题倒计时、超时自动提交、未作答提醒、进度恢复及完成页。

AI 面试、录音录像、管理后台、题库编辑、用户管理、报表导出和多项目门户已移除。题目、记录和评分继续由 task4 的 BlueCommonService 提供，本工程不包含后端或本地模拟题库。

## 开发

需要 Node.js 20.19+ 或 22.12+，建议使用当前 LTS 版本。

```bash
cd question
npm ci
cp .env.example .env.local
npm run dev
```

默认访问 `http://localhost:5173`。在 `.env.local` 中配置 `VITE_API_PROXY_TARGET`，默认代理到 `http://localhost:8003`，运行测评前需启动对应后端。

## 路由

| 路径 | 功能 |
| --- | --- |
| `/login` | 登录 / 注册 |
| `/exam` | 认知测试：欢迎 → 作答 → 完成 |
| `/` 及其他路径 | 重定向到 `/exam` |

未登录访问测评会跳转登录页，登录后直接进入 `/exam`。原有测评链接也通过路由回退进入该页面。

## 检查与构建

```bash
npm run lint
npm run build
npm run preview
```

构建产物位于 `dist/`。部署服务器须对 History 路由回退到 `index.html`，并代理 `/api/blue/`。

也可以编译为单个 HTML 文件：

```bash
npm run build:html
```

产物为工程上级目录的 `question.html`，脚本、样式和本地图片全部内嵌，可直接双击打开，页面使用 Hash 路由。此文件仍需现有后端提供登录、题目和作答接口；本地文件默认请求 `http://localhost:8003`（可在构建前通过 `VITE_API_BASE_URL` 或 `VITE_API_PROXY_TARGET` 配置），后端需允许本地文件来源的跨域 Cookie 请求。通过 HTTP 部署时默认使用同源 `/api/blue/`，也可构建前设置 `VITE_API_BASE_URL`。

## Docker

```bash
docker build -t question .
docker run --rm -p 8080:80 \
  -e API_PROXY_TARGET=http://host.docker.internal:8003 \
  question
```

Docker 镜像沿用 task4 的默认 API 网关配置；运行时可用 `API_PROXY_TARGET` 指定实际后端。与前端不同源部署时，可在构建前设置 `VITE_API_BASE_URL`，并由后端配置允许携带 Cookie 的跨域请求。

## 目录

```text
src/
├── api/examApi.ts           # 测评与续考接口
├── components/guest/        # 欢迎、答题、进度、完成界面
├── components/exam/         # 富文本安全展示
├── contexts/AuthContext.tsx # 登录状态
├── hooks/useQuestionCountdown.ts
├── pages/                  # LoginPage、GuestExamPage
├── services/               # 认证与会话刷新
├── constants/apiPaths.ts   # 仅认证及测评接口
├── utils/                  # 请求、存储、题目 HTML 等
└── assets/                 # 原工程测评所需图片
```
