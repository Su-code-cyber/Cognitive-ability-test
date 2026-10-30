# 设计说明

## 业务与范围

保留考生端现有 React 页面，实现其依赖的 5 个认证接口和 7 个考试接口。后端为 FastAPI 单应用，数据库使用 Python 标准库 sqlite3，部署无需额外数据库进程。加分题选择自动化测试。不实现管理员后台、短信验证、题库编辑器、复杂评分模型、摄像头或防作弊监控。

手机号只作为账号标识；格式与前端对齐，密码 8～128 位且不能全为空白。注册同时登录。每个用户、每套试卷仅允许一个场次，重复开始返回原场次；进行中继续，完成后不能重考。这个取舍减少重复点击及刷新创建多个场次的问题。

## 数据结构

| 表 | 用途与约束 |
| --- | --- |
| users | 手机号唯一，保存加盐 scrypt 密码哈希 |
| auth_sessions | 用户会话，访问与刷新凭据的 SHA-256 摘要及过期时间 |
| exams | 可用试卷 |
| questions | 题干、类型、选项、标准答案和单题时限 |
| exam_questions | 试卷内题目顺序，同一试卷不重复题目 |
| exam_sessions | 用户场次、状态、当前题、开始与结束时间；用户和试卷组合唯一 |
| session_questions | 开考时复制题目快照，后续题库变化不影响已开始考试 |
| answers | 每个场次每个题号至多一条答案，记录超时和客观题判定 |
| schema_migrations | 已执行迁移版本 |

SQLite 启用外键、WAL 和 15 秒锁等待。一次提交的“检查场次 → 写答案 → 更新进度/结束”在 `BEGIN IMMEDIATE` 事务内完成，主键防止重复记录；重复开始也在写事务内串行处理。初始化是可重复运行的，不清空用户数据。示例题共 6 道，包含单选和多选。

## 接口约定

统一前缀 `/api/blue/bluecommonservice`。成功使用 HTTP 200 和 `{code:200,message:"成功",data:...}`；错误使用对应 HTTP 状态和同结构错误体。验证失败不会回显原始密码。

| 方法与路径（省略前缀） | 请求 | 响应 data 关键字段 |
| --- | --- | --- |
| POST /auth/register | phone, password | userInfo.phone；同时设置 Cookie |
| POST /auth/login | phone, password | userInfo.phone；同时设置 Cookie |
| POST /auth/logout | 空 JSON 或带 JSON Content-Type 的空体 | 空对象；撤销当前会话并清 Cookie |
| GET /auth/me | Cookie | phone |
| POST /auth/refresh | 刷新 Cookie | 空对象；更换访问 Cookie |
| POST /exam/getAvailableExams | curPage, pageSize, params | list[{examId,title}], total |
| POST /exam/startExam | examId | sessionCode, status, isExamFinished, currentQuestion, totalQuestions |
| POST /exam/getMyExamRecords | curPage, pageSize, params | list[{sessionCode,examId,status,...}], total |
| POST /exam/resumeExam | sessionCode | 与开始响应一致 |
| GET /exam/getExamProgress | 查询参数 sessionCode | totalQuestions, answeredQuestions, questionIndex, status |
| POST /exam/submitAnswer | sessionCode, questionId, questionIndex, answer | nextQuestion, isExamFinished, timedOut；重试可能有 duplicate |
| POST /exam/finishExam | sessionCode | sessionCode, status, isExamFinished |

题目包含 `questionId`（字符串）、`content`、`questionType`（0 单选、1 多选）、`options`、`optionKeys`、`questionIndex`（1 开始）、`totalQuestions`、`timeLimitSeconds`、`remainingSeconds`、`unansweredWarningSeconds`。正确答案和内部快照不会发送给考生。

单选答案为 `"A"`，多选为 `"A,C"`，后端排序规范化；拒绝不存在或重复的选项。分页范围为页码至少 1、每页 1～100。不存在的试卷返回 404；未知或不属于当前用户的场次统一返回 404；结束后提交或非法改写已提交答案返回 409。

## 身份与权限

使用 32 字节随机、不透明凭据，不要求 JWT。访问凭据有效期 30 分钟，刷新凭据固定有效期 7 天；刷新只更换访问凭据，不延长刷新凭据总寿命。数据库仅保存凭据摘要，Cookie 为 HttpOnly、SameSite=Lax，生产 HTTPS 应启用 Secure。

退出根据当前凭据撤销当前会话，旧 Cookie 重放也不能登录。多个登录会话互不自动踢出。每个考试接口都从 Cookie 得到用户身份，所有场次查询附加 user_id 条件，不信任请求提供的用户 ID。

浏览器写请求检查 Origin 允许列表，并要求 `application/json`；配合 SameSite Cookie 限制跨站表单请求。允许无 Origin 的命令行及服务端测试请求，但仍要求有效会话。CORS 只允许配置的明确来源携带 Cookie；不默认允许 `Origin: null`。所有业务响应加 `Cache-Control: no-store`。

## 倒计时、重试与结束状态

开始当前题时持久化 `question_started_at`，剩余秒数为 `ceil(开始时间+时限-服务器当前时间)`，最低为 0。刷新、续考、重复开始均不重置计时。到截止时刻或之后收到的提交，忽略本地选择，记空答案和 timed_out=1。这避免信任浏览器声称的选择时间，但网络迟到可能导致原本及时选择的答案记为空答；本版本不提供网络宽限或草稿保存。

超时推进由页面提交驱动：页面关闭后当前题仍计时，重开时返回 0 并立即提交空答；下一题从实际推进时开始计时，不在离线期间逐题累积超时。服务器无需后台计时任务。

进行中的场次重复提交同一已保存答案时，返回当前下一题，不增加记录或再次推进；尝试改答案返回 409。已超时题的重试按已保存的空答处理。交卷后包括原样重试在内的答题请求全部返回 409。重复交卷返回原完成结果，不改变结束时间。提前交卷不把未提交选择当作已保存答案。

前端增加同步提交锁，避免同一轮事件内重复点击；保留失败时的选择并展示“重试提交”。若服务端已保存但响应丢失，重试通过后端幂等规则恢复。最后一题响应丢失后重试会收到已结束错误，此时刷新可恢复完成页。

## 前端调整及原因

- 使用记录的 examId 和 status 判断续考或已完成，不再直接把第一条记录当作未完成。
- 开始及续考识别已完成响应；完成页刷新后仍保持完成状态，并提供退出登录按钮。
- 页面加载始终通过 `/auth/me` 校验会话，本地缓存不作为身份凭据。
- 密码表单与后端 8～128 位规则对齐。
- 去除固定“约30题、30分钟”文案，说明一次性场次、超时空答及未提交选择不保存。
- 单 HTML 产物改为项目内 `dist/question.html`，避免构建写入项目上级目录。

## 已知边界

面向本机单应用、小规模验收，未验证高并发容量和多机部署；未做账户找回、短信归属验证、登录限流、会话数量清理、监控和完整生产运维。持久化和用户隔离不能代替完整防作弊。仅实现简单客观题正确性记录，没有成绩报表或复杂评分。数据库中的标准答案对拥有数据库文件读取权的人可见。

正式部署还需要 HTTPS、实际域名的 Cookie/Origin 配置、备份恢复和容量评估。Windows 已实测，其他操作系统未实测。
