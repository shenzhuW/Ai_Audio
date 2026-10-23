# 参考仓库阅读与适配记录

> 本文件由 Codex 在各阶段填写。未阅读不得写成已验证。每条记录需标注查阅日期和可得的 commit SHA。

## 待阅读清单

| 阶段 | 仓库/文件 | 状态 | 结论与适配位置 | 许可/安全复核 |
|---|---|---|---|---|
| 01 | Hypit 包与 Run 设计 | REVIEWED (static) | 2026-10-22 固定版本阅读见下方记录，未运行 | 修改版 Apache，不复制或依赖 |
| 02 | Remotion Renderer/Player | REVIEWED；Renderer 实际通过，Player 仅研究 | 2026-10-23，固定 v4.0.538 / SHA 见下；[真实 MP4/双数据库/重复帧证据](PHASE_02_DELIVERY.md) | Remotion License，本地非商业技术评估；Player 不作任意代码入口 |
| 03 | wallstreet sourcing/新闻截图 | NOT REVIEWED | 待填写 | 待填写 |
| 05 | wallstreet 语音对齐 | NOT REVIEWED | 待填写 | 待填写 |
| 06 | wallstreet 导演/动画语法 | NOT REVIEWED | 待填写 | 待填写 |
| 07 | wallstreet footage.py | NOT REVIEWED | 待填写 | 待填写 |
| 08 | Remotion AI Starter / Hypit 组件 | NOT REVIEWED | 待填写 | 待填写 |
| 09 | wallstreet Review/MotionCheck | NOT REVIEWED | 待填写 | 待填写 |

## 2026-10-22 · Phase 00 / v1.3 上下文同步

仅阅读基础工程需要的概览和接口边界；以下参考均未在本次运行，无第三方源码复制，无新增 Hypit/Remotion 运行依赖。上表后续阶段的深入研究仍为 NOT REVIEWED。

| 参考与已读位置 | 核实的行为与适配结论 | 版本与运行证据 |
|---|---|---|
| [Hypit packages.md](https://github.com/hypit-ai/hypit/blob/main/docs/guide/packages.md)、[run.md](https://github.com/hypit-ai/hypit/blob/main/docs/quickstart/run.md) | 文档区分创作源、一次构建意图、Provider Endpoint 和结果仓库；显式选择复用结果。Phase 00 保留 Project/Provider/JobQueue/RenderWorker 分界，创建项目不自动启动任务。DAG、复用算法留 Phase 01，不采用 Hypit DSL 或渲染器。 | 远程 main 文档；未获得可靠 commit SHA；未运行；未审查 packages 内部实现，不声称已验证调度器。 |
| [Remotion AI Starter README](https://github.com/remotion-dev/template-prompt-to-motion-graphics-saas/blob/main/README.md)、[src/app/page.tsx](https://github.com/remotion-dev/template-prompt-to-motion-graphics-saas/blob/main/src/app/page.tsx)、[src/app/api/generate/route.ts](https://github.com/remotion-dev/template-prompt-to-motion-graphics-saas/blob/main/src/app/api/generate/route.ts)、[官方模板概览](https://www.remotion.dev/docs/ai/ai-saas-template) | 首页将 prompt/model 放进 URL，图片暂存 sessionStorage；生成入口有请求分类、按需知识、局部改写思路。借鉴输入校验、独立壳层和明确错误反馈。本项目改由服务层保存需求与文件，跳转永久项目 URL；不采用浏览器即时编译不可信代码。 | 远程 main；SHA 未取得；只静态阅读；没有调用模型或部署 Lambda。 |
| [Remotion use-current-frame.ts](https://github.com/remotion-dev/remotion/blob/main/packages/core/src/use-current-frame.ts)、Sequence.tsx 的类型/导入区域 | 当前帧由时间轴和 Sequence 上下文计算；当前已读函数包含相对偏移及播放速率。只用于确认 RenderWorker 接口需要固定输入、尺寸和 fps；不在 Phase 00 接入 Player 或声称完成 MP4。 | 远程 main；SHA 未取得；未运行。Sequence.tsx 未通读，不推断全部执行逻辑。 |
| [wallstreet-explainer README.md / SKILL.md](https://github.com/HeyChengC/wallstreet-explainer)、本地同名副本前 120 行及 LICENSE | 导演表围绕观众理解增量、一镜多句和词锚点组织；工具分别负责找片、语音和画面检查。当前仅保留相应工作区与服务端接口，asset 不是独立审批关卡。不采用其固定片长、16:9 偏好和截图序列主渲染链。 | 本地路径 `W:/a_study/Other/AI_Audio/life-tech-video-starter/wallstreet-explainer-main` 无 .git；SKILL.md SHA256 `0C0E8D761C26868E0EC4DFE5DF97C509B9C3F54708E74D180EE9B63E30BB6488`；未运行脚本。 |

### 许可与安全边界

- 实读 [Hypit LICENSE](https://github.com/hypit-ai/hypit/blob/main/LICENSE)：修改版 Apache 2.0 含多租户/托管服务、商业再分发及品牌信息限制；仅学习设计，不作为依赖或复制来源。
- 实读 wallstreet 本地 LICENSE：代码/文档 MIT；第三方样片画面、截图、商标和人物不包含在 MIT 授权中。本次未导入这些素材。
- 查看 [Remotion 许可 FAQ](https://www.remotion.dev/docs/license/faq)：许可与团队规模、自动化使用方式有关。当前不引入 Remotion；Phase 02 应按实际版本与使用主体重新核对，不沿用泛化的“免费/收费”结论。
- Remotion 模板的净化和浏览器编译不构成本产品要求的执行沙箱；本项目继续按架构约定使用隔离 Worker。

### 与现有实现的一致性分类

1. **立即处理**：统一真实项目和 Demo 的边界；未实现页面不能显示已生成/已批准/已核实。新 AGENTS.md 已将素材授权表述统一为凭证规则，原先冲突消除；当前代码无自动授权行为。
2. **本阶段处理**：补齐 CSS Modules、移动布局、浏览器/API 验收、项目设置并发冲突、输入/上传验证、运行说明与截图；明确记录本机 SQLite 适配器和 PostgreSQL 集成未验证差异。
3. **后续阶段处理**：ArtifactRevision / ApprovalEvent / DAG / Job 实体与幂等调度（01）、真实 Remotion PoC（02）、研究/配音/分镜/素材/隔离代码/导出（03–09）。不为参考项目增加新 MVP 功能。

### 当前工程差异

- 主架构仍指定 PostgreSQL + Prisma。当前环境无运行中的 PostgreSQL/Docker；本机验收使用 `node:sqlite` 的真实文件数据库仓储。权限调整后 Prisma 客户端生成与 schema 校验已通过；PostgreSQL schema、迁移与 Prisma 仓储已预留但尚未完成集成验证，不声称达到 PostgreSQL 验收。
- Phase 00 的 Project + ProjectInput 采用一个 Zod 校验的版本化聚合 JSON 存储；索引列保存 ID、owner、version 和更新时间。尚未建立产物/审批表。后续规范化迁移必须保留已有输入及 UUID，不可破坏性重建。
- `git status --short` 返回 `not a git repository`，本次没有初始化、提交或删除现有文件。

## 2026-10-22 · Phase 01 / 固定版本研究

通过 GitHub API 核实当时 main SHA：`0d36de9a9d17562fca0e478969b80eb1c16a7693`。已读 `docs/guide/packages.md` 和 `docs/quickstart/run.md` 的 Run/Results 部分，以及固定 SHA 下 [protocol/build.ts](https://github.com/hypit-ai/hypit/blob/0d36de9a9d17562fca0e478969b80eb1c16a7693/packages/protocol/src/build.ts) 前 85 行、[compiler/graph-query.ts](https://github.com/hypit-ai/hypit/blob/0d36de9a9d17562fca0e478969b80eb1c16a7693/packages/compiler/src/graph-query.ts) 和 [cli/result-query.ts](https://github.com/hypit-ai/hypit/blob/0d36de9a9d17562fca0e478969b80eb1c16a7693/packages/cli/src/result-query.ts)。尝试 `packages/result/src/record.ts` 得到 404，未声称已读；未运行 Hypit。

- Packages 区分创作输入、Provider 和结果仓储；Run 显式引用先前 Build 的具体输出，不自动推断复用。借鉴为固定 revisionId 的依赖边和任务输入、保留历史，避免持续读取 latest。
- build.ts 的已读区域区分图中的值与操作引用；graph-query.ts 沿输入关系遍历并用 visited 去重；result-query.ts 按仓储历史游标查特定输出。借鉴依赖遍历及可定位历史身份，不复制其实现。
- 本项目的批准/驳回、expectedVersion、事务幂等与 outbox 根据本项目协议实现；Hypit 的新 Build 机制不替代本产品的修订/审批语义，也不作为隐含幂等键。
- 复核 LICENSE：仍为修改版 Apache，包含托管/多租户、商业再分发及标识条款。本次无源码复制、无新增 Hypit 依赖；只采用设计思想。

## 2026-10-23 · Phase 02 / Remotion

固定版本 `4.0.538`，GitHub tag 对应 commit `5217b0c90623f2decb4575714fac89d3c4b69896`（GitHub API 实查）。安装 core/bundler/renderer 相同精确版本，未复制官方业务代码。

- 已读官方 [SSR](https://www.remotion.dev/docs/ssr)、[renderMedia](https://www.remotion.dev/docs/renderer/render-media)、[renderStill](https://www.remotion.dev/docs/renderer/render-still)、[useCurrentFrame](https://www.remotion.dev/docs/use-current-frame)、[OffthreadVideo](https://www.remotion.dev/docs/offthreadvideo)、[cancel signal](https://www.remotion.dev/docs/renderer/make-cancel-signal)。采用 bundle → selectComposition → renderMedia，视频和关键帧传同一 inputProps；基于帧计算动画并使用取消信号，不复制示例组件。
- 已读 [Player](https://www.remotion.dev/docs/player) 文档；静态检查固定 SHA 下 `packages/player/src/Player.tsx` 的 props 类型与校验区（43–58、155–162 等相关行），以及 `packages/renderer/src/render-media.ts` 的 inputProps/progress/cancel 类型定义（108–179 相关区域）。仅选择性阅读，不宣称完整审计整个仓库。学习显式 fps/尺寸/时长/props；第 08 页采用 Worker 输出的同一 MP4 原生播放，不加入同源任意 TSX 执行。
- 首轮真实 Worker 编译通过，但本机 Chromium 已移除旧 headless 模式，启动失败且 Job 正确留存日志。核对 [openBrowser](https://www.remotion.dev/docs/renderer/open-browser)、[Chrome modes](https://www.remotion.dev/docs/miscellaneous/chrome-headless-shell) 及已安装 `dist/open-browser.js` 的模式分支，统一配置 `chromeMode: chrome-for-testing` 使用新 headless 模式，再实际复跑；具体结果记录在 Phase 02 交付报告。
- 实读依赖自带 LICENSE.md 与 [许可 FAQ](https://www.remotion.dev/docs/license/faq)：此 PoC 为本地非商业适配评估；不能把 Remotion 当 MIT 或推断以后商业自动化免费。公开/商业使用之前按实际主体另行复核，不购买或规避许可。
- 未采用 Remotion 的项目管理/审批或模板业务状态，继续复用本项目 Workflow、Job、Outbox。Docker daemon 当前不可用，可信子进程不等于任意代码安全沙箱；未来自由 TSX 仍禁止。本轮不提前研究 Phase 07 全部源码，素材参考要求已随 D-17/D-18 同步到对应计划。

