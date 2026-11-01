# 提交前核查清单

本目录 `D:\Blue\final-submission` 是独立的本地 Git 仓库，保留原项目开发历史，当前分支为 `submission/final`。它用于最终自查和后续发布，不包含正在运行的数据库或依赖，也没有改动原项目服务。阅读顺序为：本页 → [交付说明](DELIVERY.md) → [部署 README](README.md) → [验收对应表](docs/acceptance-matrix.md)。

## 已备齐的材料

- [x] 前端、FastAPI 后端、SQLite 迁移 001/002、六题示例种子、前后端依赖锁和样例配置。
- [x] 基本题业务理解、接口、权限、事务、持久化、断网计时取舍和已知边界。
- [x] 加分题 1 的测试策略、可执行自动化、准备/执行/归档/清理方法。
- [x] 55 项 API/数据库/隔离及 9 项浏览器测试的实际成功记录，相关失败尝试、截图、HTML 报告和哈希。
- [x] 7 份用户原始手动录屏、逐项观察与字节/时长/校验值清单。
- [x] 用户导出的 [AI对话记录.md](docs/ai-records/user-export/AI对话记录.md)，从工作区根目录原样复制，保留原字节。
- [x] 补充的完整可见工具调用/输出和后续对话记录，以及 AI 名称、用途、可获取模型与版本说明。
- [x] 原题 [Markdown](笔试题说明.md) 和 [PDF](笔试题说明.pdf)，方便对照要求。
- [x] 本地材料核查脚本与 [实际核查结果](docs/submission-audit.json)。

上述材料的详细位置见 [DELIVERY.md](DELIVERY.md)。实际用户数据库、备份、Cookie、浏览器个人资料、`.env.local`、`node_modules` 和 `.venv` 不提交；GitHub 页面有时不会直接预览 MP4/HTML 报告，评审可在克隆后本地打开。录屏是普通 Git 文件，不依赖另行下载的 LFS 对象。

## 仍需完成的必要交付动作

- [ ] **最终成果的远程仓库链接及正确分支。** 本轮尚未发布。现有来源地址 `https://github.com/Susim520/intern-written-test` 的只读查询仅发现旧 `main=6fcf17d6393526b9a1e036aa42eb53fc2f11f3ad`，未发现最终成果分支。因此该旧链接不能直接作为最终已提交证明。
- [ ] **评审访问权限。** 确定目标仓库后，需实际确认评审能读取；公开仓库可用未登录环境检查，私有仓库按招聘方指定方式授权。候选人在自己的已登录浏览器能看见，并不等于评审可以看见。

本地必需文件未发现缺项；上述两项是尚未完成的远程交付条件，不是缺少后端功能或必须购买云服务器。不会因为选择 Git 方式要求额外准备源码压缩包。

如果另有本项目使用过的 AI 工具或聊天未在目前记录中，请一并补齐。当前用户导出覆盖到上一轮最终材料整理；本轮后续内容由分段工具记录补充至 manifest 的截止时间。正式提交前若继续产生相关对话，再刷新记录并提交；未来回复不能提前存在于当前快照中。

## 确定目标仓库后的发布方式

本仓库的 `upstream` 仅标记原来源，其 push URL 在本地禁用，避免误把待核查材料写入来源地址。尚未配置最终 `origin`，也没有在本轮使用任何账号或令牌执行推送。确认目标仓库是你可写且供评审使用的仓库后，才进行以下操作：

```powershell
cd D:\Blue\final-submission
git status
git remote add origin <替换为实际目标仓库URL>
git push -u origin submission/final
git rev-parse HEAD
```

尖括号内容是待填写项，不能原样执行。如果决定使用现有 Susim520 仓库，也需先确认写入权限与评审访问要求，再将其配置为 `origin`；本清单不据仓库名称推断所有权。不要使用强制推送覆盖其他分支。

提交给评审的链接应指向实际成果分支，如“目标仓库的 `/tree/submission/final` 页面”，并附上 `git rev-parse HEAD` 返回的最终提交号。仅提交仍指向旧 main 的仓库首页可能使评审看不到成果；如果仓库默认分支已经设为成果分支，则可提交其首页。

发布后从新目录克隆该分支，确认 `DELIVERY.md`、用户 AI 导出、7 个 MP4 和最新报告均在，再按 README 启动。此步骤尚未执行，不能把本地文件核查写成远程可访问性已通过。

## 本地重复核查与补充记录

核查材料只需要 Python 3.12 和 Git，不启动考试服务、不访问活动数据库、不安装依赖。源码一致性检查会读取历史测试提交，请使用正常完整克隆，浅克隆需先补齐相应历史：

```powershell
python -B scripts/audit-submission.py
```

本机若系统 `python` 不可用，可只读复用原目录已有解释器：

```powershell
& '..\intern-written-test\.venv\Scripts\python.exe' -B scripts/audit-submission.py
```

需要更新本机当前聊天的工具记录时，可指定同一已有解释器；它只读取本机当前聊天源文件，输出仍限定在本提交目录：

```powershell
./scripts/export-current-chat.ps1 -PythonExecutable '..\intern-written-test\.venv\Scripts\python.exe'
& '..\intern-written-test\.venv\Scripts\python.exe' -B scripts/audit-submission.py --write-report
git add docs/ai-records docs/submission-audit.json
git commit -m "docs: refresh visible AI records before submission"
```

上述记录刷新仅适用于有原始聊天文件的本机；评审不需要这些宿主文件。用户原始导出另行保留，不由工具刷新覆盖。实际发布状态应在操作完成后更新清单，不能预先勾选。
