# Codex 开发执行手册

## 1. 开发方式：先纵向闭环，再扩展模块
- 以 Codex 为首要开发工具：Codex 写代码、建数据库、实现界面、集成 Remotion、补测试及更新文档。**产品运行时要不要用 Codex SDK 仍需 PoC**，不得将开发会话直接当作视频生成服务。
- 每次只给 Codex 一项有独立验收的任务。强制落地真实业务服务，不要让它只画静态 UI。
- 各阶段开工前按 `docs/REFERENCE_PROJECTS.md` 阅读对应 GitHub 源码，记录在 `docs/REFERENCE_REVIEW_LOG.md`；不要求 Phase 00 一次性克隆所有参考仓库。
- 每阶段使用同一仓库、同一 `AGENTS.md` 和版本化决策文件；完成阶段后由用户审核，再开始下一阶段。

## 2. 推荐的任务节奏
1. 在 Git 仓库根目录打开 Codex，确认可访问 `prototype/` 以及 `AGENTS.md`。
2. 发 `prompts/START_CODEX.md` 第一条指令，开始 Phase 00。
3. Codex 完工提交工作报告（*实现文件*、*启动命令*、*真实测试结果*、*截图/可访问路径*、*未完成项*）。
4. 用户打开应用并验证；不通过则只处理当前阶段问题；通过后开始 `plans/01-...`。
5. 若外部 API 未配置，系统提供明确 Mock；直到真实 Provider 接入，不得宣称“AI 研究/生成已上线”。

## 3. 每阶段给 Codex 的简洁指令模板
```text
请按 AGENTS.md 开始 plans/NN-xxx.md。
先阅读 docs/DECISIONS.md、对应 API/DATA/UI 章节以及原型截图。
仅实现本阶段列出的 P0 范围，不跨阶段开发。
对外部服务使用可替换 Provider Adapter；未提供密钥时提供明确标记的 Mock。
实现后运行类型检查、单元/集成测试，实际启动并检查页面/接口；在 docs/CHANGELOG_IMPLEMENTATION.md 记录结果。
最后报告文件变更、执行命令、通过/失败测试、未解决事项，然后停止。
```

## 4. 遇到风险如何处理
- Schema/决策冲突：停下当前破坏性修改，列冲突、推荐方案与影响，等待用户批准。小范围纯技术问题可在文档记录选择后继续。
- Remotion/第三方许可未确认：可以开展本地 PoC，不得擅自公开部署商业服务或再分发第三方素材。
- 不能运行浏览器、外部 Provider 无密钥或缺 FFmpeg：如实记录测试未执行/阻塞；不能把 Mock 输出称为真实执行。
- 非当前任务的复杂功能：记录为后续 issue，不顺手实现大型重构。

## 5. 标准变更报告（让 Codex 每阶段都输出）
```text
Phase：
新增/修改文件：
已实现用户可见行为：
数据库迁移：
运行命令及环境要求：
测试命令与实际输出：
截图/渲染样片路径：
使用了哪些 Mock / 实际 Provider：
已知限制、风险、下一阶段阻塞：
```

## 6. 依赖与许可参考（实施时复核最新版）
- Codex AGENTS.md：https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide
- Remotion Player：https://www.remotion.dev/docs/player
- Remotion Node Renderer：https://www.remotion.dev/docs/api
- Remotion License FAQ：https://www.remotion.dev/docs/license/faq
- FFmpeg：https://ffmpeg.org/ffmpeg.html
