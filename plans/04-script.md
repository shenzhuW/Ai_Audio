# Phase 04 — 口播文稿写作、审核与事实绑定

**边界**：这是本阶段目标，Codex 不得一次性开发后续所有功能。见 `docs/DECISIONS.md`、`docs/ARCHITECTURE.md`、`docs/UI_SPEC.md`。

## 参考仓库阅读与适配
开工前阅读 wallstreet-explainer `SKILL.md` / `references/thinking.md`，提炼文稿与导演镜头语义关联约束。 请将已核实结论、路径、日期与许可注意事项记录到 `docs/REFERENCE_REVIEW_LOG.md`。

## 输入与前置条件
- 已通过上一阶段的测试门禁；仓库 `AGENTS.md` 与原型资料可读。
- 若使用外部 Provider，密钥与许可条件由用户提供；未具备时明确演示 Mock。

## 本阶段开发任务
- ScriptRevision/ScriptSegment/Claim 引用、编辑器（如 Tiptap）、段落增删排序、局部 AI 改写服务接口。
- 通过 CreativeBrief、获批准 ResearchRevision 生成文稿；用户从 script 起点创建则无需强制 Research。
- 显示预计总朗读时长与目标时长差值；提供编辑正文、调整节奏与分段建议。
- 编辑产生新草稿版，保留 stable segment IDs；每段提供查引用来源入口。
- 实现修订差异、提交、批准及 Claim 变更影响提示。

## 可验收交付物
- 在第 04 页编辑第二段、刷新后保留；提交/批准确定修订号，旧版完整可读。
- 来自未核实 Claim 的内容有标注，不得由 AI 直接虚构来源；跳过研究的文稿明确标记用户提供。
- 文稿改动触发对应 downstream stale 的可计算提示，而不是隐藏重做。

## Codex 必须报告
1. 修改文件、数据迁移和关键设计取舍。
2. 实际执行的安装/测试/类型检查/启动/媒体渲染命令及结果。
3. 页面截图或媒体产物可验证路径；Mock/Real 区分。
4. 遗留问题与下一阶段依赖；**完成本阶段后停止，不自动扩建下一阶段**。
