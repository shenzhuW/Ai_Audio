# Phase 06 — AI 导演表和分镜审核

**边界**：这是本阶段目标，Codex 不得一次性开发后续所有功能。见 `docs/DECISIONS.md`、`docs/ARCHITECTURE.md`、`docs/UI_SPEC.md`。

## 参考仓库阅读与适配
开工前阅读 wallstreet-explainer `references/thinking.md`、`grammar.md`、`motion.md`；提炼叙事目标、镜头连续性及 2.5D 表达规则。 请将已核实结论、路径、日期与许可注意事项记录到 `docs/REFERENCE_REVIEW_LOG.md`。

## 输入与前置条件
- 已通过上一阶段的测试门禁；仓库 `AGENTS.md` 与原型资料可读。
- 若使用外部 Provider，密钥与许可条件由用户提供；未具备时明确演示 Mock。

## 本阶段开发任务
- 基于批准文稿和语音 Cue 生成初稿 DirectorShot：narrativeGoal、viewerTakeaway、scriptSegmentIds、durationFrames、layers、transition。
- 支持镜头重排、删除、新建和逐镜编辑；保持总时间轴连续并可重新计算。
- 先生成初稿并产生 VisualSearchIntent，再由 AssetEngine 回填候选画面，最终分镜审批必须包含素材使用方案。
- 第 06 页展示草图/样张、叙事目标、来源和推荐动画机制；用户能够改素材或选纯代码动画。
- 分镜整体提交批准；此阶段只写候选 sourceIn/sourceOut 的引用，不要求正式剪辑人工审核。

## 可验收交付物
- 120 秒 6 镜头 fixture 可真实保存/reorder/edit，并可挂 script segment 与 source media。
- 每个镜头都显示叙事目标和对应的文稿；调整镜头长度后 Cue/剩余时长有校验。
- 用户批准分镜后，后端产生固定 storyboardRevisionId；未授权素材在界面提示阻塞。

## Codex 必须报告
1. 修改文件、数据迁移和关键设计取舍。
2. 实际执行的安装/测试/类型检查/启动/媒体渲染命令及结果。
3. 页面截图或媒体产物可验证路径；Mock/Real 区分。
4. 遗留问题与下一阶段依赖；**完成本阶段后停止，不自动扩建下一阶段**。
