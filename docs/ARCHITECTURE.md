# 系统技术架构 v1.3

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
| `asset` | Provider 搜索、授权、媒体索引、片段推荐、虚拟区间、按需处理 | 自动判定未授权公开视频可商用 |
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
- 实际导出：绑定 approved 分镜/口播/语音/场景代码与清晰许可状态；渲染清单固定版本，避免导出中途版本漂移。

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
