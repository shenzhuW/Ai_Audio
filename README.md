# AI Code Video Studio — Codex 开发交接包 v1.3

**用途**：以用户确认的产品需求和 10 页面 v2 原型逐阶段开发。文档基线 v1.3，整理日期：2026-10-22。

## 当前实现状态：Phase07 本地交付完成，等待审核

Phase00–06及Phase04.5候选补充已正式验收，批准基线为 `34d8841`。Phase07增加真实本地/NASA/Commons素材检索、Top-K Codex视觉匹配、带PTS的索引/联系表、独立逐镜绑定及FFmpeg缓存准备；可信Remotion PoC可使用PreparedAsset，不开放自由TSX。实际结果见[交付报告](docs/PHASE_07_DELIVERY.md)、[配置与边界](docs/ASSET_ENGINE_SETUP.md)及[证据索引](docs/evidence/phase07/README.md)。本阶段只建立本地提交，不推送、不进入Phase08。

导演API与`pnpm worker`使用相同数据配置并显式启用`STUDIO_CODEX_ENABLED=1`，复用已有固定CLI登录，不复制Token。未配置明确失败，Mock单独标记。素材pending只是待匹配，SVG只是示意；不在本阶段自动找片/裁剪或执行自由TSX。系统TTS不是云端神经模型，Whisper/对齐精度限制及Windows异常UNCONFIRMED继续保留。

先阅读 [Phase 01 交付报告](docs/PHASE_01_DELIVERY.md)、[工作流运行说明](docs/WORKFLOW_IMPLEMENTATION.md)、[本地运行说明](docs/LOCAL_DEVELOPMENT.md)、[PostgreSQL 说明](docs/POSTGRESQL_LOCAL.md) 和 [验收记录](tests/ACCEPTANCE.md)。旧阶段报告保留为当时记录。以下交接包介绍保留作原始研发背景，实际开发进度以实施日志为准。

```powershell
# Node.js >= 22.13（本次使用 24.15.0），pnpm 10.34.4
pnpm install
pnpm db:generate
pnpm dev
# 打开 http://127.0.0.1:3000/projects/new
# 另一个终端使用相同数据配置，启动文本任务 Worker（Codex启用见本地说明）
pnpm worker
# 研究文件的真实元数据/文本/浅索引，使用同样的数据目录/数据库环境
pnpm research:worker
# 第 08 页真实渲染：另一个终端使用相同数据库/数据目录配置
$env:STUDIO_TRUSTED_LOCAL_RENDER='1' # 仅运行仓库内可信预置组件
$env:STUDIO_CHROMIUM_PATH='C:/path/to/chrome.exe' # 替换为实际路径
pnpm render:worker
pnpm typecheck
pnpm test
```

默认本机数据位于 `apps/web/.data/`。从项目根目录执行命令；无需 API Key、Docker 或 PostgreSQL 即可检查本地项目功能。部署数据库仍为 PostgreSQL + Prisma，本机 SQLite 仅为独立开发适配器。

## 30 秒了解项目
第一版聚焦科技、财经、知识科普解说：用户自定义视频时长，通过多模态资料研究、口播稿审核、配音/词级时间轴、导演分镜/素材匹配、内部测试素材自动裁剪、React/SVG/Canvas 动画叠加、Remotion 渲染、质量审查和源码/MP4 导出制作视频。用户可查看、编辑、批准重要创作产物；裁剪、抽帧、转码等技术任务自动执行。

**不是**“上传 Prompt 一次生成 MP4”，也不是静态 SaaS 原型。图像/视频素材必须明确可合法使用；研究数据/授权状态不可伪造。

## 放到本地仓库的布局
```text
ai-code-video-studio/
├── AGENTS.md                       # Codex 全局项目指令
├── README.md                       # 你正在看的文档
├── .env.example                    # 未来运行配置示例（无密钥）
├── prototype/
│   ├── index.html                 # 静态可导航 v2 原型
│   ├── screens/01-create.png ... 10-export.png
│   └── assets/                    # 图片资产，仅供原型参考
├── docs/
│   ├── REFERENCE_PROJECTS.md        # Hypit / wallstreet-explainer / Remotion 等参考仓库（新增）
│   ├── REFERENCE_REVIEW_LOG.md      # Codex 分阶段源码阅读记录（新增）
│   ├── DECISIONS.md               # 已确认需求，最高产品级优先级
│   ├── PRD.md                     # 业务需求、用户流程、MVP
│   ├── UI_SPEC.md                 # 每个页面的交互细则
│   ├── ARCHITECTURE.md            # 模块划分与部署
│   ├── DATA_MODELS.md             # 实体、修订及状态约束
│   ├── API_SPEC.md                # HTTP API 设计
│   ├── WORKFLOWS.md               # 人工审核、依赖重建
│   ├── ASSET_RESEARCH_SPEC.md     # 两阶段资料/素材检索
│   ├── MOTION_SCENE_SPEC.md       # 场景/图层/动画代码协议
│   ├── SECURITY_QUALITY.md       # 沙箱、安全、事实/版权、测试
│   ├── TRACEABILITY.md           # 页面 → 功能 → API → 阶段
│   ├── CODEX_PLAYBOOK.md         # Codex 迭代执行方法
│   └── CHANGELOG_IMPLEMENTATION.md  # Codex 后续填写的实施日志
├── fixtures/example-project.json  # 明确标注模拟的 120s / 6 镜头项目
├── plans/00-foundation.md ... 09-review-export.md
├── prompts/START_CODEX.md        # 第一条发给 Codex 的指令
├── prompts/NEXT_PHASE_TEMPLATE.md
└── tests/ACCEPTANCE.md           # 从 NOT RUN 开始的验收表
```

## 立即让 Codex 开始

1. 新建**本地空 Git 仓库** `ai-code-video-studio`，将本交接包全部内容解压到仓库根目录。不要只导入原型截图；确保 `AGENTS.md` 位于根目录。
2. 在 Codex 桌面 / IDE / CLI 中打开**仓库根目录**，不要只打开 `prototype/`。
3. 将 `prompts/START_CODEX.md` **完整复制给 Codex**；它只执行 **Phase 00**。
4. Codex 交付后先检查 `pnpm dev` 实际启动的 10 页路由、真实 Project 创建/保存、类型检查和测试日志，再决定进入 Phase 01。
5. 后续使用 `prompts/NEXT_PHASE_TEMPLATE.md` 并明确 `plans/NN-xxx.md`。

上面的步骤是初次交接说明；当前目录已有实现、本地 Git 与验收历史，不应重复初始化或覆盖。

## 两种下载包
- `AI_Code_Video_Studio_Codex_交接包_v1.3_含原型.zip`：自包含完整原型+全部文档。**推荐**。
- `AI_Code_Video_Studio_Codex_文档包_v1.3.zip`：只有文档、计划、测试与提示词。若你本地已经有 v2 原型，可将原型复制进 `prototype/` 后使用。

## 必须保持一致的产品要求
- 用户自由输入时长；`120s/6 镜头` 是 UI 测试夹具，**不是硬性限制**。
- 研究前期只做内容理解和时间索引，不提前批量正式剪辑；导演分镜确认后才自动按需裁剪；**不额外审核 FFmpeg 操作**。
- 研究/文稿/配音方案/分镜和成片均可审阅；草稿/提交/批准相互区分，批准修订不可直接覆写。
- 内部测试图片与视频 + 程序化画面/动画叠加；组件库优先，特殊场景自由生成代码但必须隔离执行。
- 按 D-17/D-18，商业许可未知或不可商用不自动阻断内部候选、分镜、合成与 MP4 下载；保存来源 URL、平台、作者和已知限制，不建设商业许可审批、不自动公开发布，商业发布核查留后续。
- Codex 是**开发工具**；产品运行时 Code Agent 是否采用 Codex SDK 需要真实 PoC 后再定。
- 没有配置真实模型/素材提供商时允许 Mock，但所有 Mock 结果必须显著标识。

## 前面讨论的代码仓库（新增，按阶段要求 Codex 查阅）
- Hypit：https://github.com/hypit-ai/hypit — 产物与依赖管理、工程编排（**注意修改版 Apache 许可**）。
- wallstreet-explainer：https://github.com/HeyChengC/wallstreet-explainer — 导演表、找片/联系表、词级时间锚点、2.5D 和质量审核。
- Remotion：https://github.com/remotion-dev/remotion — 视频合成、预览、编码和组件。
- Remotion AI Motion Starter：https://github.com/remotion-dev/template-prompt-to-motion-graphics-saas — AI 生成 Remotion 代码/预览交互参考。

请先阅读 **`docs/REFERENCE_PROJECTS.md`** 中的具体链接、阶段阅读矩阵和版权约束；不是要求在 Phase 00 克隆全部仓库。

## 技术核对与参考
- Codex `AGENTS.md` 行为：https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide
- Remotion Player：https://www.remotion.dev/docs/player
- Remotion API：https://www.remotion.dev/docs/api
- Remotion 授权 FAQ：https://www.remotion.dev/docs/license/faq
- FFmpeg：https://ffmpeg.org/

**提示：** `docs/DECISIONS.md` 是明确确认过的产品要求；工程其余文件是可验证的实施建议。Codex 不得未经用户同意擅自改变产品定位与第一版范围。
