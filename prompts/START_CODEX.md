# 复制以下内容作为发给 Codex 的第一条开发指令

你正在实现一个真实的 Web 产品：AI Code Video Studio。当前仓库包含用户确认的产品决策和 10 页面 v2 原型。请先阅读 `AGENTS.md`、`docs/REFERENCE_PROJECTS.md`（Phase 00 只读总览，不需克隆参考仓库）、`docs/DECISIONS.md`、`docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/UI_SPEC.md`、`docs/DATA_MODELS.md`、`docs/API_SPEC.md`，并查看 `prototype/screens/01-create.png`、`prototype/screens/02-overview.png`、`prototype/index.html`。然后执行 **`plans/00-foundation.md`**，不推进 Phase 01 或后续。

关键约束：
1. 这是**实际应用开发**，不是再制作一份静态原型。不要把 PNG 图片作为整个页面，也不要用静态按钮/模拟状态冒充后端已工作。
2. 开发环境为 TypeScript + Next.js + PostgreSQL（可选择一个 ORM 并说明取舍）。初始化工程、配置本地启动和测试；实现 10 个页面的真实路由及共享 UI 壳层，功能未完成的页面明确显示“尚未实现/演示”。
3. 本阶段真实完成 Project 创建、列表、详情、项目保存、自由目标时长、画幅与三种创作入口。用户可自定义正数时长，示例中的“02:00 / 6 镜头”不是产品限制。
4. 原型是视觉参考，研究资料、授权、数据、预算全部是样例；禁止将“已核实”“已授权”“AI 已生成”等静态文案当实际结果。
5. 外部研究、TTS、素材查询、Code Agent 暂时只定义可替换 Provider 接口，不要求现在全部实现。不要未获批准安装或购买商业服务。
6. 结构应为模块化单体 API + 独立 Worker 的可扩展基础；不要第一阶段创建一堆微服务、云部署或复杂队列。
7. 不擅自部署、推送代码、提交秘密、修改产品决策，或一次性做完所有 10 个阶段。

请先给出一份可执行的简短 Phase 00 实施计划，然后直接在仓库实施、运行类型检查和测试，尽可能实际启动页面验证。完成后在 `docs/CHANGELOG_IMPLEMENTATION.md` 记录执行情况，回复：新增/修改文件、运行步骤、测试结果、截图位置、尚未完成之处。最后停止，等待我审查这一阶段。
