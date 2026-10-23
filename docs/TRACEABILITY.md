# 需求追踪矩阵：页面 → 业务对象 → API → 开发阶段

| 页面 / 视觉参考 | 必须可工作的行为 | 核心实体 | API 分组 | Stage |
|---|---|---|---|---|
| 01-create | 项目创建、自由时长、三种创作起点 | Project/ProjectInput | projects | 00 |
| 02-overview | 持久阶段状态、产物、任务、预算 | Project/Artifact/Job | workflow/artifacts/jobs | 01 |
| 03-research | Source/Claim/视频时间索引、研究审核 | Source/Claim/ResearchIndex | research/artifact-approval | 03 |
| 04-script | 分段编辑/改写/来源/版本/审批 | ScriptSegment/ArtifactRevision | script/revisions | 04 |
| 05-voice | AI/导入/无口播、Cue/字幕、时间轴批准 | VoiceAsset/VoiceCue/SubtitleCue | voice | 05 |
| 06-storyboard | 叙事目标、候选素材、素材范围、导演表审核 | DirectorShot/AssetBinding | storyboard/asset-search | 06 |
| 07-assets | 研究/候选/引用、来源与限制、视频索引和联系表 | SourceAsset/CandidateClip/PreparedAsset | assets/upload/index | 07 |
| 08-motion | 图层、组件、SceneSpec/TSX、预览、局部修复 | SceneSpec/SceneCode/PreparedAsset | motion/preview/patch | 02 + 08 |
| 09-review | 真实预览、时刻反馈、版本对比、批准 | RenderRevision/ReviewComment | review/quality | 09 |
| 10-export | 内部测试 MP4/SRT/文稿/来源限制清单/允许分发的工程包，不自动发布 | RenderRevision/Export | exports | 09 |

## 使用方式
1. 每个计划文件必须引用相应表格行。
2. 页面完成时检查真实功能，不以静态截图和假数据作为已完成证据。
3. `tests/ACCEPTANCE.md` 中每条可交付功能记录测试证据和 Mock/Real 标签。
4. 测试项目统一 `120s / 6 镜头`，此值是 UX fixture，不代表产品时长限制。
