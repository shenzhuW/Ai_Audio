# Phase 01 — 工作流、产物版本与真实审核

**边界**：这是本阶段目标，Codex 不得一次性开发后续所有功能。见 `docs/DECISIONS.md`、`docs/ARCHITECTURE.md`、`docs/UI_SPEC.md`。

## 参考仓库阅读与适配
开工前对照 `docs/REFERENCE_PROJECTS.md` 的 Hypit Packages / Run / Results，记录版本/依赖 DAG/显式复用思路；不要直接复制其实现。 请将已核实结论、路径、日期与许可注意事项记录到 `docs/REFERENCE_REVIEW_LOG.md`。

## 输入与前置条件
- 已通过上一阶段的测试门禁；仓库 `AGENTS.md` 与原型资料可读。
- 若使用外部 Provider，密钥与许可条件由用户提供；未具备时明确演示 Mock。

## 本阶段开发任务
- 根据 `docs/DATA_MODELS.md` 实现 Artifact、Revision、ApprovalEvent、Job、Dependency、审计与迁移。
- 实现草稿保存、提交、批准、驳回、fork、版本浏览及冲突（expectedVersion/409）。
- 项目总览读取真实审批状态、待办、当前阶段及上下游依赖；离开页面/刷新后完整恢复。
- 初步实现异步任务状态与可查询 jobId（先不强迫所有 Worker 并行）；保障 Idempotency-Key。
- Mock 模块产物必须明确带来源标签 `mock=true`，不把研究等模拟状态当真实结果。

## 可验收交付物
- 草稿修改和批准行为在数据库保存；批准版本无法 PATCH；旧审批版本可读取。
- 两个客户端同时批准不同修订时有一个获得 409；相同请求重试不会双启动下游任务。
- 项目总览真实显示工作流任务状态；测试中完成页面刷新后仍一致。

## Codex 必须报告
1. 修改文件、数据迁移和关键设计取舍。
2. 实际执行的安装/测试/类型检查/启动/媒体渲染命令及结果。
3. 页面截图或媒体产物可验证路径；Mock/Real 区分。
4. 遗留问题与下一阶段依赖；**完成本阶段后停止，不自动扩建下一阶段**。

## 2026-10-22 实施细化与风险

前置审查：Phase 00.5 的 24 个变更文件已核对，敏感扫描零发现、类型检查和 7 个单元测试通过；仅规范化构建日志空白后单独提交 `b79eab2c34509d6eaa5a6b74e392e1e9ddb2363e`。无远程推送。既有用户 DB、原件和会话不做批量搬迁。

实施顺序：
1. 先测试修订生命周期、旧版读取、双客户端冲突、幂等重放、依赖失效和任务取消/重试。
2. 添加独立 workflow 表（Artifact、Revision、Dependency、ApprovalEvent、Job、Outbox、RequestReceipt、AuditEvent）；追加 `0002_workflow`，保留 `0001_project` 与 Project JSON 契约。SQLite 使用相同逻辑实体的增量建表，不重写已有项目。
3. 所有写操作按项目加事务锁。批准、审计、幂等响应、下游 Job 与 Outbox 同事务；Worker 只消费提交后的 Outbox，以租约区分执行者，崩溃后标失败、用户可重试；不在 HTTP 内执行长任务。
4. 实现已有 API 草案中的 workflow/artifact/revision/job 路径，补充创建草稿和显式 Mock 任务入口；保护会话与 Origin，expectedVersion 失败 409。同键异内容 409，相同请求返回原结果。
5. 用真实后端状态接通总览、研究/文稿的最小文本审核面板，支持保存、提交、批准、驳回、fork、历史和依赖影响；其他阶段只显示已有任务/产物状态，不提前实现媒体模块。
6. 在隔离 SQLite/真实 PostgreSQL 上运行协议与 HTTP 测试、迁移升级和重复执行、旧 CRUD 回归、浏览器刷新验收、类型检查和生产构建；保存报告和截图。

具体规则：每类产物有一个当前候选和一个已批准指针。新候选不改变历史批准事实；批准新版本后，引用旧上游的下游修订派生为 stale，不能把 stale 写成审批状态。依赖固定精确 revisionId，同项目且无环；批准版内容与审批/审计事件不可覆写。创建/编辑草稿不自动批准。

Mock 仅提供研究/文稿文本，并永久携带 mock=true。用户手动内容标为未核实，不自动变成事实或授权凭证；编辑 Mock 文本不会去掉 Mock 标签。研究批准会排入文稿任务，文稿批准排入配音任务；未接通 Provider 的任务明确失败 PROVIDER_NOT_CONFIGURED，不生成假音频。后续媒体任务接口保留，不执行 TSX、下载、裁剪或渲染。

风险控制：事务冲突重试有上限；幂等键按项目和完整动作/内容校验；任务固定输入版本、最多 3 次执行，取消不回滚批准。项目旧 GET/PATCH 保持原有响应与 version；workflow 单独查询派生阶段，不将新状态强塞进旧 ProjectSchema。测试只对新数据库/新目录执行迁移和任务。回滚应用可继续使用旧项目 CRUD，新增 workflow 表和历史保留，不 DROP 数据。

- [x] 生命周期/并发/幂等/依赖/任务测试与服务。
- [x] 双数据库增量迁移和事务仓储。
- [x] API、独立 Worker 与最小审核 UI。
- [x] 真实 PostgreSQL、SQLite、浏览器、构建验收与交付。

验收证据和限制见 [PHASE_01_DELIVERY.md](../docs/PHASE_01_DELIVERY.md)。完成后停止，未进入 Phase 02。
