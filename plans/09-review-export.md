# Phase 09 — 成片审查、质量门禁与交付

**边界**：这是本阶段目标，Codex 不得一次性开发后续所有功能。见 `docs/DECISIONS.md`、`docs/ARCHITECTURE.md`、`docs/UI_SPEC.md`。

## 参考仓库阅读与适配
开工前阅读 wallstreet-explainer `references/review.md`、`scripts/motion_check.py` 和 Remotion Renderer，结合静帧、运动指标和人工审核。 请将已核实结论、路径、日期与许可注意事项记录到 `docs/REFERENCE_REVIEW_LOG.md`。

## 输入与前置条件
- 已通过上一阶段的测试门禁；仓库 `AGENTS.md` 与原型资料可读。
- 若使用外部 Provider，密钥与许可条件由用户提供；未具备时明确演示 Mock。

## 本阶段开发任务
- 第 09 页实现真实视频预览、版本及时间轴评论、按镜头局部修复请求、状态追踪、版本对比。
- QA: 静态帧溢出/媒体缺失/黑帧、字幕基本同步、音量、许可门禁；主观视觉评审可 Mock 并清楚显示。
- 导出服务冻结所有批准修订到 RenderManifest，并触发真实视频 RenderJob；输出实际 MP4、SRT、文稿、来源/授权清单及合规源代码包。
- 第 10 页提供导出任务进度/失败重试/安全下载，禁止一键社交平台发布。
- 整体 10 页跑通样例端到端：用户自定义时长、研究/文稿审核、配音、分镜与素材、真实动画及正式导出。

## 可验收交付物
- 审核评论能准确定位 renderRevisionId + timeMs；修复产物有可读的新版本，保留旧预览。
- 合法测试素材生成的 MP4 可播放，FFprobe 元信息与请求一致；导出的字幕、文稿、工程与冻结修订一致。
- 无许可素材阻断正式 MP4，不允许绕过。恢复/重试/幂等/预算等端到端用例通过。
- 将所有真实测试证据录入 tests/ACCEPTANCE.md 和 docs/CHANGELOG_IMPLEMENTATION.md。

## Codex 必须报告
1. 修改文件、数据迁移和关键设计取舍。
2. 实际执行的安装/测试/类型检查/启动/媒体渲染命令及结果。
3. 页面截图或媒体产物可验证路径；Mock/Real 区分。
4. 遗留问题与下一阶段依赖；**完成本阶段后停止，不自动扩建下一阶段**。
