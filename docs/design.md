# 设计说明

## 业务与范围

系统沿用 React 考生端，通过 FastAPI 提供认证与考试接口。SQLite 保存账号、试卷、场次、答案和计时状态，使用 Python 标准库 sqlite3 访问，部署无需单独的数据库进程。

手机号只作为账号标识；格式与前端对齐，密码 8～128 位且不能全为空白。注册同时登录。每个用户、每套试卷仅允许一个场次，重复开始返回原场次；进行中继续，完成后不能重考。这个取舍减少重复点击及刷新创建多个场次的问题。

## 数据结构

| 表 | 用途与约束 |
| --- | --- |
| users | 手机号唯一，保存加盐 scrypt 密码哈希 |
| auth_sessions | 用户会话，访问与刷新凭据的 SHA-256 摘要及过期时间 |
| exams | 可用试卷 |
| questions | 题干、类型、选项、标准答案和单题时限 |
| exam_questions | 试卷内题目顺序，同一试卷不重复题目 |
| exam_sessions | 用户场次、状态、当前题、开始与结束时间、剩余作答时间及心跳锚点；用户和试卷组合唯一 |
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
| POST /exam/heartbeat | sessionCode, questionId, questionIndex | 与开始响应一致；只确认计时，不提交、不切题 |
| GET /exam/getExamProgress | 查询参数 sessionCode | totalQuestions, answeredQuestions, questionIndex, status |
| POST /exam/submitAnswer | sessionCode, questionId, questionIndex, answer | nextQuestion, isExamFinished, timedOut；重试可能有 duplicate |
| POST /exam/finishExam | sessionCode | sessionCode, status, isExamFinished |

题目包含 `questionId`（字符串）、`content`、`questionType`（0 单选、1 多选）、`options`、`optionKeys`、`questionIndex`（1 开始）、`totalQuestions`、`timeLimitSeconds`、`remainingSeconds`、`unansweredWarningSeconds`。正确答案和内部快照不会发送给考生。

单选答案为 `"A"`，多选为 `"A,C"`，后端排序规范化；拒绝不存在或重复的选项。分页范围为页码至少 1、每页 1～100。不存在的试卷返回 404；未知或不属于当前用户的场次统一返回 404；结束后提交或非法改写已提交答案返回 409。

## 身份与权限

登录使用 32 字节随机生成的不透明凭据。访问凭据有效期 30 分钟，刷新凭据固定有效期 7 天；刷新只更换访问凭据，不延长刷新凭据总寿命。数据库仅保存凭据摘要，Cookie 为 HttpOnly、SameSite=Lax，生产 HTTPS 应启用 Secure。

退出根据当前凭据撤销当前会话，旧 Cookie 重放也不能登录。多个登录会话互不自动踢出。每个考试接口都从 Cookie 得到用户身份，所有场次查询附加 user_id 条件，不信任请求提供的用户 ID。

浏览器写请求检查 Origin 允许列表，并要求 `application/json`；配合 SameSite Cookie 限制跨站表单请求。允许无 Origin 的命令行及服务端测试请求，但仍要求有效会话。CORS 只允许配置的明确来源携带 Cookie；不默认允许 `Origin: null`。所有业务响应加 `Cache-Control: no-store`。

拥有本机数据库文件权限的开发者可用 `npm run db:results` 查看所有用户提交汇总，或按手机号、场次查看逐题结果。该工具以 SQLite `mode=ro` 和 `query_only` 只读访问数据库，读取事务内保持汇总及详情一致；不新增 HTTP 接口、不修改考生权限，不输出密码或会话凭据。正确答案来自开考时的快照，未提交选择不在数据库中，也不会被工具推断为已作答。

## 倒计时、重试与结束状态

持久化 `question_remaining_seconds`（允许小数）及 `timer_updated_at`；开始当前题时取开考快照的时限。前端在线作答每秒发送一次心跳，由服务器以自身时钟扣除相邻连接确认之间的时间，事务保护并发扣时；返回 `ceil(剩余秒数)` 用于显示，不将取整值写回数据库。题目开始时间仅保留审计用途，不再充当离线截止时间。

连接中断、页面关闭或服务中断造成超过 4 秒的心跳空窗不扣时；恢复接口从数据库保留的预算重新锚定，不扣离开期间的时间、不恢复整题时限。前端遇到 offline 事件、探测失败或超时会停表并显示暂停提示，重连先恢复当前题；只有成功收到服务器剩余时间为 0 才会触发空答切题。已在线耗尽的时间不会因刷新复活。心跳本身永不写答案或切题，旧题心跳返回 409，避免迟到请求扣下一题时间。具体容差、升级与防作弊边界见 [offline-timer.md](offline-timer.md)。

进行中的场次重复提交同一已保存答案时，返回当前下一题，不增加记录或再次推进；尝试改答案返回 409。已超时题的重试按已保存的空答处理。交卷后包括原样重试在内的答题请求全部返回 409。重复交卷返回原完成结果，不改变结束时间。提前交卷不把未提交选择当作已保存答案。

前端增加同步提交锁，避免同一轮事件内重复点击；保留失败时的选择并展示“重试提交”。若服务端已保存但响应丢失，重试通过后端幂等规则恢复。最后一题响应丢失后重试会收到已结束错误，此时刷新可恢复完成页。

## 前端调整及原因

- 使用记录的 examId 和 status 判断续考或已完成，不再直接把第一条记录当作未完成。
- 开始及续考识别已完成响应；完成页刷新后仍保持完成状态，并提供退出登录按钮。
- 页面加载始终通过 `/auth/me` 校验会话，本地缓存不作为身份凭据。
- 密码表单与后端 8～128 位规则对齐。
- 去除固定“约30题、30分钟”文案，说明一次性场次、超时空答及未提交选择不保存。

## 适用范围

当前方案面向本机、小规模使用，未验证高负载或多机部署。公网运行需要 HTTPS、实际域名的 Cookie/Origin 配置、备份和监控；具体功能及验证边界见 [局限性](limitations.md)。
