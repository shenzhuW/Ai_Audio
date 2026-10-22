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
