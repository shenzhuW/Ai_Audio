# Phase 03 远程验收核查与证据索引

日期：2026-10-23。受检代码提交：[`50bdda5bce8e83c821ab56a20a243f6aba778d7f`](https://github.com/shenzhuW/Ai_Audio/commit/50bdda5bce8e83c821ab56a20a243f6aba778d7f)。本次只补充测试脚本、截图、日志及索引，没有修改应用功能、数据库模型或 Phase 00–02，没有进入 Phase 04。

## Git 与公开提交检查

- 开始时本地 HEAD 为上述提交，工作区干净。`git fetch origin main` 后远程为 `8e747526bba86b508e4916107b6aebcf2eef337a`；`git rev-list --left-right --count origin/main...HEAD` 为 `0 1`，没有远程分叉。GitHub 连接工具独立确认 main 指向同一 SHA。
- 对受检提交的 **109 个变更文件逐个读取 Git Blob**：[文件清单、Blob ID、大小及扫描结果](evidence/phase03/remote/code-commit-audit.json)。密钥、凭据、会话、私有路径、SQLite/PG dump 文件头和大文件检查零发现，最大文件 411592 bytes。全仓工作文件也重新执行 `node scripts/audit-staged.cjs --worktree`：[扫描结果](evidence/phase03/remote/worktree-audit.json)。
- 新媒体仅为仓库内自制合成 PDF/文本/蓝色图片、真实浏览器截图和自制视频的预览帧；已核对来源、夹具配方与截图内容。研究快照仅含隔离验收项目，非真实用户资料；未知许可的用户 URL 使用 `example.invalid`，未访问/验证。
- 私有 `.data`、上传原件目录、会话密钥、测试数据库、PostgreSQL 凭据和构建/依赖缓存没有进入提交；没有删除或迁移用户数据。环境文件只含示例配置，没有真实凭据。
- 保留已审代码提交 SHA；材料作为独立子提交，使用 `git push origin main` 正常快进推送，禁止 force、amend 或重写历史。最终推送 SHA 与远程验证结果以交付回复及 GitHub main 为准。

## 八项重点结论

| 核查项 | 实际结论与证据 |
|---|---|
| 一个 Claim 关联两个 Source | PASS。两库实际保存同一 Claim 的 PDF 支持引用和文本反驳引用；本轮对保存快照重新断言两个不同 Source、两个 matched 证据，状态为 conflicting。[结构化复核结果](evidence/phase03/remote/verification.json) 中保留具体 ID。 |
| 冲突/证据不足不自动变成已核实 | PASS。原集成实际验证：verified 写入 400、无证据 supported 422、Mock 支持升级 422；本轮复核没有 Claim 为 verified。引用 matched 只说明原文能定位，不能证明现实事实正确。 |
| 修改修订不再沿用旧 Claim ID | PASS。原两库真实浏览器在批准 v2 后 fork v3 并添加引用，HTTP 201；旧 ID 会被后端 404 拒绝。本轮断言当前每条证据的 Claim 都属于当前 revision；[两库原结果](evidence/phase03/postgresql/results.json) 包含浏览器 fork 的具体前后 revision ID。 |
| 批准修订不可直接修改 | PASS。原 HTTP/数据库测试覆盖四实体保护，批准后修改拒绝；fork 后原快照不变；浏览器批准/历史只读。[PG 结果](evidence/phase03/postgresql/results.json)、[只读截图](evidence/phase03/postgresql/03-approved.png)。本轮未绕过保护修改批准数据。 |
| PDF 文字与页码定位 | PASS。本轮从仓库真实 `source-a.pdf` 再次通过本地 PDF.js 提取 **1 页、page=1、Capacity is 32 units.**，原件 SHA 与保存来源一致，逐页文字与两库索引精确相同。原测试引用第 1 页成功、第 2 页拒绝 422；不是手写 Mock 提取文字。[复核结果](evidence/phase03/remote/verification.json)。 |
| 视频帧/时间戳与原视频一致 | PASS。本轮独立从 `apps/render/public/background.mp4` 的 **0 / 3333 / 6666ms** 用同规格 FFmpeg 重抽 JPEG，与两库保存帧及 Blob SHA256 **逐个完全相同**，原视频 SHA 与 Source 相同。三段为 0–3333 / 3333–6666 / 6666–10000ms；真实 Chrome 再次播放 10 秒视频到 3.6 秒以上，无错误。该验证不代表场景语义识别、ASR 或正式剪辑。[帧比较](evidence/phase03/remote/verification.json)、[PG 播放](evidence/phase03/remote/postgresql/browser-media.json)。 |
| 图片能力边界 | 真实保存/展示原图和 **640×360** 元数据；本轮 Chrome 解码尺寸也为 640×360，页面显示真实图片内容索引。**未实现视觉语义理解/OCR**；蓝色测试图不是 AI 识别结果，Mock 说明始终标 Mock。[真实图片索引截图](evidence/phase03/remote/postgresql/03-image-index.png)。 |
| Provider 未配置不伪造搜索 | PASS。原两库真实未配置搜索任务返回 PROVIDER_NOT_CONFIGURED，无文章结果；显式 Mock 搜索 candidates=[] 且 notes 标 Mock。本轮复核对应 Job 记录。没有真实外网检索、文章取证或自动事实核验通过的声明。[复核结果](evidence/phase03/remote/verification.json)、[Mock/失败截图](evidence/phase03/postgresql/03-mock-and-failure.png)。 |

## 测试来源与实际命令

**受检提交原始集成记录**：SQLite 15/15 组、真实 PostgreSQL 16/16 组 PASS；每库包含旧 HTTP 15 项及工作流 8 组。PostgreSQL 17.6 迁移重复执行、四实体保护、Schema 零漂移、应用重启恢复均有原始证据。本次没有覆盖或冒充重新执行这些完整集成运行。

**本轮实际重新执行**：22/22 单元、Web/Render TypeScript、生产构建；合成快照的证据关系/修订 ID 校验、真实 PDF 重提取和独立源视频抽帧比较；在原隔离 SQLite 与真实 PostgreSQL 测试库上进行只读 Chrome 页面、视频播放和图片解码验收。`browser-media.cjs --remote` 将新材料写入 remote 子目录，保留原集成结果。

```powershell
git fetch origin main
git rev-list --left-right --count origin/main...HEAD
node scripts/audit-staged.cjs --worktree
node tests/research/audit-code-commit.cjs
pnpm test
pnpm typecheck
pnpm render:typecheck
pnpm build
pnpm db:local start
node tests/research/verify-remote-materials.cjs
$env:STUDIO_UI_BROWSER_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
node tests/research/browser-media.cjs --remote
# 仅在本轮启动专用测试集群时停止，保留数据库/原件
pnpm db:local stop
git diff --cached --check
node scripts/audit-staged.cjs
git push origin main
```

`pnpm` / PowerShell 7 的本机路径、FFmpeg/FFprobe 配置仍按 [启动说明](LOCAL_DEVELOPMENT.md)；独立媒体复核仅写入 `.cache/phase03-remote-*` 及公开合成证据目录，不写入用户数据库。初次重定向因 remote 目录尚不存在未执行验证，创建目录后完整执行并通过；没有把该次未执行计为通过。

应用生产构建复跑退出 0；本次启动的专用 PostgreSQL 集群已停止，数据库和原件保留：[停止记录](evidence/phase03/remote/local-services.log)。新增/修改的可执行文件仅为 `tests/research/audit-code-commit.cjs`、`verify-remote-materials.cjs` 和 `browser-media.cjs` 的远程证据模式；应用、Worker、Schema 和原迁移均未修改。

## 远程验收证据索引

以下均为仓库相对链接，推送后可直接在 GitHub 打开。

| 材料 | 路径 |
|---|---|
| 完整交付、变更及风险 | [PHASE_03_DELIVERY.md](PHASE_03_DELIVERY.md) |
| SQLite 原集成结果 / HTTP / 工作流 | [结果](evidence/phase03/sqlite/results.json) · [HTTP](evidence/phase03/sqlite/http-results.json) · [工作流](evidence/phase03/sqlite/workflow-http-sqlite.json) |
| PostgreSQL 原集成结果 / 迁移 / Schema | [结果](evidence/phase03/postgresql/results.json) · [迁移](evidence/phase03/postgresql/migrations.log) · [零漂移](evidence/phase03/postgresql/schema-drift.log) |
| 22 项单元 / 类型 / 构建原日志 | [单元](evidence/phase03/unit-tests.log) · [Web](evidence/phase03/typecheck.log) · [Render](evidence/phase03/render-typecheck.log) · [构建](evidence/phase03/build.log) |
| 本轮复跑日志 | [单元](evidence/phase03/remote/unit-tests.log) · [Web](evidence/phase03/remote/typecheck.log) · [Render](evidence/phase03/remote/render-typecheck.log) · [构建](evidence/phase03/remote/build.log) |
| 本轮八项重点复核及浏览器 | [结构化结果](evidence/phase03/remote/verification.json) · [命令输出](evidence/phase03/remote/verification.log) · [浏览器日志](evidence/phase03/remote/browser.log) |
| 来源 / Claim / PDF / 冲突 | [PDF/冲突完整页面](evidence/phase03/postgresql/03-pdf-conflict.png) · [新总览](evidence/phase03/remote/postgresql/03-overview-viewport.png) |
| 图片原件及内容索引 | [真实图片](evidence/phase03/remote/postgresql/03-image-index.png) · [解码元数据](evidence/phase03/remote/postgresql/browser-media.json) |
| 视频播放 / 时间索引 / 帧 | [新视频播放](evidence/phase03/remote/postgresql/03-video-viewport.png) · [时间索引页面](evidence/phase03/postgresql/03-video-index.png) · [0ms](evidence/phase03/postgresql/frame-0.jpg) · [3333ms](evidence/phase03/postgresql/frame-3333.jpg) · [6666ms](evidence/phase03/postgresql/frame-6666.jpg) |
| 批准 / 历史 / Mock / 窄屏 | [批准只读](evidence/phase03/postgresql/03-approved.png) · [历史](evidence/phase03/postgresql/03-history.png) · [Mock/失败](evidence/phase03/postgresql/03-mock-and-failure.png) · [390px](evidence/phase03/postgresql/03-mobile.png) |
| SQLite 新截图对照 | [总览](evidence/phase03/remote/sqlite/03-overview-viewport.png) · [图片](evidence/phase03/remote/sqlite/03-image-index.png) · [视频](evidence/phase03/remote/sqlite/03-video-viewport.png) |
| 可复现非敏感资料及步骤 | [fixtures/research/README.md](../fixtures/research/README.md) · [真实 PDF](../fixtures/research/source-a.pdf) · [冲突文本](../fixtures/research/source-b.txt) · [图片](../fixtures/research/diagram.png) · [自制源视频](../apps/render/public/background.mp4) |
| 源码参考及许可结论 | [REFERENCE_REVIEW_LOG.md](REFERENCE_REVIEW_LOG.md#2026-10-23--phase-03--来源与轻量内容索引) |

Phase 03 仍等待最终审核。真实 Search/Vision/OCR/ASR、自动事实核验、自由代码沙箱和 Phase 04 均不在此次交付；不把文件元数据、文本匹配、稀疏帧或 Mock 当作完整多模态 AI 理解。
