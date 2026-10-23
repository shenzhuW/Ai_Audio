# Phase 04 交付报告

日期：2026-10-23。基线为已验收 GitHub main `4fa1d4088fc89ba2292895066443c7aa3630bdb4`，开工 fetch 后两侧差异 `0 0`，工作区干净。本阶段只实现结构化口播文稿、事实绑定与审核；没有 Phase 05 功能，没有扩建搜索系统，没有远程推送。人工产品体验依用户决定延后；以下浏览器验收为实际自动操作。

## 交付标准与实际结果

| 要求 | 实际实现和验证 |
|---|---|
| ScriptRevision / ScriptSegment 持久化 | 复用 WorkflowRevision，加 `script_documents` 与 `script_segment_versions`。段落逻辑 UUID 跨编辑、重排、fork 保持；数据库每版另有物理行 UUID。正文、purpose、观众收获、视觉意图、节奏、停顿、引用实际保存，两库重启读取一致。 |
| 基于批准研究写稿及事实绑定 | 仅接受有效批准 ResearchRevision；Claim 与被采用 Source 必须属于该固定研究，并有对应 ClaimEvidence。实际双来源支持/反驳引用保存成功，错 Claim/Source 拒绝。未核实/冲突/作废有提示，批准文稿不自动升级事实。 |
| 已有文稿直接进入 | 不要求研究；可导入两段用户文稿或建立空白草稿，标明用户提供/未独立核实。旧文本修订完整可读，旧草稿可通过实际浏览器操作显式转结构化，ID 和文本保留；已审版本先 fork。 |
| 段落编辑、增删、排序 | 第 04 页按段编辑正文、用途/意图/节奏，上下移按钮可键盘操作；实际新增第三段、移动、删除、保存，第二段编辑后刷新保留。采用原生多行编辑框，不新增复杂富文本依赖。 |
| 时长和节奏 | 中文汉字+其他语言词数、单位/分钟及停顿公式；显示总时长、各段估时和目标差异/节奏建议。无效语速不显示 Infinity 或允许保存；**不是实测配音**，未生成音轨。 |
| AI 整体/局部 Adapter | ScriptProvider.generate/rewrite 契约，复用原 Workflow Worker/Job/Outbox。冻结 Brief、研究、段落与目标版本。显式 Mock 有醒目标记；局部只替换目标稳定 ID，其他段落不变。真实 Provider 未配置正确失败，无假 AI 成稿或来源。 |
| 草稿/审核/批准/驳回/Fork/历史/差异 | 原审批组件和后端状态机；已批准修订/段落数据库保护。按稳定 ID 展示新增/删除、正文、顺序、叙事/引用/节奏差异。409、幂等和批准后原快照只读均实际通过。 |
| 下游影响与事实变化 | 可声明 segmentIds 的内容依赖；修改第二段后对应消费者 stale，第一段消费者可复用；当前文稿也列出历史批准版消费者，并预告草稿批准后的更新范围。替换研究定位绑定段落，fork 切换依据时清空旧 Claim ID、标记需重绑；不暗改批准版。 |
| 叙事结构与阶段边界 | 开场/背景/解释/事实案例/承接/总结，viewerTakeaway、visualIntent；**不强制一句/一段一个镜头**。下游测试使用明确的合成依赖记录，不冒充真实音频、字幕或 DirectorShot。 |

## 参考研究

实读 wallstreet-explainer 固定 SHA `920ed1d3b3ecb5997d861902e2719dda6688c0b1` 的 `SKILL.md`、`references/thinking.md` 与 LICENSE。借鉴快速进入主题、同一解释对象、观众理解增量、段落承接、原文/数据口径和画面意图；没有复制代码或素材，也没有把参考的固定时长/画幅或逐站人工审批作为新需求。[研究记录](REFERENCE_REVIEW_LOG.md#2026-10-23--phase-04--文稿叙事)。MIT 不覆盖第三方样片素材，本次没有新增第三方依赖或新闻素材。

## 数据迁移与安全

- 仅追加 `0004_script`，不改写 0001–0003。PostgreSQL provider 不变；SQLite 增量建表和同等的文稿草稿写入保护。移除段落用 removed 保留历史，不提供删除表或清空数据脚本。
- 实际 PostgreSQL 17.6，专用 loopback 集群 `127.0.0.1:55432`。最终专用库名/runId 见 [PG 结果](evidence/phase04/postgresql/results.json)，测试先初始化已批准 Phase 03 三迁移、写入旧项目，再升级 0004、重复 deploy；四条记录各一次，旧项目精确不变，Schema diff 退出 0。应用角色非 superuser/无 createdb。
- 没有迁移用户库或改默认数据库指向。所有验收原件/会话位于 `.cache/phase04/<runId>` 和对应隔离回归目录，凭据不入 Git。原 `.data` 与旧验收目录前后散列保持 `7a677496c48a00a14538bc505faf99f1b0fbed6a47b678600a9d62facf470b54`。
- API 沿用会话、同源保护、Zod、归属检查、expectedVersion 与 Idempotency-Key。300 段/单段 10000/总正文 50000 字符，请求 300000 bytes。旧 PATCH 不能绕过结构化保存；局部 AI 结果不能写错目标段落或越界引用。
- 本轮没有新网络模型调用、网页抓取、自由 TSX 或发布入口；素材继续按 D-17/D-18，已知不可商用限制不阻断内部研究引用，来源与限制保留。测试结束停止专用集群，保留数据库/原件，不清理用户文件。
- 回滚前停 Worker 并备份完整数据库/私有目录，再检出基线；保留新增表和数据，不 drop/reset。旧代码不能读取结构化文稿或精确段落依赖，恢复这类创作应使用匹配版本；不能将旧程序的整体依赖判断当作新段落复用验证。

## 实际命令、测试与证据

Node 24.15.0 / pnpm 10.34.4，依赖未新增，锁文件未修改。没有把未运行的真实模型集成标为通过。

```powershell
# 本机 pnpm 包装器在忽略的 .tools/bin；正常环境直接使用 pnpm
pnpm db:generate
# schema 校验使用不连接数据库的占位 DATABASE_URL
pnpm --filter @studio/web exec prisma validate
pnpm test
pnpm typecheck
pnpm render:typecheck
pnpm build
pnpm db:local start
$env:STUDIO_UI_BROWSER_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
node tests/script/run.cjs
node tests/script/run.cjs --postgres
# 以下每轮设置独立的 STUDIO_TEST_PHASE_EVIDENCE_ROOT，防止覆盖原材料
node tests/research/run.cjs
node tests/research/run.cjs --postgres
$env:STUDIO_CHROMIUM_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
node tests/render/run.cjs --quick
node tests/render/run.cjs --postgres --quick
pnpm db:local stop
node scripts/audit-staged.cjs --worktree
git diff --cached --check
node scripts/audit-staged.cjs
```

自动测试内部确实执行 Prisma CLI `migrate deploy`/重复 deploy/`migrate diff` 到新建测试库；不是向真实用户库执行 `db:migrate`。正常开发运行 `pnpm dev` 和同配置的 `pnpm worker`，迁移/备份步骤见 [启动说明](LOCAL_DEVELOPMENT.md#phase-04-结构化口播文稿)。

| 验证 | 最终结果 | 实际记录 |
|---|---|---|
| 单元 | **29/29 PASS，0 失败/跳过** | [日志](evidence/phase04/unit-tests.log)：包括既有 22 项和新增结构、引用、稳定 ID、fencing、估时/差异、空文稿/越界 AI、历史下游影响 |
| Web / Render TypeScript | PASS | [Web](evidence/phase04/typecheck.log)、[Render](evidence/phase04/render-typecheck.log) |
| Prisma generate / validate | PASS | [generate](evidence/phase04/prisma-generate.log)、[validate](evidence/phase04/prisma-validate.log) |
| 生产构建 | PASS | [日志](evidence/phase04/build.log) |
| 敏感信息 / 本地服务收尾 | 扫描零发现；测试集群正常停止，数据保留 | [扫描](evidence/phase04/security-audit.json)、[停止记录](evidence/phase04/local-services.log) |
| Phase 04 SQLite | **9/9 组 PASS** | [结果](evidence/phase04/sqlite/results.json)、[命令输出](evidence/phase04/sqlite/integration.log)、[实际快照](evidence/phase04/sqlite/script-snapshot.json) |
| Phase 04 PostgreSQL | **11/11 组 PASS** | [结果](evidence/phase04/postgresql/results.json)、[输出](evidence/phase04/postgresql/integration.log)、[迁移](evidence/phase04/postgresql/migrations.log)、[零漂移](evidence/phase04/postgresql/schema-drift.log) |
| Phase 00/01 回归 | 两库各 15 项 HTTP + 8 组工作流 PASS，已含在集成组中 | [SQLite HTTP](evidence/phase04/sqlite/http-results.json)、[PG 工作流](evidence/phase04/postgresql/workflow-http-postgresql.json)；旧需求/上传/API、审批/并发/幂等/任务保护 |
| Phase 03 完整回归 | SQLite **15/15**、PG **16/16** 组 PASS | [SQLite](evidence/phase04/regression/phase03/sqlite/results.json)、[PG](evidence/phase04/regression/phase03/postgresql/results.json)：实际 PDF/图片/视频/Worker、引用、审核、异常、浏览器和重启 |
| Phase 02 媒体回归（quick） | SQLite **9/9**、PG **11/11** 组 PASS | [SQLite](evidence/phase04/regression/phase02/sqlite/results.json)、[PG](evidence/phase04/regression/phase02/postgresql/results.json)：真实 Remotion、FFprobe、三帧确定性/实际 MP4 对照、受保护播放/刷新/重启 |

quick 没有再次执行原 Phase 02 的缺少 Chromium 后重试/运行取消专项；保留原材料，不声称全量异常子进程专项重跑。渲染回归生成的自制 MP4 保留在本地对应回归目录，通过忽略规则避免重复入 Git；FFprobe/帧/日志及截图入库。真实 AI 写稿、网页事实检索、视觉理解、实测配音及人工产品体验 **NOT RUN**。

有意失败用例均按预期阻断：旧版本 409、批准修改 422、错引用 422、空文稿不可提交、局部 AI 错段落结果失败、取消/迟到结果拒绝、未配置写作 Job 为 PROVIDER_NOT_CONFIGURED。这些是测试通过，不能将 Job 失败误报成“真实模型已接通”。

实际发现并修复的问题：浏览器初轮选择器将隐式 label 文本与 textarea 内容混淆，改按可访问角色定位；段落保存后审核面板版本滞后导致 409，新增保存后同步；语速 0 导致无限估时/可提交，补校验；当前文稿遗漏旧版下游消费者，新增测试先失败再修复并双库复核。失败诊断留在忽略的 `.cache/phase04*`，以上结果均为修复后的真实运行。

## 页面截图与复现

- [用户文稿编辑](evidence/phase04/postgresql/04-user-script.png)
- [固定研究、Claim、双来源与冲突](evidence/phase04/postgresql/04-claims-conflict.png)
- [Mock 与未配置任务](evidence/phase04/postgresql/04-mock-unconfigured.png)
- [批准只读](evidence/phase04/postgresql/04-approved.png)、[驳回](evidence/phase04/postgresql/04-rejected.png)、[历史](evidence/phase04/postgresql/04-history.png)、[段落差异](evidence/phase04/postgresql/04-diff.png)
- [下游消费者影响](evidence/phase04/postgresql/04-downstream-impact.png)、[研究替换提示](evidence/phase04/postgresql/04-research-impact.png)、[390px](evidence/phase04/postgresql/04-mobile.png)
- [非敏感样例及操作步骤](../fixtures/script/README.md)；自动脚本 `tests/script/run.cjs`；两库截图/快照及 Worker 输出均在 `docs/evidence/phase04/`。

截图来自实际 Chrome 页面操作，不是静态原型或图片生成。没有用商业新闻事实作验收材料；所有 32/64 数字均为自制冲突夹具。

## 修改文件

- `domain/script.ts`、`server/script/{engine,service,http,providers,tables}.ts`：结构化契约、引用/段落/差异/估时、Provider、持久服务与 API。
- `app/api/v1/projects/[projectId]/script/route.ts`、原 `workflow/http.ts`：结构化文稿入口及兼容的新旧 script-runs。
- `domain/workflow.ts`、`server/workflow/{engine,service,tables}.ts`：最小增量接入文稿状态、范围依赖、快照/fork、任务和心跳；没有重建审批/项目管理。
- `components/{script-panel,workflow-panel,stage-workspace}.tsx`、`studio.module.css`：真实第 04 页和审核联动，其他集成模式保持默认兼容。
- Prisma Schema、`0004_script/migration.sql`：两个新增表、关系及草稿保护；旧迁移不改；`.gitignore` 只排除重复回归 MP4。
- `tests/unit/script.test.ts`、`tests/script/run.cjs`：新增 7 项单元及真实两库/浏览器测试；`tests/research/run.cjs`、`tests/render/run.cjs` 仅增加回归证据目录覆盖和迁移数对照，保留旧默认命令。
- `package.json` 新增 test:script；`fixtures/script/README.md`、本报告、实施计划、研究日志、README、数据/API/架构/UI/启动规范、阶段计划、验收表及技术待办更新。未增加包依赖。

## 遗留问题与审核边界

1. **真实模型未配置**：只有可替换接口与显式 Mock，没有真实 AI 质量/延迟/费用验证；现有 Workflow Worker 的旧文本 Mock 任务保持兼容，产生旧文本草稿时可显式转换，不当作新结构化 AI 写稿。
2. **搜索/抓取/视觉尚未接通**：本阶段使用已有批准研究或用户文稿，相关集成要求集中于 [TECHNICAL_TODO.md](TECHNICAL_TODO.md)，不以元数据处理冒充多模态理解。
3. **事实影响保守处理**：研究 fork 会生成新 Claim ID，替换研究时提示所有绑定旧研究的段落，清空旧绑定待重新核对；不自动推测事实是否语义等价或静默重绑。
4. **下游仅验证依赖契约**：声明段落范围的内容可复用不代表整个时间轴可复用。实际配音/Cue/Shot 在后续阶段实现；未声明范围时保守整版失效。段落差异不等于逐词修订建议。
5. **时长是估算、编辑器为段落文本**：没有实际 TTS/语音对齐或复杂 NLE/富文本排版。空文稿可保存但不能提交；编辑过长的单段需先分段，输入限额已在启动说明列明。
6. **可信执行边界不变**：没有自由 TSX、自动网页执行或 OS 沙箱已验证的声明；现有安全边界与内部素材策略保持。测试库/工作目录保留，不自动删除以避免数据损失。

已满足 `plans/04-script.md` 的本阶段交付标准，具备进入下一阶段的技术前置，但**必须等待用户审核，不进入 Phase 05，不推送远程**。本报告与代码/证据独立本地提交，完整 Commit Hash 在交付回复提供；`git log -1 --format=fuller` 可复核。
