# Phase 06 — AI 导演表和分镜审核

**边界**：这是本阶段目标，Codex 不得一次性开发后续所有功能。见 `docs/DECISIONS.md`、`docs/ARCHITECTURE.md`、`docs/UI_SPEC.md`。

## 参考仓库阅读与适配
开工前阅读 wallstreet-explainer `references/thinking.md`、`grammar.md`、`motion.md`；提炼叙事目标、镜头连续性及 2.5D 表达规则。 请将已核实结论、路径、日期与许可注意事项记录到 `docs/REFERENCE_REVIEW_LOG.md`。

## 输入与前置条件
- 已通过上一阶段的测试门禁；仓库 `AGENTS.md` 与原型资料可读。
- 若使用外部 Provider，密钥与许可条件由用户提供；未具备时明确演示 Mock。

## 本阶段开发任务

### 本轮实施细化（2026-10-24，用户已批准）
- 基线0f2fa62，工作区干净，fetch后本地/远程0 0；只追加导演模块与0006两类快照表，不重写Workflow/Voice/Codex安全运行时，不迁移真实用户库。
- 固定当前有效已批准的结构化Script及VoiceTimeline，Voice须确认且属于同一Script；时间采用项目FPS（当前30）和半开帧区间，总帧数ceil(durationMs*fps/1000)。转场占当前镜头内部，不增加重叠时长。
- 镜头顺序和duration决定连续start/end；允许草稿明确显示未分配尾段，禁止越界/隐式空洞，提交须完整覆盖。保存/时长修改显示相邻镜头重算、剩余帧和Cue不匹配风险，不重写上游音频或模型时间。
- 真实Codex结构化生成，应用分配shotId允许集、冻结输入/Job版本/模型审计，服务端校验引用和时间；使用已验收数据分析工具门禁、搜索关闭，不执行模型代码。
- 视觉方案明确code/pending/bound。pending有VisualSearchIntent并保存后续检索需求，bound只引用固定研究的真实选用媒体/候选区间；许可未知/blocked不阻断内部测试，保留来源限制。没有Phase07批量检索/裁剪。
- 第06页镜头卡/图形草图、时间轴、逐镜编辑/增删排序、事实来源/Cue/限制查看，复用审批/Fork/历史差异/409缓冲。静默模式只显示计划范围，不伪造语音锚点。
- 测试驱动边界/身份/版本；独立SQLite和PG完整集成。提供真实120秒音频时间基准与六镜头可复现样例、真实AI调用、原始结果/审计、浏览器截图和Phase00–05相关回归。完成独立本地提交后停止，不推送/不进入07。
- 基于批准文稿和语音 Cue 生成初稿 DirectorShot：narrativeGoal、viewerTakeaway、scriptSegmentIds、durationFrames、layers、transition。
- 支持镜头重排、删除、新建和逐镜编辑；保持总时间轴连续并可重新计算。
- 先生成初稿并产生 VisualSearchIntent，再由 AssetEngine 回填候选画面，最终分镜审批必须包含素材使用方案。
- 第 06 页展示草图/样张、叙事目标、来源和推荐动画机制；用户能够改素材或选纯代码动画。
- 分镜整体提交批准；此阶段只写候选 sourceIn/sourceOut 的引用，不要求正式剪辑人工审核。

## 可验收交付物
- 120 秒 6 镜头 fixture 可真实保存/reorder/edit，并可挂 script segment 与 source media。
- 每个镜头都显示叙事目标和对应的文稿；调整镜头长度后 Cue/剩余时长有校验。
- 用户批准分镜后，后端产生固定 storyboardRevisionId；展示来源和已知限制，商业许可未知或不可商用不阻断内部测试素材绑定。

## Codex 必须报告
1. 修改文件、数据迁移和关键设计取舍。
2. 实际执行的安装/测试/类型检查/启动/媒体渲染命令及结果。
3. 页面截图或媒体产物可验证路径；Mock/Real 区分。
4. 遗留问题与下一阶段依赖；**完成本阶段后停止，不自动扩建下一阶段**。

## 本轮交付状态（2026-10-24）

本地实现及验收完成：66项单元、157组主流程/相关回归、类型/构建。真实120秒配音基准和两库真实六镜Codex样例见[交付报告](../docs/PHASE_06_DELIVERY.md)。独立本地提交后停止，不推送、不进入Phase07，等待审核。
