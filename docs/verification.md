# 测试结果

2026-11-01 执行 `node scripts/test-all.mjs`，接口与浏览器测试按顺序完成，无自动重试。环境为 Windows、Python 3.12.14、Node.js 24.15.0、npm 11.12.1；依赖版本保存在锁文件中。

## 运行结果

| 项目 | 结果 | 报告 |
| --- | --- | --- |
| 接口、数据库、服务重启和隔离检查 | 55 通过，0 失败，0 错误，0 跳过 | [JUnit](reports/offline-timer/api-results.xml)、[控制台](reports/offline-timer/api-console.txt) |
| Chromium 浏览器流程 | 9 通过，0 失败，0 错误，0 跳过 | [JUnit](reports/offline-timer/e2e-results.xml)、[控制台](reports/offline-timer/e2e-console.txt) |
| ESLint、TypeScript | 通过 | [静态检查](reports/offline-timer/static-checks.txt) |
| 生产构建 | 通过 | [构建输出](reports/offline-timer/build-console.txt) |

[结果汇总](reports/offline-timer/summary.json) 包含运行时间和统计信息。[HTML 报告](reports/offline-timer/browser-report.zip) 解压后可打开 `index.html`，页面截图包括 [作答](reports/offline-timer/answering.png)、[完成](reports/offline-timer/completed.png) 和 [连接中断](reports/offline-timer/offline-paused.png)。

## 主要验证结果

完整流程覆盖注册、退出、登录、开考、单选和多选提交、正常交卷及完成页恢复。另验证了错误密码、重复注册、未登录访问、跨用户访问拒绝、提前交卷、交卷后禁止修改和响应丢失后的重试。

计时恢复测试中，在线作答 13 秒后中断 600 秒并重建应用，恢复时仍为第 1 题、剩余 47 秒；仅剩 1 秒时短暂离线，恢复后也保留余额。浏览器测试实际离线超过测试单题时限，离线刷新后仍能恢复原题并提交。正常在线超时继续按规则切题。

持久化测试实际重启自建 HTTP 服务，确认账号、会话和进度保留。旧表结构升级测试检查已有答案不变，当前题预算只初始化一次。双线程测试检查重复开考、提交和心跳不会造成重复记录或重复扣时。

隔离检查记录了 965 条浏览器请求，其中 2 次对开发地址的尝试在发送前被拒绝，允许发出的测试地址外请求为 0。详见 [地址审计](reports/offline-timer/network-audit.jsonl) 和 [隔离配置](reports/offline-timer/isolation.json)。

## 发现的问题与修复

| 问题 | 处理方式 | 回归验证 |
| --- | --- | --- |
| 断网刷新后仍消耗单题时限，恢复时直接空答切题 | 持久化在线作答预算，连接中断后保留余额，恢复同题 | 长中断、短中断、离线刷新和后端不可达 |
| 提交失败后选择被清空 | 收到成功响应前保留选择，并提供重试 | 服务端保存后模拟丢失响应，重试只推进一次 |
| 完成记录被当作未完成场次恢复 | 按试卷和场次状态处理继续或完成页 | 正常及提前交卷后刷新 |
| 测试配置可能误用开发数据库、共用缓存或触发文件监听 | 独立源码、数据库、缓存和地址，加入运行身份及清理保护 | 数据库守卫、地址拒绝、活动锁和文件监听隔离 |

早期浏览器测试曾因中文按钮空格、受控多选状态和切题时序导致定位或断言失败，随后改为等待可见页面状态再继续操作，见 [失败记录](reports/browser-initial-failure.md)。迁移测试也曾因夹具缺少题目字段失败，补齐与真实快照一致的数据后通过，见 [原始输出](reports/offline-timer/initial-api-fixture-failure.txt)。

测试环境曾遇到本地通信和文件访问权限限制，在允许所需操作的环境中重跑通过，未改变业务权限。构建保留包体积提示，锁定依赖下的 TestClient 弃用提示未影响本次断言。

## 验证范围

本次结果支持本机功能、数据一致性和小规模多用户使用，不包含容量压测、完整兼容矩阵或生产可用性结论。具体未覆盖项见 [局限性](limitations.md)，页面操作证据见 [手工测试](manual-test-results.md)。
