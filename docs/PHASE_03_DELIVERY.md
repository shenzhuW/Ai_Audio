# Phase 03 交付报告

日期：2026-10-23。范围：研究来源、Claim、证据及基础多模态索引。已完成本阶段计划的交付标准，等待审核；没有进入 Phase 04，没有推送远程。

> 本文记录 `50bdda5` 本地交付时的状态。后续远程验收的补充截图、重新执行的检查及八项重点结论见 [远程验收核查与证据索引](PHASE_03_REMOTE_ACCEPTANCE.md)。

## 实际实现与边界

| 计划交付标准 | 实现与实际验收 |
|---|---|
| Source / Claim / ClaimEvidence / ResearchIndexEntry 持久化 | 四个独立实体表，绑定具体研究 revision；SQLite 和真实 PostgreSQL 均完成保存、读取、重新启动验证。来源保存原件哈希、日期、作者/平台备注、用户 URL 和已知限制。 |
| 可编辑研究报告、提交/批准 | 复用 Workflow Engine 的草稿、提交、批准、历史、expectedVersion、事务幂等、依赖及 Outbox。结构化资料纳入 contentHash；离开草稿后四类实体有数据库保护。fork 生成新 ID、重映射引用并复用不可变 Blob。 |
| Claim 双来源及冲突依据 | 自制 PDF “32 units”与文本“64 units”分别绑定页码支持和文本反驳引用，实际显示冲突。无引用不能写 supported，任何 verified 写入被拒绝；matched 只表示原文定位成功，不表示事实已核实。 |
| 图片/视频/PDF 基础索引与任务 | 本地真实 PDF.js 提取页数/逐页文本，FFprobe 提取图片/视频元数据，FFmpeg 抽取时间码预览帧。10 秒视频产生 0–3333、3333–6666、6666–10000ms 三段索引；断言没有生成正式 MP4 裁剪片段。 |
| Search / Content / Vision Adapter | 定义可替换接口；本地 Content 为真实实现。网络搜索、语义视觉/OCR/ASR 未配置；显式 Mock 使用相同契约并标记，不返回假文章或核验结论。 |
| 第 03 页真实交互 | 来源筛选/上传/采用、原件下载、Claim 编辑及证据关联、索引/抽帧/视频跳转、分析任务日志/重试/取消、摘要和修订审核。真实 Chrome 浏览器验收，390px 无横向溢出。 |
| D-17 / D-18 | unknown、blocked 等原有许可标志及限制保留；实际验证不可商用资料可上传、分析和保存引用。无商业审批或内部测试硬门禁，不新增自动发布。未访问的用户 URL 仅显示备注，不伪装可核验链接。 |

没有实现自动搜索真实文章、独立事实核验、OCR/ASR 或画面语义理解；原型 Demo 仍为显式模拟。没有改写已验收的项目 CRUD、审批系统和可信 Remotion 组件，也没有自由 TSX、正式素材裁剪或完整文稿生成。

## 数据库、兼容性与回滚

- Prisma provider 继续为 PostgreSQL。只新增 `0003_research`，不改写 `0001_project`、`0002_workflow`，没有迁移真实用户数据。新增四表、关系/索引和研究草稿保护触发器；SQLite 使用对应增量建表/触发器。
- 真实 PostgreSQL **17.6**，本机 loopback `55432`，专用库 `studio_phase03_mvkf7gsy`。应用角色非 superuser、无 createdb；管理角色只为测试新建专用库。先在该库部署旧两项迁移并实际保存项目，再部署 0003、重复部署，项目完全不变；迁移记录各一条，Prisma diff 零漂移。连接密码和集群不在 Git。
- SQLite 最终隔离运行 `mvkf6h2m`；两个数据库均使用 `.cache/phase03/<runId>` 原件/会话目录，不替换默认 `.data`。原 `.data` 和旧验收目录前后散列相同：`7a677496c48a00a14538bc505faf99f1b0fbed6a47b678600a9d62facf470b54`。
- 验收结束后测试 Web/Worker/浏览器均由脚本清理，本次启动的专用 PostgreSQL 集群已正常停止，数据库/原件保留；[停止记录](evidence/phase03/local-services.log)。
- 原项目 JSON、上传原件、会话/API 保持兼容；旧 Phase 01 文本研究修订无需新字段即可读取。导入已有附件只增加研究引用，不改原项目 JSON/字节。
- 回滚应用代码前先停 Worker、备份数据库和完整私有数据目录，再检出 Phase 02 基线；保留新增表/Blob，**不提供 drop/reset 或删除用户数据的回滚脚本**。旧程序不读取新研究实体；继续编辑结构化研究应恢复匹配的 Phase 03 代码。

## 实际命令与结果

仓库根目录执行；本机 pnpm 位于忽略的 `.tools/bin`，Node **24.15**。当前会话限制了 loopback 连接，集成命令经工具批准后运行；没有使用 `--yolo` 或关闭应用权限检查。

```powershell
$env:Path=(Join-Path $PWD '.tools/bin')+';'+$env:Path
pnpm --filter @studio/web add pdfjs-dist@6.4.299 --save-exact
pnpm db:generate
# validate 仅检查 schema；此 URL 是占位符，不连接数据库
$env:DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:55432/VALIDATION_ONLY'
pnpm --filter @studio/web exec prisma validate
Remove-Item Env:DATABASE_URL
pnpm typecheck
pnpm render:typecheck
pnpm test
pnpm build
# 需要 PowerShell 7 在 PATH；专用集群配置见 POSTGRESQL_LOCAL.md
pnpm db:local start
$env:STUDIO_UI_BROWSER_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
node tests/research/run.cjs
node tests/research/run.cjs --postgres
node tests/research/browser-media.cjs
node scripts/audit-staged.cjs --worktree
```

| 实际执行项 | 结果与日志 |
|---|---|
| 安装精确依赖、Prisma generate / validate | PASS；[generate](evidence/phase03/prisma-generate.log)、[validate](evidence/phase03/prisma-validate.log)。PDF.js Apache-2.0，Node >=22.13。validate 第一次缺少 DATABASE_URL 失败，使用上述占位符后通过。未将缺少配置标通过。 |
| Web TypeScript / Render TypeScript | PASS；[Web](evidence/phase03/typecheck.log)、[Render](evidence/phase03/render-typecheck.log)。 |
| 单元测试 | **22/22 PASS，0 失败/跳过**；[日志](evidence/phase03/unit-tests.log)。包括原项目/工作流/渲染单元及新增来源、冲突证据、批准/fork、任务 fencing、上传和真实 PDF 提取回归。 |
| 生产构建 | PASS；[日志](evidence/phase03/build.log)，包含新增真实 API。 |
| SQLite 完整集成 | **15/15 组 PASS**；[结果](evidence/phase03/sqlite/results.json)、[命令输出](evidence/phase03/sqlite/integration.log)。包含旧 HTTP 15 项、旧工作流 8 组、真实提取及浏览器。 |
| PostgreSQL 完整集成 | **16/16 组 PASS**；[结果](evidence/phase03/postgresql/results.json)、[命令输出](evidence/phase03/postgresql/integration.log)、[迁移](evidence/phase03/postgresql/migrations.log)、[零漂移](evidence/phase03/postgresql/schema-drift.log)。包含旧 HTTP 15 项、旧工作流 8 组及实际四表只读保护。 |
| 只读浏览器复核 | 两库均 PASS；[日志](evidence/phase03/browser-media.log)、[PG 播放元数据](evidence/phase03/postgresql/browser-media.json)。真实 1080×1920 / 10 秒视频播放超过 3.6 秒，无 pageerror。 |
| 敏感文件/内容扫描 | 结果见本目录 [安全扫描记录](evidence/phase03/security-audit.json)；只提交自制夹具、脱敏测试记录和截图，不含数据库、会话、上传用户数据或缓存。 |

两库均覆盖：上传幂等、无证据 422、verified 400、无效页码 422、跨项目/来源 404、旧版本 409、Mock 不能升级事实支持、匿名下载 401、Range 206/416、HEAD、应用重启。真实媒体工具失败→同任务重试成功、运行中取消的完整子进程验证额外在 SQLite 执行；不把它重复声称为 PostgreSQL 子进程专项测试。Phase 02 视频在本轮作为真实研究输入读取/播放，没有重新渲染或改写其验收文件。

本轮发现并修复：PDF 本地字体路径末尾分隔符导致真实提取失败、索引按随机 ID 返回导致时间顺序不稳定、新修订表单残留旧 Claim ID 导致 404。最后一项先由真实浏览器复现，再增加回归并在两库通过。测试脚本的变量遮蔽和选择器错误也已修正。此前失败保留在忽略的本地诊断目录；以上最终结果均来自修复后实际运行，非用预期值替换。

## 参考研究与许可证

实读 wallstreet-explainer 固定 SHA `920ed1d3b3ecb5997d861902e2719dda6688c0b1` 的 `references/sourcing.md`、`scripts/snap_news.mjs` 和 LICENSE，记录见 [研究日志](REFERENCE_REVIEW_LOG.md)。借鉴证据/说明画面分离、来源绑定位置、截图等待字体及失败不可当成证据；没有复制或运行其采集脚本。MIT 源码许可不覆盖第三方示例素材，没有引入其样片。PDF.js 接口参考官方 Node 示例，使用精确 npm 依赖。未为参考项目重构现有 Workflow。

## 截图与可复现样例

资料及操作步骤见 [自制夹具说明](../fixtures/research/README.md)，自动脚本在 `tests/research/`。全部数值故意来自合成资料，不能当现实研究结论。

- [第 03 页实际总览](evidence/phase03/postgresql/03-overview-viewport.png)
- [PDF、引用和冲突](evidence/phase03/postgresql/03-pdf-conflict.png)
- [真实视频及时间索引](evidence/phase03/postgresql/03-video-viewport.png)、[三张抽帧之一](evidence/phase03/postgresql/frame-3333.jpg)
- [Mock 与失败任务](evidence/phase03/postgresql/03-mock-and-failure.png)
- [批准后只读](evidence/phase03/postgresql/03-approved.png)、[历史版本](evidence/phase03/postgresql/03-history.png)、[移动页面](evidence/phase03/postgresql/03-mobile.png)
- [完整自制验收快照](evidence/phase03/postgresql/research-snapshot.json)（来源/引用/任务/日志/索引）；SQLite 对照在同级 `sqlite/`。

正常开发沿用原有 `pnpm dev`；另一终端使用相同 `DATABASE_URL` / `STUDIO_DATA_DIR` 执行 `pnpm research:worker`。FFmpeg/FFprobe 需在 PATH 或配置示例变量；Web `.env.local` 不会自动被独立 Worker 读取。[完整启动说明](LOCAL_DEVELOPMENT.md#phase-03-研究资料)。

## 修改文件与设计取舍

- `apps/web/src/domain/research.ts`、`server/research/{engine,http,service,storage,tables,providers}.ts`：契约、业务、HTTP、存储及可替换 Provider。
- `apps/web/src/app/api/v1/projects/[projectId]/research*`、`claims/`、`api/v1/sources/`：研究 API、来源详情和保护下载。
- `scripts/research-{worker,child,extract}.cjs`：固定解析器、心跳租约、限额及失败隔离。
- `components/research-panel.tsx`、`stage-workspace.tsx`、`workflow-panel.tsx`、`studio.module.css`：第 03 页，复用原审批组件及状态。
- `domain/workflow.ts`、`server/workflow/{engine,service,tables}.ts`：最小增量接入研究实体及固定任务，原文本 Worker 跳过研究/渲染专用任务。
- `prisma/schema.prisma`、`migrations/0003_research/migration.sql`：仅增量研究模型；`package.json`、Web package、锁文件、`.env.example`：精确 PDF 依赖、Worker/测试命令及限额配置；`.gitattributes` 将 PDF 作为二进制保存，保留夹具原始字节。
- `tests/unit/research*.test.ts`、`tests/research/`、`fixtures/research/`：单元、真实集成、浏览器及自制资料。
- README、实施/交付/研究日志、数据/API/架构/UI/安全/本地开发规范、阶段计划和 `tests/ACCEPTANCE.md`：当前状态、边界与证据；详细文件列表见本阶段 Git 提交。

## 遗留风险与下一阶段依赖

1. 真实搜索/视觉/OCR/ASR 未配置，需要后续凭据、Provider 集成及单独验收；当前不自动核实事实，扫描型 PDF 无文字时会明确提示。
2. Worker 是固定可信代码的独立本机进程，过滤凭据并限制输入/超时；**未验证 OS 级文件/网络沙箱、容器内存硬限额或恶意解析器漏洞防护**，不能据此开放任意 TSX 或公共服务。
3. 本阶段用等分时间段和稀疏帧做浅索引，不代表镜头语义检测、转录、画面理解或自动素材匹配。PDF 默认 50 页、视频 120 秒，可配置；大文件/长片处理及垃圾回收仍需后续独立设计。
4. 失败/取消可能保留私有工作目录或未引用 Blob，暂不自动删除以保护数据。无自动用户数据迁移、商业授权系统或发布控制。
5. 所有截图和样例来自自制合成输入，外部文章取证和真实事实准确性 **NOT RUN**。本地专用测试库及原件保留，不入 Git。

进入 Phase 04 的技术前置已具备，但须先由用户验收本阶段。下一阶段可以引用已批准研究的具体 revision/Claim/Source；完整文稿生成、引用传播与修改影响分析留 Phase 04，不在本次开发。

Git 基线：`8e747526bba86b508e4916107b6aebcf2eef337a`。本报告与代码、证据一并独立本地提交；完整 Hash 在交付回复提供，可用 `git log -1 --format=fuller` 复核。未远程推送。
