# Phase 01 交付报告 · 2026-10-22

状态：本阶段工作流、版本与审核已完成并通过本地验收，停止等待审核。未进入 Phase 02；没有真实研究、配音、素材或渲染交付。

## 1. 前置审查与 Phase 00.5 提交

已核对 Phase 00.5 的工作区差异、交付报告、迁移与 PostgreSQL 证据。生产代码仅替换 Prisma 临时结构类型/动态加载，其余为测试、配置和文档；没有意外 UI 或产品需求修改。原迁移、项目 JSON 与 SQLite 仓储未改动。工作区敏感扫描 145 文件零发现；暂存区 24 个变更文件扫描零发现。提交门禁发现构建日志末尾空白，规范化空白后再提交，没有改变日志结果。

**Phase 00.5 独立提交完整 Hash：`b79eab2c34509d6eaa5a6b74e392e1e9ddb2363e`**

标题 `chore: validate PostgreSQL integration for Phase 00.5`，24 文件；前一基线 `e53ab169d590cb1c7d6f334ae962121cc33d29cb`。没有远程配置或推送。Phase 01 的后续变更保留在工作区供本轮审核，没有额外提交。

本轮没有使用 --yolo、请求提权或修改系统权限。数据库管理员仅用于专用新测试库的初始化；应用/Worker 使用无超级用户和建库权限的项目角色。所有迁移及测试都针对隔离数据，不自动迁移真实用户项目。

## 2. 实施范围、参考研究与取舍

已阅读 AGENTS、DECISIONS、PRD、UI_SPEC、ARCHITECTURE、DATA_MODELS、API_SPEC、WORKFLOWS、Phase 01 计划及参考列表。原计划目标明确，但缺少事务/幂等/恢复细节；先补充 [实施计划](../plans/01-workflow.md) 和风险，再按失败测试→实现→回归推进，没有新增产品需求。

Hypit 研究固定 GitHub main SHA `0d36de9a9d17562fca0e478969b80eb1c16a7693`，静态阅读 Packages/Run/Results 文档、protocol/build.ts 已记录范围、graph-query.ts 和 result-query.ts。借鉴精确输入/输出身份、显式复用、只读历史与依赖遍历；本产品自行实现用户审核、事务与 outbox，不采用其 DSL 或运行系统。修改版 Apache 许可另行记录，未复制源码或添加依赖。具体链接、已读范围及 404 路径见 [参考记录](REFERENCE_REVIEW_LOG.md)。

当前阶段实现：

- Artifact、Revision、Dependency、ApprovalEvent、Job、Outbox、RequestReceipt、AuditEvent 独立实体表及 Zod 协议。
- 草稿创建/修改、提交、批准、驳回、fork、版本列表及具体历史读取。批准正文只读，驳回/已提交内容也通过新修订继续修改。
- 项目级事务锁、expectedVersion/当前候选校验、409；同键同内容返回原结果，同键异内容 409。
- 审核、审计、下游 Job、Outbox 和请求回执同事务提交；真实数据库触发器保护批准内容及 append-only 历史。
- 精确 revisionId 依赖、无环/同项目校验、影响范围及传递 stale。stale 派生显示，不覆写历史 approved 事实。
- 独立 Worker、持久队列、jobId 轮询、执行尝试、租约、取消和显式重试；最多 3 次执行，迟到结果有租约/取消隔离。
- 研究/文稿最小文本审核 UI，以及总览真实任务、阶段、待审核和依赖状态；轮询不覆写未保存编辑缓冲区。

正文当前内联 JSON/JSONB，最多 50000 字符；contentHash 是正文规范 JSON 表示的 SHA256。段落富文本、镜头/时间轴、实际提供方和渲染均留在对应后续阶段。所有长操作在 Worker 中，不在 HTTP 请求内执行。

## 3. 数据迁移、兼容性与回滚

新增 [0002_workflow/migration.sql](../apps/web/prisma/migrations/0002_workflow/migration.sql)，保留 `0001_project`。Prisma Schema 增加工作流表、外键、唯一/查询索引；SQLite 增量创建相同逻辑表并登记 migration 2，不重写现有 Project/ProjectInput 文档。

真实 PostgreSQL 验收先使用 Phase 00.5 已提交 Schema 和原迁移初始化新库，创建一个升级前项目，再应用 0002；完整 JSON 保持一致。第二空库的完整初始化、重复 migrate deploy、schema diff、重启后迁移记录均通过；每个迁移有唯一完成记录，共 2 条。

旧项目 GET/PATCH、version、初始需求、附件 UUID 与下载接口保持兼容。新增 workflow GET 提供派生阶段及审核信息，避免改变旧 ProjectSchema 的状态枚举。原 `.data` 与旧 `.cache/acceptance-data` 文件名/内容的聚合散列在集成前后相同；未搬迁真实 SQLite 数据或覆盖上传原件/会话。

回滚应用可使用已提交 Phase 00.5 版本继续项目 CRUD，保留新表及历史；不要 DROP 表、删除原件或 reset 用户数据。真实库部署前按既有备份和审核流程应用增量迁移。本次只验证了专用新库，未对真实用户库执行该迁移。

## 4. Mock / Real 与任务恢复

审核操作、状态、数据库、队列、任务 ID、事务及文件存储均是真实实现。生成内容只有研究/文稿 Mock 文本，使用 LanguageProvider 的同一接口并永久保留 mock=true；编辑/fork 不能洗掉 Mock 标签。手动文本 mock=false 仅表示用户输入，UI 仍标“未核实”。批准不等于事实已核实或素材已获授权。

研究批准创建文稿任务；文稿批准创建配音任务。当前 Worker 仅执行 Mock 文本；音频等未配置 Provider 的任务明确失败 PROVIDER_NOT_CONFIGURED，resultRevisionId 为空，不产生假音视频。

任务输入固定具体批准修订。领取前输入失效则失败 STALE_INPUT；目标产物已被用户修改则失败 TARGET_CHANGED。取消不回滚批准，迟到结果被拒绝。执行中的 Worker 租约 30 秒，过期标记 WORKER_INTERRUPTED，再由用户明确重试；每次尝试的状态/时间/错误保留。实际即时文本 Worker 已运行；租约超时/迟到/重试上限的边界使用确定性单元测试，不冒充真实远程 Provider 崩溃压测。

## 5. 实际命令与测试结果

环境：Windows x64、Node 24.15.0、pnpm 10.34.4、Next 15.5.19、Prisma 6.19.3、真实 PostgreSQL 17.6、Playwright 1.55.0 / 本机 Chromium 1187。专用数据库端口 55432，应用测试端口 PostgreSQL 3003、SQLite 3004。

```powershell
# 项目根目录；当前机器的 pnpm wrapper
$env:Path=(Join-Path $PWD '.tools/bin')+';'+$env:Path
pnpm db:generate
pnpm typecheck
pnpm test
pnpm build
# 独立 PostgreSQL cluster 已启动，并已安装 Chromium
pnpm test:workflow
# 常规运行，两个终端使用相同数据配置
pnpm dev
pnpm worker
```

本机测试时 STUDIO_CHROMIUM_PATH 指向已有 Chromium；数据库密码只通过进程环境/忽略文件读取，没有写入命令日志或报告。Worker 还实际执行了 `node ../../scripts/workflow-worker.cjs --once`。验收结束后已执行 `pnpm db:local stop`，专用 PostgreSQL 正常停止，测试数据库和原件保留。

| 检查 | 实际结果 / 证据 |
|---|---|
| 类型检查、单元测试 | PASS；12 项测试，含旧项目 CRUD/认证/上传、工作流事务重开/回滚、SQLite 直接 SQL 只读保护、Mock 标签继承、审核/幂等/依赖/任务边界；[日志](evidence/phase01/checks.log) |
| 生产构建 | PASS；完整编译、类型检查、页面生成及追踪；[日志](evidence/phase01/build.log) |
| PostgreSQL 迁移/兼容/Worker/持久化 | PASS；[14 组集成检查](evidence/phase01/postgres-results.json)，含真实版本查询、旧项目升级、零 schema 漂移、只读保护、应用和数据库重启恢复、旧目录散列不变 |
| 现有 HTTP 回归 | PostgreSQL 15/15 PASS：[结果](evidence/phase01/http-results.json)；SQLite 15/15 PASS：[结果](evidence/phase01/sqlite-regression/http-results.json) |
| 工作流 HTTP | PostgreSQL 8/8 PASS：[结果](evidence/phase01/workflow-http-postgresql.json)；SQLite 8/8 PASS：[结果](evidence/phase01/workflow-http-sqlite.json) |
| 浏览器 | 真实 PostgreSQL 连续三轮 PASS；创建/保存/刷新/批准/fork/驳回/历史只读/总览/390px，无 pageerror；[最新结果](evidence/phase01/screenshots/result.json) |
| 数据安全与差异检查 | 原项目 API/JSON、原件与会话保留；未执行真实用户数据迁移。[工作区敏感扫描](evidence/phase01/audit.json) 184 文件零发现；`git diff --check` 与源代码/测试 Prettier 检查通过 |
| 真实 AI / 音频 / MP4 渲染 | NOT RUN；属于后续阶段，无媒体产物交付 |

实际修复的验收问题：

1. 移动端完整哈希造成溢出：新增追溯信息折叠与换行，390px 浏览器断言通过。
2. 项目创建 API 返回 201 后，Next 15 客户端导航偶发停留；移除连续 refresh 后仍复现。创建成功改用浏览器完整导航打开已验证 UUID 地址，最终连续三轮通过；普通导航与 CRUD 契约保持。未宣称已定位 Next 内部全部根因。
3. 截图脚本曾依赖 CWD，集成进程从 apps/web 启动时写到错误目录：现从 import.meta.url 解析仓库根路径；旧生成文件移至忽略缓存，最新真实截图写入统一目录。

实际截图：

- [研究修订已批准](evidence/phase01/screenshots/03-research-approved.png)
- [历史批准版仍可读](evidence/phase01/screenshots/03-research-history.png)
- [项目总览真实状态与队列](evidence/phase01/screenshots/02-overview.png)
- [390px 审核页面](evidence/phase01/screenshots/03-research-390.png)

## 6. 变更文件

| 文件 | 内容 |
|---|---|
| `apps/web/prisma/schema.prisma`、`migrations/0002_workflow/migration.sql` | 独立工作流表、索引、外键、不可变触发器 |
| `apps/web/src/domain/workflow.ts` | Artifact/Revision/Approval/Dependency/Job/Outbox/Receipt/Audit 的 Zod 与类型 |
| `apps/web/src/server/workflow/engine.ts`、`tables.ts`、`repository.ts` | 生命周期、依赖及任务状态机、SQLite 增量建表、SQLite/PostgreSQL 事务持久化 |
| `apps/web/src/server/workflow/service.ts`、`provider.ts`、`index.ts`、`http.ts` | 服务/Worker 消费、Mock 适配器、工厂、薄 HTTP 分发 |
| `apps/web/src/app/api/v1/projects/[projectId]/{workflow,artifacts,research-runs,script-runs}/route.ts` | 工作流查询、创建草稿及 Mock 排队入口 |
| `apps/web/src/app/api/v1/artifacts/[artifactId]/revisions/.../route.ts`、`jobs/[jobId]/.../route.ts` | 历史、审核、影响范围、Job 查询/事件/取消/重试 |
| `apps/web/src/components/workflow-panel.tsx` | 最小文本审核、历史、任务与错误/冲突 UI |
| `overview.tsx`、`stage-workspace.tsx`、`shell.tsx`、`studio.module.css` | 总览真实状态、研究/文稿入口与响应式样式 |
| `project-form.tsx`、`app/projects/[projectId]/page.tsx` | 创建后可靠导航、总览读取工作流 |
| `scripts/workflow-worker.cjs`、根及 apps/web `package.json` | 独立 Worker 和 test:workflow 命令；没有新增依赖或改锁文件 |
| `tests/unit/workflow.test.ts`、`workflow-store.test.ts` | 生命周期、任务边界、并发/幂等、依赖、持久化和 DB 防护 |
| `tests/workflow/http.mjs`、`browser.mjs`、`tests/postgres/run.cjs`、`repository.cjs` | 双数据库 API、生产浏览器、升级/Worker/重启综合验收 |
| `plans/01-workflow.md`、`docs/REFERENCE_REVIEW_LOG.md`、`docs/API_SPEC.md` | 细化计划、固定版本源码研究、已实现 API 子集 |
| `README.md`、`docs/LOCAL_DEVELOPMENT.md`、`WORKFLOW_IMPLEMENTATION.md`、`CHANGELOG_IMPLEMENTATION.md`、`tests/ACCEPTANCE.md`、本报告和 `docs/evidence/phase01/` | 运行/回滚、实际进度、验收与交付证据 |

## 7. 风险与后续边界

- 当前只验证本机单用户和即时 Mock 文本，不等于生产部署。Worker CLI 使用开发时 TS 加载器；生产打包、守护、耗时 Provider 心跳/租约、真实计费需后续验证。
- 当前依赖与失效按修订粒度；段落/镜头级局部重建在后续对应阶段实现。当前每项目读取完整历史，尚无大规模历史分页和负载测试。
- 审批/审计/幂等记录保留，不自动清理；隔离测试库和原件也保留，可能占用本机空间。
- 真实用户 PostgreSQL 尚未应用 0002，SQLite 没有批量导入；部署前先备份并审核迁移执行目标。旧接口可回滚，新历史不通过删除回滚。
- 新增功能是审核与工作流基础。研究事实、Claim、音频时间轴、导演分镜、媒体处理、自由代码沙箱、渲染及正式导出仍待对应阶段。

下一阶段建议按 Phase 02 做授权自有素材上的真实 Remotion 最小渲染 PoC，并重新核对许可与隔离边界。**当前停止在 Phase 01，等待下一阶段审批。**
