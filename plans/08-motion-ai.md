# Phase 08 — SceneSpec、组件库、Code Agent 与局部修复

**边界**：这是本阶段目标，Codex 不得一次性开发后续所有功能。见 `docs/DECISIONS.md`、`docs/ARCHITECTURE.md`、`docs/UI_SPEC.md`。

## 参考仓库阅读与适配
开工前阅读 Remotion AI Motion Starter、Hypit Packages 以及 wallstreet-explainer `scripts/stage25d.js`，比较组件目录、自由代码沙箱与分层摄像机效果。 请将已核实结论、路径、日期与许可注意事项记录到 `docs/REFERENCE_REVIEW_LOG.md`。

## 输入与前置条件
- 已通过上一阶段的测试门禁；仓库 `AGENTS.md` 与原型资料可读。
- 若使用外部 Provider，密钥与许可条件由用户提供；未具备时明确演示 Mock。

## 本阶段开发任务
- 定义 SceneSpec layer + Cue + EditableProps Schema，区分可参数化组件与自由 TSX；第 08 页与数据协议一致。
- 初版组件库含 KineticText、BarChart、VideoLayer、ImageLayer、Subtitle、BasicCamera、SpotlightAnnotation；保留受测源码和截图。
- Code Agent Adapter 能按镜头生成隔离可运行的代码，优先组件目录，不满足时生成自定义 TSX；实际产品运行时是否采用 Codex SDK 需单独安全 PoC。
- 集成 typecheck、代码约束校验、关键帧预览、视频预览、场景日志；高风险自由代码在独立容器运行。
- 支持修改指定 SceneSpec/ComponentProps、局部重建，保持其余镜头输入修订和媒体复用。
- 自动修复限定最多三轮（配置化），每轮保留代码修订及测试结果。

## 可验收交付物
- 至少 3 个不同动画组件被真实渲染到一段带视频底图的样片中。
- 通过第 08 页更改图表颜色或字幕参数，仅对应 SceneCode / RenderPreview 更新。
- 代码编译失败显示准确错误；并发/重试/资源预算可查；主 API 环境无法读取/执行用户自由 TSX。

## Codex 必须报告
1. 修改文件、数据迁移和关键设计取舍。
2. 实际执行的安装/测试/类型检查/启动/媒体渲染命令及结果。
3. 页面截图或媒体产物可验证路径；Mock/Real 区分。
4. 遗留问题与下一阶段依赖；**完成本阶段后停止，不自动扩建下一阶段**。
