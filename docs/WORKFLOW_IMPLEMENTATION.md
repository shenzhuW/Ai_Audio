# Phase 01 工作流实现与运行

## 边界与存储

Artifact、Revision、Dependency、ApprovalEvent、Job、Outbox、RequestReceipt、AuditEvent 各有独立数据库表。记录文档经 Zod 校验，工作流快照 schemaVersion=1，Revision 内容 schemaVersion=1；UUID、关键关联及唯一性另有索引列。正文内联 JSON/JSONB，限制 50000 字符，不为小型文本增加 Blob 副本。

已有 `projects` 表、Project/ProjectInput JSON 和旧 API 保持兼容。PostgreSQL 追加 `0002_workflow`，不改写 `0001_project`；SQLite 仅增量建表并登记 migration 2，不重写项目、附件或会话。开发验收只使用新数据库和独立目录，未把旧 SQLite 项目搬迁到 PostgreSQL。

写操作持有当前项目行锁（PostgreSQL）或 BEGIN IMMEDIATE（SQLite），在同一事务中更新当前候选/批准指针、修订状态、审核/审计事件、下游任务、Outbox 和幂等响应。没有外部 Provider 调用位于此事务内。PostgreSQL 只读快照用 RepeatableRead；写入以项目锁串行化，已识别的事务冲突最多重试两次。

数据库触发器阻止覆写已批准正文、删除修订，以及更新/删除审核、审计和请求回执。存储层只保存变化的行，既有不可变行不会重复 UPDATE。幂等回执按项目+key 唯一，校验完整解析后动作的指纹，重放返回原响应。

## 审核与依赖

当前候选与当前已批准版是不同指针。fork 产生新草稿并移动候选，不改变旧批准事实；批准新版本后才替换批准指针。stale 根据精确上游 revisionId 与有效批准指针派生并传递，不覆写历史 approved 状态。

提交和批准都校验输入是否已批准且仍有效；历史候选不能批准，expectedVersion 不符返回 409。已提交/驳回/批准内容不允许 PATCH，须 fork。fork 可显式更新到当前有效输入；保留旧依赖的 fork 在提交时会被 stale 校验阻止。同项目且依赖只能从较早创作阶段指向后续阶段，避免循环。

手动内容永远不自动变成已核实事实。Mock 内容经修改/fork 仍保留 mock=true。当前 UI 接通研究/文稿的最小文本审核、历史和依赖视图，总览显示真实状态；其余专属编辑器留后续阶段。用户已有文稿项目的研究可跳过。

## Worker、取消和恢复

Job 与 Outbox 同事务写入。独立 Worker 领取提交后的记录，设置执行者和 30 秒租约；在事务外调用与 LanguageProvider 共用接口的 MockWorkflowTextProvider，再用租约校验提交结果。

- 支持研究/文稿 Mock 文本，生成的是 draft，不自动批准。
- 上游在领取前失效：任务明确失败 STALE_INPUT，不无限停留 queued。
- 领取后上游变化：结果仍固定原依赖，显示 stale；不会偷偷切换 latest。
- 目标产物在排队后被修改：失败 TARGET_CHANGED，保护用户新内容。
- 配音及其他提供方未配置：失败 PROVIDER_NOT_CONFIGURED，不伪造媒体。
- 取消设置终态并封锁迟到结果，不回滚批准；重试记录新 attempt，固定旧输入，最多 3 次执行。
- Worker 退出/异常没有结果时，重启后发现租约过期则标失败 WORKER_INTERRUPTED；用户明确重试。后台不会无限自动重试或产生扣费。

当前只执行本机即时 Mock 文本；未来真实耗时 Provider 必须实现心跳/更长租约及真实成本核算。没有运行 AI 生成代码、下载、裁剪或渲染。

## 启动与回滚

根目录（先安装 pnpm，当前机器可将 `.tools/bin` 加入 PATH）：

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
# SQLite：独立验收数据目录，未设置 DATABASE_URL
$env:STUDIO_DATA_DIR='../../.cache/my-workflow-test'
pnpm dev
# 另一个终端，使用相同数据配置
pnpm worker
# 只处理当前队列一轮
pnpm worker -- --once
```

访问创建/总览，然后研究或文稿页。保存草稿、提交和批准是三个独立动作；Mock 按钮只排队，Worker 可独立于浏览器运行。UI 轮询持久状态，离开或刷新不会丢失；轮询不覆盖未保存编辑缓冲区，冲突时显式重新载入。

PostgreSQL 设置独立 DATABASE_URL 与 STUDIO_DATA_DIR，先 `pnpm db:migrate` 再启动应用和 Worker。不要在本机真实用户目录上试验迁移或重置；数据库准备及备份见 [POSTGRESQL_LOCAL.md](POSTGRESQL_LOCAL.md)。本次测试只升级专用新库，不执行真实用户数据转换。

回滚应用可恢复到 Phase 00.5 提交 `b79eab2c34509d6eaa5a6b74e392e1e9ddb2363e` 的版本继续使用项目 CRUD，保留新增表及修订历史，不 DROP。数据库或用户数据回滚应先停写并备份，再人工检查；不通过删除表或重置目录实现应用回滚。

## 验收命令

```powershell
pnpm typecheck
pnpm test
pnpm build
# 需要已启动的专用 PostgreSQL 测试 cluster 和 Chromium
pnpm test:workflow
```

`test:workflow` 复用 Phase 00.5 的隔离 cluster，但每次创建 `studio_phase01_*` 新库；先以 00.5 schema 建立一个项目，再应用增量迁移并检查原 JSON。执行现有 15 项 HTTP 回归、新工作流 HTTP、独立 Worker、浏览器和重启持久化检查。结果写入 `docs/evidence/phase01`；旧阶段的证据保留。

SQLite 的新工作流 HTTP 可用 `STUDIO_WORKFLOW_HTTP=1` 和 `STUDIO_TEST_URL` 指向独立实例执行 `node tests/workflow/http.mjs`；旧 HTTP 套件仍可运行。所有测试均标识真实数据库后端，Mock 只指生成文本。
