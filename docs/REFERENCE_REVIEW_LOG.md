# 参考仓库阅读与适配记录

## 2026-10-24 · Phase06 Director

实读wallstreet-explainer固定commit `920ed1d3b3ecb5997d861902e2719dda6688c0b1` 的 `references/thinking.md`（blob `eeee222c837b03b5de773ca39ea96c307a401882`）、`references/grammar.md`（`4755a70917bf576ef30fd850328a02d24ba83c83`）、`references/motion.md`（`598e7afcf793059fd5205b5d47e8f6f8c6129c28`），再次读LICENSE（`7e2580e1d5b8410309b4d16b670bd16394438344`）。链接均可用 `https://github.com/HeyChengC/wallstreet-explainer/blob/<commit>/<path>` 定位。只阅读当前阶段文档，没有执行参考脚本或复制源码/样片。

- thinking：镜头需要同时让观众认出对象、理解关系并接上口播；narrativeGoal/viewerTakeaway与Script段落绑定分别保存。坚持同一解释对象与一个画面主焦点，冲突/未核实事实不因画面设计被升级。
- grammar：切点要交代上一镜留下什么、下一镜看什么及共享对象；适配为transition.continuity与推荐机制，转场不改变批准配音/字幕时间。多段一镜/一段多镜，镜头不能机械等于每句或每个Cue。
- motion：运动服务解释，2.5D层级/视差/目标运镜和原地状态变化比无差别元素入场更清晰。适配为分层role/depth、composition、animation.mechanism/reason，当前只预览受约束图形草图，不运行任意TSX，不宣称已经产出最终2.5D动画。
- 不把参考的2秒B-roll、固定漂移速度或统计指标变成本项目硬门槛；120秒六镜头是可复现验收样例，不限制项目时长或镜头数量。参考提供的事实/样片不进入本项目资料允许集。
- LICENSE为MIT，第三方新闻/照片/Logo/视频明确排除。只借鉴设计方法，自行实现持久化/审批/Job，不引入参考渲染器/素材下载器。D-17/D-18仍有效，未知商业许可不阻断内部候选，但不绕过访问保护、不自动公开发布。

## 2026-10-24 · Phase05 Voice

实读固定SHA `920ed1d3b3ecb5997d861902e2719dda6688c0b1` 的 wallstreet-explainer [scripts/temp_voice.py](https://github.com/HeyChengC/wallstreet-explainer/blob/920ed1d3b3ecb5997d861902e2719dda6688c0b1/scripts/temp_voice.py)，blob `f0761cabfbd1a97804c3a19c9db506ea1326691d`；复核此前固定LICENSE为MIT。没有执行其edge-tts/faster-whisper脚本、复制源码或引入其样片素材。

- 临时声轨用edge-tts的WordBoundary事件；正式`.final.wav`替换时会重新ASR；切除头部静音后同步修正时间，不默认事后加速。可借鉴“声轨变化使时间重新核对”，本项目保留不可变音频Blob/Hash及修订依赖，不以文件存在判断缓存身份，也不覆写正式旧文件。
- `char_times`把词分摊到字符、SequenceMatcher匹配并对空洞插值；这些派生位置不能直接称精确强制对齐。重复词改用固定scriptRevisionId/segmentId、UTF-16范围及段落SHA绑定，时间另存来源/方法与稳定anchorId。字幕可独立编辑，一个段落允许多个Cue，不等于多个镜头。
- 已检测本机System.Speech两个已安装声线，用中文Huihui实际输出9.601451秒PCM WAV；[Microsoft官方接口](https://learn.microsoft.com/en-us/dotnet/api/system.speech.synthesis.speechsynthesizer)确认按安装声线选择、Speak文本到Wave文件。只调用已安装系统组件，不复制/分发语音引擎，不把系统语音称为神经模型。外部API Key未配置，[OpenAI Speech文档](https://developers.openai.com/api/docs/guides/text-to-speech)的独立音频API不等于既有Codex数据CLI权限。
- 用户追加真实中文ASR与强制对齐必验。已实读 [stable-ts官方README/Alignment](https://github.com/jianfch/stable-ts#alignment)、[alignment.py](https://github.com/jianfch/stable-ts/blob/main/stable_whisper/alignment.py)及[Whisper官方仓库](https://github.com/openai/whisper)。两者声明MIT；stable-ts官方仓库已归档，需固定版本并记录风险。实际使用Whisper识别与stable-ts给定文本的词级模型对齐，不用字符插值或均分替代；双库成功结果及精度边界见Phase05交付与真实运行日志。

> 本文件由 Codex 在各阶段填写。未阅读不得写成已验证。每条记录需标注查阅日期和可得的 commit SHA。

## 2026-10-23 — Phase 04.5 候选 Claim 结项补充

复读 Phase03 已固定的 wallstreet-explainer `920ed1d3b3ecb5997d861902e2719dda6688c0b1` 本地副本 `references/sourcing.md` 的“新闻原文”段落：借鉴来源可追溯与定位的分离，当前进一步将 source/index/hash/精确引文固定到任务。没有运行其采集脚本、复制第三方代码或新增下载能力。来源截图/模型摘要仍不能代替实际原文；匹配位置也不等于核实。CLI 继续使用上述已核验0.163.0安全门禁，未更改权限、模型工具或认证处理。候选分析关闭搜索；主链路用公开 FFmpeg 文档实际获取结果，冲突专项用明确标为虚构记录的自制原文。许可证判断仍沿用原记录，不新增第三方依赖。

## 2026-10-23 — Phase 04.5 — Codex CLI / SDK 数据分析

- 本机实际CLI为0.163.0，ChatGPT登录已确认；未读取/打印auth.json或Token。实读官方[非交互](https://learn.chatgpt.com/docs/non-interactive-mode)、[SDK](https://learn.chatgpt.com/docs/codex-sdk)、[配置](https://learn.chatgpt.com/docs/config-file/config-reference)、[额度](https://learn.chatgpt.com/docs/pricing)。登录可由exec复用，但调用消耗账号额度，模型/套餐/任务/周限制可能不同；exec事件只提供本次token，未提供剩余额度，记unknown；不承诺免费，不自行购买服务。
- 固定[rust-v0.163.0工具注册](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/core/src/tools/spec_plan.rs)，blob `fd5b5e14eeeb57b5be78af53d3f855702167dcc7`：shell_tool关闭只移除命令工具；patch按model_info独立注册；CodeModeOnly即使无MCP服务器仍加入三个资源辅助入口。对应[测试](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/core/src/tools/spec_plan_tests.rs) blob `1a8a0661878c6e847b5ed61c80c328c1444afc29`核对了关闭命令工具的注册断言。
- [配置Schema](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/core/config.schema.json)，blob `4aba1bab6cd2cbcc179a5de802731f2775c6bc88`：确认model_catalog_json、features、skills、权限与搜索配置字段。自建固定模型catalog只降低工具能力，不复制/修改Codex源码或认证实现。按实际生效catalog再次核对shell disabled、patch null、扩展工具空。
- [Code Mode Host](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/code-mode-host/src/lib.rs)及[Runtime Cargo](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/code-mode-runtime/Cargo.toml)，后者blob `5a4d9e1d0930806689a04bc5857b177656bd775b`包含V8 sandbox特性；执行处理器/Delegate核对通过注册工具集转发。实际诊断确认没有process/require/fetch/Deno，node:fs导入被拒绝，不以模型自述替代配置/源码检查。未声称任意代码OS沙箱已验证。
- 一次安全门禁因三个MCP辅助入口判失败；随后核查本机有2项MCP配置（未保存名称/连接/凭据），增加逐项disabled覆盖和启用数0预检。空表不清除已有配置，不能依赖此假设。辅助入口仍列出但没有服务器，明确保留这一边界。最初失败记录保留，不算真实搜索/视觉失败后的Mock替代。
- npm实际查询SDK最新版0.164.0、Apache-2.0；实读[rust-v0.164.0 exec.ts](https://github.com/openai/codex/blob/rust-v0.164.0/sdk/typescript/src/exec.ts)，blob `e1735d2c764fdba636bc2ff3bc834c13119bce3c`，以及codexOptions/threadOptions和LICENSE。SDK底层仍spawn CLI，支持signal、图片、Schema、configOverrides，但未提供本桥接依赖的ignore-user-config/ignore-rules/ephemeral开关，Windows整树取消也需宿主管理。因此优先评估后暂留CLI传输，不引入SDK依赖；SDK只做静态研究，未宣称已运行SDK。暂无持久会话/审批需要，不引入常驻app-server。
- CLI真实PoC已完成live搜索、Schema文稿、图片、3333ms视频帧；Worker/双库的最终状态以[Phase04.5交付](PHASE_04_5_DELIVERY.md)为准。引用/网页原文由独立受限获取器核对，不借用Codex摘要作原文。
- Codex官方源码/LICENSE为Apache-2.0（LICENSE blob `4606e72e042564097e8780d66c1d4dcb611869bd`），本次没有复制第三方源码或打包CLI/SDK；仅调用用户已有安装。账号服务条件独立于软件源码许可；正式分发CLI/SDK需再核对NOTICE和许可要求。参考wallstreet已研究的“来源优先/证据分层/段落叙事”沿用，不为此重写已验收流程。

## 分阶段阅读状态

| 阶段 | 仓库/文件 | 状态 | 结论与适配位置 | 许可/安全复核 |
|---|---|---|---|---|
| 01 | Hypit 包与 Run 设计 | REVIEWED (static) | 2026-10-22 固定版本阅读见下方记录，未运行 | 修改版 Apache，不复制或依赖 |
| 02 | Remotion Renderer/Player | REVIEWED；Renderer 实际通过，Player 仅研究 | 2026-10-23，固定 v4.0.538 / SHA 见下；[真实 MP4/双数据库/重复帧证据](PHASE_02_DELIVERY.md) | Remotion License，本地非商业技术评估；Player 不作任意代码入口 |
| 03 | wallstreet sourcing/新闻截图 | REVIEWED（源码静态阅读，未运行第三方脚本） | 2026-10-23，固定 `920ed1d3b3ecb5997d861902e2719dda6688c0b1`，适配见下 | MIT；示例新闻/视频素材不受源码许可覆盖 |
| 04 | wallstreet SKILL / thinking | REVIEWED（静态阅读，未执行第三方脚本） | 2026-10-23，固定同一 SHA；叙事目的、观众收获、视觉意图与事实引用见下 | MIT；不复制代码/样片，不采用外部技能的额外审批流程 |
| 05 | wallstreet temp_voice.py / Whisper / stable-ts | REVIEWED；本地模型实际运行 | 2026-10-24 记录见本文开头；临时/正式分离、真实模型时间及范围映射 | MIT；不复制参考代码，stable-ts归档风险 |
| 06 | wallstreet thinking/grammar/motion | REVIEWED（固定SHA静态实读） | 2026-10-24，叙事/连续性/2.5D，见顶部 | MIT，未复制源码/样片或执行参考脚本 |
| 07 | wallstreet footage.py | NOT REVIEWED | 待填写 | 待填写 |
| 08 | Remotion AI Starter / Hypit 组件 | NOT REVIEWED | 待填写 | 待填写 |
| 09 | wallstreet Review/MotionCheck | NOT REVIEWED | 待填写 | 待填写 |

## 2026-10-23 · Phase 04 / 文稿叙事

通过 GitHub API 核实 main 仍为 `920ed1d3b3ecb5997d861902e2719dda6688c0b1`，全文读取固定版本 [SKILL.md](https://github.com/HeyChengC/wallstreet-explainer/blob/920ed1d3b3ecb5997d861902e2719dda6688c0b1/SKILL.md)、[references/thinking.md](https://github.com/HeyChengC/wallstreet-explainer/blob/920ed1d3b3ecb5997d861902e2719dda6688c0b1/references/thinking.md) 与 LICENSE。只研究设计，没有复制源码、样片或运行其工具。

- SKILL 的文案/导演表区分台词、画面承担、观众理解和承接，一镜可包含多句话；thinking 第 1/3/10 节强调快速进入主题、沿同一对象解释因果，每段让观众获得具体新理解。适配为段落 purpose（钩子/背景/解释/证据/承接/总结）、viewerTakeaway 和非强制 visualIntent；段落与后续镜头保持多对多，不生成一行一句一镜的硬约束。
- thinking 第 2/7/8 节强调承接和铺垫、原声背景及可读停留。当前只保存叙事/节奏说明和粗略停顿，不用估时冒充真实词级音频锚点，不提前建设导演表或配音。
- thinking 第 4/5 节强调可质疑事实的原文与数字单位/年份。适配为固定批准 ResearchRevision 的 Claim/Source 引用和日期/口径/冲突提示；不因为画面效果改事实，不虚构来源，局部改写也校验引用范围。
- SKILL 的固定 1–3 分钟、16:9、多个钩子粗剪和各站人工确认不是本产品的新要求；本产品自定义时长/画幅、已批准阶段范围和用户推迟人工体验的决定优先。实际视觉生成/镜头运动规则留后续阶段。
- MIT 许可不覆盖 examples 中第三方新闻/照片/视频；本轮不新增外部源码依赖或第三方素材。参考思想重写本产品逻辑，未将命令行技能直接作为运行时 Agent。

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

## 2026-10-23 · Phase 03 / 来源与轻量内容索引

GitHub API 已核实 wallstreet-explainer 当时 main SHA 为 `920ed1d3b3ecb5997d861902e2719dda6688c0b1`，实读固定 SHA 的 [references/sourcing.md](https://github.com/HeyChengC/wallstreet-explainer/blob/920ed1d3b3ecb5997d861902e2719dda6688c0b1/references/sourcing.md)、[scripts/snap_news.mjs](https://github.com/HeyChengC/wallstreet-explainer/blob/920ed1d3b3ecb5997d861902e2719dda6688c0b1/scripts/snap_news.mjs) 和 [LICENSE](https://github.com/HeyChengC/wallstreet-explainer/blob/920ed1d3b3ecb5997d861902e2719dda6688c0b1/LICENSE)。固定副本保存在忽略目录 `.cache/reference-phase03/`。没有运行其网络采集脚本，也没有复制其源码。

- sourcing 的新闻原文/原声章节把证据定位与说明性画面分开；字幕时间码可作为查找位置，不应当作真实事件的自动证明。本项目使用 Source + ClaimEvidence.locator/quote/role 保存依据，视频只做稀疏抽帧与时间索引，正式裁剪留 Phase 07。
- snap_news 的 `loadPlaywright`、`strip`、逐页导航与 `p.evaluate` 采集逻辑，将 URL、标题、标题框和按行关键词矩形一起登记；先等待字体再测量/截图，避免视觉标注漂移。可借鉴结构化位置与快照来源的绑定；本阶段先实现 PDF 页码、文本引用、图像说明、视频时间码，不把页面截图等同原文或事实核验。
- 该脚本按域名过滤和移除浮层，会改变原页面；访问失败后仍继续采集，也可能得到不完整页面。本产品不继承此行为，不绕过访问保护、不执行远程页面或把受阻页面记为已取证。未访问验证的用户 URL 仅作为备注，不提供伪装的“已检索文章”。
- LICENSE 为 MIT，示例第三方新闻截图/视频/照片明确不在该源码许可内；D-17/D-18 允许内部测试的候选策略仍适用，不能据此写入虚假 cleared。本次实际验收资料全部自制，不引入示例新闻素材或第三方下载器。

PDF 本地提取另参考 [Mozilla PDF.js Node getinfo.mjs](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs) 的 getDocument/getPage/getTextContent 接口，安装精确 `pdfjs-dist@6.4.299`（Apache-2.0，Node >=22.13，当前 Node 24.15）。实际已提取合成 PDF 页数和文本。Worker 读取字节数组，禁止脚本求值，不执行 PDF action，字体从依赖本地目录读取；不开放 HTTP URL 给解析器。图片/视频用现有 FFprobe/FFmpeg，视觉/OCR/ASR 未配置时仅记录真实技术信息。完整双数据库/浏览器验证以阶段交付报告为准，不将静态参考阅读算成外部 Provider 可用。
