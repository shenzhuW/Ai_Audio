# 参考代码仓库与学习路线（Codex 必读）

> 目的：为 **AI Code Video Studio** 提供可核实的现成工程实践。**参考仓库不是本产品已安装的依赖，也不是已经完成的功能**。产品需求以 `docs/DECISIONS.md` / `docs/PRD.md` 为准，不能因参考项目的产品形态改变本项目已确认的需求。
>
> Codex 执行对应 Phase 前，应先打开相关仓库中的具体文档/代码，记录已核实的做法、可借鉴点、不同点及许可影响。GitHub main 分支会变动，重要结论请同时记录查看日期、具体路径以及 commit SHA（能够获得时）。无法访问则如实标记 `NOT REVIEWED`，不得假装已读。

## 1. 优先参考项目

### A. Hypit — 视频工程描述、依赖编译与产物复用

- 源码：https://github.com/hypit-ai/hypit
- 中文 README：https://github.com/hypit-ai/hypit/blob/main/README.zh-CN.md
- 项目包机制：https://github.com/hypit-ai/hypit/blob/main/docs/guide/packages.md
- 运行计划与结果：https://github.com/hypit-ai/hypit/blob/main/docs/quickstart/run.md
- 主要源码目录：https://github.com/hypit-ai/hypit/tree/main/packages
- LICENSE：https://github.com/hypit-ai/hypit/blob/main/LICENSE

**重点学习**：视频源描述与一次执行的区分；素材、组件、模型、Provider 的接口边界；执行依赖图；显式构建产物复用；任务及产物记录。

**本产品应用**：设计 `ArtifactRevision` / `ArtifactDependency`、`SceneSpec` / `RenderManifest`、版本化产物缓存与增量重新生成，参考思想但**不要未经评估引入 Hypit 作为渲染内核**；既定渲染主线仍是 Remotion。

**风险**：Hypit 仓库包含**修改过的 Apache 2.0 许可证**，有额外的 SaaS/再分发限制；阅读、借鉴架构理念和重写自己的实现，与复制/改编受许可证约束的源码不是一回事。未经许可证评估、用户批准，严禁直接复制其源码或把它作为商业产品依赖。

### B. wallstreet-explainer — 研究、找片、导演表、动画与审核流程

- 仓库：https://github.com/HeyChengC/wallstreet-explainer
- 核心 Skill：https://github.com/HeyChengC/wallstreet-explainer/blob/main/SKILL.md
- 素材搜集指导：https://github.com/HeyChengC/wallstreet-explainer/blob/main/references/sourcing.md
- 视频找片和处理脚本：https://github.com/HeyChengC/wallstreet-explainer/blob/main/scripts/footage.py
- 动画原则：https://github.com/HeyChengC/wallstreet-explainer/blob/main/references/motion.md
- 镜头与视觉语法：https://github.com/HeyChengC/wallstreet-explainer/blob/main/references/grammar.md
- 导演思考：https://github.com/HeyChengC/wallstreet-explainer/blob/main/references/thinking.md
- 审核原则：https://github.com/HeyChengC/wallstreet-explainer/blob/main/references/review.md
- 临时语音/锚点：https://github.com/HeyChengC/wallstreet-explainer/blob/main/scripts/temp_voice.py
- 2.5D 工具：https://github.com/HeyChengC/wallstreet-explainer/blob/main/scripts/stage25d.js
- 动态检查：https://github.com/HeyChengC/wallstreet-explainer/blob/main/scripts/motion_check.py
- 新闻截图：https://github.com/HeyChengC/wallstreet-explainer/blob/main/scripts/snap_news.mjs

**重点学习**：按“观众这一镜要理解什么”组织导演表；真实新闻/官方资料/实拍画面优先；联系人表（contact sheet）、镜头检测、片段定位；语音短语/词级动画锚点；2.5D 摄像机和转场；关键帧/连续帧/动态检测的质量控制。

**本产品应用**：`DirectorShot.narrativeGoal` / `viewerTakeaway`、`VisualSearchIntent`、两轮素材检索与阶段化审核、`VoiceCue`、Motion Skills、Visual Critic。将现有**命令行创作方法**转为**Web 产品可存储、可编辑、可批准、可回滚**的数据工作流。不要直接把其 `Playwright → 图片序列 → FFmpeg` 渲染器当作我们的主引擎。

**版权注意**：`yt-dlp` 可进行搜索/下载并不意味着相关第三方视频具备商业使用授权；官方公开视频、新闻截图、个人肖像和商标等均需分别核查合法使用边界。该仓库的源代码许可证也**不等于**其样片素材已获授权。

### C. Remotion — 生产渲染与预览的首选内核

- 主仓库：https://github.com/remotion-dev/remotion
- 文档：https://www.remotion.dev/docs/
- Player：https://www.remotion.dev/docs/player
- Renderer：https://www.remotion.dev/docs/api
- 许可：https://www.remotion.dev/docs/license/faq

**重点学习**：Composition / Sequence、frame-based deterministic animation、React/SVG/Canvas 分层、静帧与视频导出、预览与正式渲染保持相同输入参数。

**本产品应用**：Phase 02 的真实 MP4 PoC，Phase 08 的 `SceneSpec`/组件目录/视频底图动画叠加，Phase 09 的最终导出。AI 自由生成的 TSX 在隔离 Worker 中运行，不能在主站同源运行不可信代码。上线前确认商业/自动化许可。

### D. Prompt to Motion Graphics SaaS Starter Kit — AI 动画代码生成 UX 参考

- 仓库：https://github.com/remotion-dev/template-prompt-to-motion-graphics-saas
- 官方说明：https://www.remotion.dev/docs/ai/ai-saas-template

**重点学习**：Prompt 验证、按需 Skill 选择、React/Remotion 代码生成、净化/校验、浏览器预览、自然语言局部修改及错误反馈。

**本产品应用**：只参考 AI Motion Code Agent 的输入/输出与交互模式。模板不是端到端“研究 → 文稿 → 导演 → 素材 → 审核”系统，也不应直接引入其信任模型到本平台：自定义代码需要隔离执行。

## 2. 分阶段最小阅读矩阵

| 阶段 | 必查参考 | 需要写进本阶段实施记录的结果 |
|---|---|---|
| Phase 00 基础工程 | 本文总览；Remotion 模板概览 | 选型与边界，**不要求克隆四个仓库** |
| Phase 01 Workflow | Hypit Packages / Run / Results | 产物版本、依赖 DAG、任务结果复用模型对比 |
| Phase 02 Render PoC | Remotion 官方 Renderer / Player | 真正渲染 MP4 的可运行示例及许可检查 |
| Phase 03 Research | wallstreet `sourcing.md`、`snap_news.mjs` | 真实来源优先、证据截图、研究与素材授权分界 |
| Phase 04 Script | wallstreet `SKILL.md`、`thinking.md` | 文稿段落→导演镜头的叙事约束 |
| Phase 05 Voice | wallstreet `temp_voice.py` | 词/短语锚点与替换配音的时序失效机制 |
| Phase 06 Director | wallstreet `thinking.md`、`grammar.md`、`motion.md` | 统一 `DirectorShot`、镜头连续性、过场规范 |
| Phase 07 Asset | wallstreet `footage.py`、`sourcing.md` | 两阶段检索、联系表、片段时间索引、自动裁剪和权限边界 |
| Phase 08 Motion AI | Remotion Starter Kit、Hypit 组件/包设计、wallstreet `stage25d.js` | 组件 Catalog、自由代码 PoC、安全执行及视觉设计规则 |
| Phase 09 Review & Export | wallstreet `review.md`、`motion_check.py`、Remotion Renderer | 动画检查、质量门禁、导出审计及版权检查 |

## 3. Codex 引用参考仓库的执行规则

1. **先读产品契约、再读参考项目**。参考不能推翻已确认的“先研究→文稿→配音→导演与素材→程序化视频”的流程。
2. **只学习当前阶段有关的实现**；不在 Phase 00 下载所有仓库或盲目复制其全部技术栈。
3. 分析时记录：参考 URL/路径、读到的行为、是否亲自运行、打算如何适配、差异与潜在许可证问题。重要发现记在 `docs/REFERENCE_REVIEW_LOG.md`（新增）。
4. 若实现涉及复制第三方代码或引入第三方依赖，**先核对许可证、当前版本、可分发权利及安全性**；未经批准不得将非兼容或限制性代码合并进本产品。
5. 视频来源与软件许可证分别核查：**代码许可允许使用，并不授予新闻/YouTube 视频、配音、字体、人物肖像的商用权**。
6. 无法访问参考仓库时使用已存在的接口协议继续当前可完成任务，并诚实标记未验证内容，禁止推测或虚构已经阅读的实现细节。
7. 对照完参考之后，优先产出适配本系统的最小接口和测试，**不要原样搬运他人的 CLI 脚本、产品 UI 或业务状态机**。

## 4. 推荐每次阶段结束的回报格式

```text
本阶段参考：仓库地址 / 具体文件 / 查阅日期或 SHA
借鉴的实现思想：
因产品约束而未采用的做法：
实际复用的第三方依赖及许可证情况：
修改的本项目文档/接口：
PoC 与测试（注明运行或未运行）：
待确认风险：
```
