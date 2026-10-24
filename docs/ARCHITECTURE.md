# 系统技术架构 v1.3

## Phase 04.5 Codex 优先真实能力（本地交付，等待审核）

本地单用户运行时数据分析优先复用用户已授权的 Codex CLI / ChatGPT 登录，先验证 CLI，再评估 Codex SDK；不要求先购买搜索或模型 API。它是独立、有限权限的任务执行器，不是当前开发会话，不获得开发进程的工具和权限。真实能力及安全边界必须经 PoC 后才能标已接通；详见 [实施计划](../plans/04-5-real-ai.md)。

Research/Script Worker 只传递冻结的 JSON 和必要图片附件到独立任务目录。必须禁止模型 Shell、文件修改、凭据读取、Git、MCP/插件/Hook 等外部能力，限制时间和输出，保留进程树取消与租约保护。read-only 并不自动限制全盘读取，不能替代工具禁用和实际隔离验证；不可用则 fail closed，不启用不安全运行时。

搜索结果（标题/URL/模型摘要）与独立网页原文获取分开持久化。受限获取器做 SSRF、重定向、大小、类型和超时校验；模型摘要不能成为原文 matched 证据。FFmpeg 关键帧继续绑定源时间戳，Codex 视觉输出标为模型分析。文稿输出仍经 ScriptSegment、固定研究与引用校验，稳定段落 ID/审批/依赖机制不变。每任务记录 Provider、模型、运行 ID、搜索模式、耗时、可获得的实际使用量/额度和错误，未知字段不得猜测。无需持久会话先不引入 app-server，SDK 必须保留相同执行边界。

## Phase 04.5 执行边界与 SDK 取舍

结项补充：`research-claims` 沿用 Research Worker，冻结当前草稿版本与被选中的真实 text/pdf_page 提取原文（最多20段/每段12000字符/共60000字符，截断必须明示）。Codex 的搜索在此任务关闭，安全策略与登录处理不变。模型仅输出 Claim 字段、Source/Index 允许集内的候选引文和冲突说明；应用生成候选 ID，并重新计算逐字字符范围与 SHA256。搜索摘要、Mock、视觉描述和抓取失败结果都不能作为候选原文。

候选生成结果与审核状态保存到现有 Job JSON，不增加表或迁移。`claimCandidateReviews` 与 Job 原始结果分开；原始模型结果不被用户编辑替换。用户 edit/accept/reject 经同一研究草稿 expectedVersion、事务幂等、当前修订及不可变保护。只有 accept 写正式 Claim/Evidence，保持 unverified；存在支持和反驳证据时沿用 conflicting 提示，不自动 supported/核实。接受前重核原文 SHA、来源选择与逐字引用；新 Fork 不沿用旧候选 ID/Source ID。已批准修订及迟到 AI 结果均受版本围栏保护。

Phase 04.5 实施补充：执行边界在 `scripts/codex-runtime.cjs`。固定 CLI 0.163.0，独立临时目录，ignore-user-config/ignore-rules/ephemeral、只读、stdin JSON和最多六张必要PNG/JPEG，过滤数据库/Provider/Git环境，单次模型120秒和4MiB输出限额。生成单模型 catalog（shell disabled、patch null、扩展工具空）并再次 debug models 验证；逐项将已有MCP服务覆盖为 disabled并预检启用数为零，仅空表不会删除既有配置。

本版本 live 搜索需要独立 Code Mode Host，启用V8数据计算并关闭进程内fallback；实际诊断确认无process/require/fetch/Deno，node:fs导入被拒绝。Code ModeOnly固定暴露三个MCP资源辅助入口，但无启用的服务器，不能声称工具表完全为空。Shell、apply_patch、view_image、子Agent、浏览器、插件等仍禁用，图片只由可信宿主作为附件发送。这不是Phase08任意TSX的OS沙箱。

Research Worker保留本地解析分支，显式vision=true才做图片/FFmpeg关键帧理解；Codex桥接与受限静态网页获取分别位于scripts/codex-research.cjs和public-fetch.cjs。ScriptProvider复用原Workflow Worker，心跳取消传递AbortSignal并终止CLI进程树。Attempt记录workerId，取消后同一尝试只能补记审计，不能恢复租约、写回结果或覆盖后续尝试。

已读SDK 0.164.0仍包装exec --experimental-json，有事件流/AbortSignal/图片/Schema/configOverrides，但缺少本桥接所需ignore-user-config、ignore-rules、ephemeral开关；本阶段暂不引入SDK包。替换传输前必须保留相同安全边界。没有持久会话需求，不启动app-server常驻服务。

## Phase 04 文稿模块（已交付基线）

`domain/script.ts` 与 `server/script/` 负责结构化段落、引用校验、估时、差异和 Provider 契约。Workflow Engine 只增量接入初始化/保存/异步任务、fork 快照及段落范围依赖，原项目/审批/队列/媒体 Worker 不重写；新增 0004 的文稿配置和段落版本表。旧文本修订可读，转换显式进行。

已有 Workflow Worker 消费 provider=script，输入冻结在 Job 中，Phase04交付时使用Mock或未配置Provider，2秒心跳/30秒租约；用户保存改变目标版本时不写入迟到结果。Phase04.5已通过同一ScriptProvider接口追加真实Codex、Schema/引用校验、超时/取消与使用审计，仍不将开发会话当服务。Phase04原基线没有网络模型调用，不能据此描述Phase04.5的当前能力。

第 04 页采用段落编辑器与原 WorkflowPanel 集成；保存后刷新审核版本，未保存修改阻止审核/切换版本，409 保留编辑缓冲区并允许显式重新载入。来源查看使用固定研究快照和受保护原件，估时/画面意图仅是规划信息；Voice/Director 在后续阶段消费稳定段落 ID。

## 1. 核心选型
- **界面**：Next.js + React + TypeScript；样式从 `prototype/index.html` 的蓝白设计 Tokens 抽取，推荐 Tailwind 或 CSS Modules 二选一，团队全局保持一致；富文本可选 Tiptap。
- **API**：Next.js Route Handlers 或独立 Fastify（MVP 优先同仓模块化服务，避免重复 HTTP 层），输入输出 Zod。
- **持久化**：PostgreSQL + ORM（Prisma/Drizzle 在 Phase 00 选定），本地/MinIO/S3 可替换的 Blob Storage。
- **长任务**：先建立 Job 与 Worker 接口、重试和幂等；可选 BullMQ + Redis，严禁把数分钟任务挂在普通 HTTP 请求上。
- **模型**：Provider Adapter：LLM、Vision、Search、TTS、ASR。开发时允许 Mock Provider，但 UI 必须标注模拟。
- **媒体**：FFprobe、FFmpeg、PySceneDetect；可选后续 WhisperX 等深度分析。
- **动画**：Remotion、React、SVG、Canvas；Three.js 在复杂镜头需要时逐步引入。
- **Agent 开发工具**：Codex 实现本仓库；产品运行时 Code Agent 选型 PoC 再定。不可把开发会话当持久生产服务。

> **参考项目阅读路线**：见 `docs/REFERENCE_PROJECTS.md`。Hypit 参考工程编排和依赖模型；wallstreet-explainer 参考导演语法、素材和语音处理；Remotion 是首选渲染内核；Remotion AI Starter 参考代码 Agent 的交互，均不是未经复核可直接依赖的生产组件。

## 2. 物理部署（首版）
```text
Browser (Next.js UI, Remotion Player for trusted compositions)
  | HTTPS/session
API / Workflow service
  |-- PostgreSQL (projects, revisions, review records, claims, jobs)
  |-- BlobStore (source files, screenshot, audio, source bundles, MP4)
  |-- Provider gateway (search / LLM / TTS / ASR)
  \-- Jobs --> Media Worker (trusted FFmpeg, scene detection)
          \--> Code+Render Worker (isolated container, Remotion/Chromium/FFmpeg)
```
*AI 生成代码的浏览器预览不能直接运行在拥有管理凭据的 UI 同源中。* 首版优先使用服务端隔离 Worker 生成可播放视频/静帧，避免直接将未审查 TSX 注入主应用的浏览器运行时。

## 3. 逻辑包边界
| 模块 | 只负责 | 不负责 |
|---|---|---|
| `project` | 需求、基本元数据、创作起点 | 自动做研究 |
| `workflow` | 版本、审核、依赖失效、Job 状态 | 模型自行决策的文本生成 |
| `research` | 来源抓取、Claim、媒体内容语义提取 | 正式媒体裁剪 |
| `script` | 文稿结构、局部改写、引用绑定 | 修改授权标签 |
| `voice` | TTS/导入/无口播、音频时间轴和字幕 | 设计镜头 |
| `director` | 导演表、视觉叙事、镜头计划 | 在主 API 进程执行 TSX |
| `asset` | Provider 搜索、来源/限制记录、媒体索引、片段推荐、虚拟区间、按需处理 | 商业授权审批或自动声明可商用 |
| `motion` | SceneSpec、组件目录、场景代码、预览和最终渲染 | 擅自编造新事实数据 |
| `visual-critic` | 规则/视觉质量报告、局部问题定位 | 替代事实审核或法律许可判定 |

## 4. Provider 能力契约
```ts
interface ResearchProvider { search(query: string, limit: number): Promise<SourceCandidate[]> }
interface VisionProvider { analyzeImage(input: BlobRef): Promise<VisualAnalysis> }
interface VideoIndexProvider { index(input: BlobRef): Promise<TimecodedSegment[]> }
interface TTSProvider { synthesize(text: string, config: VoiceConfig): Promise<AudioResult> }
interface SpeechAlignProvider { align(audio: BlobRef, script: ScriptRevision): Promise<VoiceCue[]> }
interface MotionCodeProvider { generate(spec: SceneSpec, library: ComponentCatalog): Promise<CodeResult> }
interface MediaProcessor { probe(ref: BlobRef): Promise<MediaMetadata>; prepare(binding: AssetBinding): Promise<PreparedAsset> }
```
这里仅为描述性类型；最终接口定义需依据 `DATA_MODELS.md` 用 Zod 实现并带版本。

## 5. 统一产物与任务协议
- 业务数据：Artifact（逻辑身份）、ArtifactRevision（不可变内容版本）、ArtifactDependency（引用具体上游版本）。
- Job：queued→running→succeeded/failed/cancelled；支持 idempotencyKey、attempt、maxAttempts、errorCode、输出版本引用。
- 审核：draft→in_review→approved/rejected；更改批准内容创建新修订，旧批准版保持可读。
- 素材：SourceAsset 保留原文件；CandidateClip 仅时间戳/语义索引；PreparedAsset 是复用的派生文件；从不覆盖源视频。
- 内部测试导出：绑定 approved 分镜/口播/适用时间轴/场景代码，清单固定版本并保留来源/已知限制。商业许可未知或不可商用不阻断内部渲染/下载，不自动公开发布；商业发布另行核查。

## 6. 先后顺序与并行
研究文本/视频信息提取可并行；内容核实完成后再写正式文稿。口播确认→配音确认→初步分镜→第二轮素材检索→导演方案审核→按需物化媒体→场景代码/动画→质量检查→人工成片批准→最终导出。
跨页面 `assets` 是资料管理中心，不构成独立审批节点。`review` 提出的修复指令必须回写受影响 SceneSpec/代码并带版本，不能在原 MP4 上做无记录的手动覆盖。

## 7. 优先验证的两类 PoC
A. 在 9:16 视频素材上叠加 React/SVG 动画、语音/字幕，生成实际 MP4，前端播放且帧确定性可复现。
B. 用户修改文稿一段后能计算哪些修订变成 stale，成功回退/继续，不删除旧版本。
这两个 PoC 失败即不应盲目建设后续高级 Agent 功能。

## 8. 组件目录规范
`ComponentCatalog` 为组件提供：name、schemaVersion、propsSchema、animationCues、supportedAspectRatios、previewRef、entryFile、license；组件初期包括 KineticText、NumberTicker、BarChart、LineChart、VideoLayer、ImageLayer、SpotlightAnnotation、GlowLine、Subtitle、BasicCamera。
不得将 TSX 任意代码伪装成所有字段都可视化编辑；代码组件只暴露其声明且经验证的可编辑 props。

## 9. 版本/服务演进
- **首版**：模块化单体 API + 单独媒体和隔离渲染 Worker。
- **扩展**：增加多 Provider、语义向量检索及队列调度。
- **以后**：多租户、团队协作、GPU 分割/追踪。是否采用 Agent 工作流框架视可恢复性压测结果确定。

## Phase 03 实施边界

研究模块位于 `server/research`，使用原 Workflow Repository 的项目事务锁和 Job/Outbox，不另建审批或项目系统。四张研究实体表绑定研究修订，摘要和资料共同参与 contentHash；fork 复制元数据快照、复用原 Blob。PostgreSQL 增量迁移为 0003，SQLite 增量建表含相同的草稿写入保护。

独立 Research Worker 只调用固定本地解析器：PDF.js 提取 PDF 文本/页数，FFprobe 检测图片/视频，FFmpeg 稀疏抽帧。子进程环境过滤凭据、Node 堆 512MB、任务 120 秒、心跳续租，API 不执行解析器或不可信代码。不是完整 OS 沙箱；任意 TSX 保持禁止。没有正式视频裁剪、素材智能匹配或网络页面执行。

Search/Content/Vision 接口与 real/mock/unconfigured 状态分开；本地真实提取不等于视觉语义识别或事实核验。未配置搜索不伪造文章，用户 URL 只作未访问备注。研究页面复用原 WorkflowPanel 审核精确修订，资料/引用/索引和任务在独立面板查询。详见 [Phase 03 交付](PHASE_03_DELIVERY.md)。

## Phase05 已实现的语音边界（2026-10-24）

`voice` 模块依赖已批准、当前有效的结构化ScriptRevision，持有自己的VoiceTimeline/Cue/Subtitle快照，不改变研究或文稿。沿用Workflow/Job/Outbox，`pnpm worker` 调用固定可信媒体适配器；主API不运行语音模型。Windows系统TTS和本地Whisper/stable-ts均为独立子进程，白名单环境不含DB/Codex认证。服务器管理员显式安装/启用，运行时不下载模型。

`processVoice`统一音频/ASR/对齐任务，Provider由服务端允许集选择。句/词模型时间绑定输入音频SHA、固定scriptRevisionId、segmentId、字符范围和段落SHA，零时长词保留原始但不制造时长；字幕另轨可改。ASR不接收参考文稿，其未绑定草稿不可批准。人工校时、估算、静默计划、模型强制对齐分别标识。没有自由Python/PowerShell/SSML/TSX执行接口，不将本机可信进程称为OS沙箱。更多配置、维护/精度风险见[VOICE_SETUP](VOICE_SETUP.md)。

Worker每2秒心跳/30秒租约，模型默认600秒超时，取消杀子进程树，失败可重试；目标修订、音频SHA和目标版本不匹配时拒绝迟到写入。音频正式替换使锚点失效，新批准文稿使完整音轨依赖失效；一个段落可有多层多个Cue，未实现镜头映射或Phase06。
