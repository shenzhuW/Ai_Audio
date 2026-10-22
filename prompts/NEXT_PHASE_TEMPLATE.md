# 后续每阶段启动词模板

请先阅读仓库根目录 `AGENTS.md`、`docs/DECISIONS.md` 以及本阶段相关的 API/数据/UI 文档，然后只执行 `plans/NN-具体文件名.md`。

- 先验证上一个阶段的验收门槛；确认后修改代码。
- 原型截图只是视觉参考，请交付可运行的交互、持久化和测试，而不是静态 HTML 视觉稿。
- 真实外部 Provider 暂未配置时使用统一 Adapter 的显式 Mock；不得伪造事实来源、授权凭证、TTS 或视频渲染结果。
- 涉及 AI 自由代码必须在隔离环境运行，用户手工审核内容决策，FFmpeg 裁剪等底层操作无需用户审批。
- 更新 `docs/CHANGELOG_IMPLEMENTATION.md` 和 `tests/ACCEPTANCE.md`。
- 完成后报告所有实际测试、演示视频/截图、变更文件和风险，停下来供我审核，不自动执行下一阶段。
