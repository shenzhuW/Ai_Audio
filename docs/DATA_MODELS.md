# 核心数据模型与版本协议 v1.2

## Phase 04.5 候选 Claim 结项补充

不修改 Prisma Schema、既有迁移或正式 Claim/Evidence 结构。Research Job 增加 `kind: claims`：输入含 `revisionId/targetVersion/passages/warnings/mode:real`；每段冻结 sourceId/indexId、原件及完整提取文本 SHA256、文本前缀与 PDF 页码。候选结果包含 `status:ready|insufficient`、notes、candidates、aiRuns。Candidate 的 Claim.verificationStatus 只能为 unverified，引用必须是冻结原文的连续精确子串。应用派生 match 的 UTF-16 `[startChar,endChar)`、locator 和双 SHA，忽略模型提供的偏移与哈希。模型不生成候选身份。

Job 可选 `claimCandidateReviews[]` 保存 candidateId、用户编辑后的 candidate、pending/accepted/rejected、version、local-user、时间、接受后的 Claim/Evidence ID 映射；原始 researchResult 保留。旧 Job 缺此字段仍可读。审核修改递增研究修订/Artifact 的版本；接受与正式记录插入处于同一事务，失败无部分写入，同键重试无重复记录。拒绝后不可接受；已批准修订不可审核候选。Fork 的正式引用沿用既有重映射；待审核候选保留在原任务中，新修订须重新生成。

## Phase 04 已实现文稿子集

ScriptRevision 继续使用唯一的 WorkflowRevision（可选 `scriptSchemaVersion=1`），不另建审批系统。`script_documents` 保存一修订一份文稿配置（origin、固定 researchRevisionId、unitsPerMinute、user/mock/real provenance）；`script_segment_versions` 保存该修订的段落快照，数据库行 `id` 为物理 UUID，`segmentId` 为跨修订稳定逻辑 UUID。API `segments[].id` 返回逻辑 ID；微调、重排与 fork 不改变它，新增段落生成新 ID。移除的草稿段落记 removed，不物理删历史；新 fork 只复制活跃段落。

段落正文及 purpose、viewerTakeaway、visualIntent、delivery、pauseMs、factBindings、needsRebind 实际持久化；order 由提交数组顺序生成。purpose 为 hook/context/explanation/evidence/transition/conclusion。画面意图仅供后续导演参考，不是一句/一段一个镜头。预计 estDurationMs 根据正文、节奏、停顿和文稿单位/分钟派生，在 API timing.details 返回，不冗余存储或伪装实测音频。

factBindings 为 `{claimId,sourceIds[]}`，Claim/Source 必须属于文稿固定的已批准研究，Source 还须出现在该 Claim 的 ClaimEvidence 中且被采用。没有研究的用户文稿可保存，但不能附加伪造引用；未核实/冲突/作废状态沿用研究，批准文稿不升级事实真实性。对旧研究的引用保留完整快照；研究批准版本替换时，按绑定定位相关段落并保守显示影响。

结构化内容和配置共同参与 contentHash。提交/批准/驳回继续用原 Workflow；已批准修订和两类 Script 行有数据库保护。旧文本修订继续读取；当前旧文本草稿可显式转结构化，已审版本需 fork 后转换。旧 PATCH 不可绕过结构化段落保存。选择新研究输入 fork 时保留段落 ID，清空旧 factBindings 并标 needsRebind，重新确认后方可提交。

Dependency 可选 `segmentIds` 表示只消费指定段落内容。新的批准文稿替换旧版时，只有声明范围的内容/引用/节奏或全局朗读速度变化才使该范围失效；无范围或无法证明一致时按整个修订保守失效。段落顺序变化在差异中单独显示；单段内容缓存可复用不等于整个音轨/时间轴可复用，后者应使用完整修订依赖。本阶段只验证依赖元数据，不声称已创建真实 VoiceCue/DirectorShot。

Script Job 追加 provider=script、冻结 scriptInput 与校验后的 scriptResult，固定当前 draft version、目标段落/全文、CreativeBrief 和批准研究摘要/Claim 允许集。局部结果只能修改目标逻辑 ID；保存、批准、取消或目标切换后迟到结果不能覆盖。Mock 显式标识，真实 Provider 未配置时任务失败；PostgreSQL 仅追加 0004，SQLite 增量建表，旧数据不自动迁移。

> 供 Codex 按 PostgreSQL + ORM + Zod 落地。以下是**逻辑模型**，不是可以直接执行的 SQL。一个概念分配一位数据拥有者，不重复维护同一字段的事实来源。

## 1. 主键和基本规范
- ID 用 UUID / ULID（全仓库统一一种），API 传字符串；创建时间、更新时间均存 UTC ISO/timestamptz；视频时间用 `timeMs` 正整数，帧数用非负整数。
- 数据库审计记录 append-only，不物理覆写已批准修订；审批人首版是单用户主体 `actorId`。
- 外部来源、许可证标志、Claim 状态必须有 evidenceRef / assertion provenance；AI 不得自行生成“真实”的授权凭证。
- 涉及 Schema 的人工/Agent 输入必须 Zod 解析，字段有 `schemaVersion` 并支持后向迁移。

## 2. 表及关系（核心）

| 实体 | 关键字段 | 关系/约束 |
|---|---|---|
| `Project` | id, ownerId, title, status, currentStage, targetDurationMs, fps, width, height, language, budgetLimit, createdAt | `targetDurationMs > 0`; 不能固定最大 90s |
| `ProjectInput` | projectId, prompt, entryType(topic/script/upload), voiceMode, styleGuideRef | 一项目可有多个修订 |
| `Artifact` | id, projectId, type, createdAt | 逻辑产物身份，稳定 ID |
| `ArtifactRevision` | id, artifactId, revisionNumber, schemaVersion, contentRef, contentHash, status, parentRevisionId, createdAt, createdBy | 唯一 (artifactId, revisionNumber)，已批准不可变 |
| `ArtifactDependency` | downstreamRevisionId, upstreamRevisionId, purpose | 明确 DAG；禁止循环引用 |
| `ApprovalEvent` | id, revisionId, action(submit/approve/reject), actorId, comment, at, expectedVersion | 审核留痕，不覆盖历史 |
| `Job` | id, kind, state, idempotencyKey, inputRevisionIds, attempt, maxAttempts, resultRef, errorCode, updatedAt | state 单独于审批；失败可重试 |
| `BlobObject` | id, uri, sha256, mime, sizeBytes, origin, retentionPolicy | 原始媒体不可变 |
| `Source` | id, projectId, title, sourceType, sourceUrl, publisher, publishedAt, retrievedAt, blobId, evidenceRef | 实际来源存在才可创建；可信度属于评价 |
| `Claim` | id, text, asOf, scope, unit, verificationStatus, caveats | 真实数据有统计口径和时间 |
| `ClaimEvidence` | claimId, sourceId, locator, role(support/refute/context) | 一 Claim 多来源 |
| `ResearchIndexEntry` | id, sourceId, contentType, summary, keywords, startMs?, endMs?, frameRefs?, extractedDataRef? | 视频只是索引/时间码，不等同于裁剪成品 |
| `ScriptSegment` | id, scriptRevisionId, order, text, purpose, claimIds, estDurationMs | 段落稳定逻辑 ID；重排仅改变 order |
| `VoiceAsset` | id, projectId, scriptRevisionId, mode(tts/import/none), audioBlobId?, durationMs | 无口播可没有 audioBlob |
| `VoiceCue` | id, voiceRevisionId, segmentId, anchorId, startMs, endMs, confidence | 时间单调非重叠的有效约束按类型定义 |
| `SubtitleCue` | id, voiceRevisionId, startMs, endMs, text | start < end |
| `DirectorShot` | id, storyboardRevisionId, order, title, narrativeGoal, viewerTakeaway, scriptSegmentIds, voiceCueIds, durationFrames, transition, layerSpec | 每镜叙事目标必填 |
| `SourceAsset` | id, sourceId?, blobId?, kind, sourceUrl?, sourcePlatform?, creator?, knownRestrictions?, licenseStatus?, licenseEvidenceRef?, metadata, contentTags | 来源与已知限制可追溯；商业许可标签不作为内部测试硬门禁 |
| `CandidateClip` | id, sourceAssetId, sourceInMs, sourceOutMs, notes, visualFit, matchedShotId? | 不一定存在裁剪后物理文件 |
| `AssetBinding` | id, shotId, sourceAssetId, clipId?, fit, crop, mute, purpose, overlaySpec | 绑定素材到镜头，内容与授权不同 |
| `PreparedAsset` | id, bindingId, blobId, recipeHash, status, durationMs | 自动裁剪/转码派生，保留原始文件 |
| `SceneSpec` | id, shotId, revisionId, durationFrames, layers, cues, editableProps, styleGuideRef | 渲染无外部未声明数据 |
| `SceneCode` | id, sceneSpecRevisionId, artifactRevisionId, tsxBlobId, componentManifest, buildHash, validationState | AI 代码可追溯 |
| `RenderRevision` | id, projectId, inputRevisionIds, renderManifestHash, mp4BlobId?, previewBlobId?, qaStatus | 与任何 AI 回复无关，必须有实际文件才能成功 |
| `ReviewComment` | id, renderRevisionId, timeMs, shotId?, authorId, body, status, createdAt | 意见固定绑定被审版本 |
| `LicenseRecord` | id, sourceAssetId, licenseType, evidenceRef, allowedUses, checkedAt, checkedBy | 无凭证不得写 cleared |
| `UsageEvent` | id, jobId, provider, usageType, units, currency, amount | 记录各阶段实际消耗与估算差异 |

## 3. 生命周期与状态

### ArtifactRevision
- `draft -> in_review -> approved` 或 `draft -> in_review -> rejected`；被驳回后通过新修订继续修改。
- `superseded` 是某个已批准版本被新版本替代的派生状态；`stale` 更适合作为依赖有效性单独字段，不应覆盖历史的 `approved` 审批事实。
- 已批准修订不可编辑；对它修改必须 `forkRevision`。

### Job
- `queued -> running -> succeeded | failed | cancelled`；重试生成新 attempt 记录。
- 长任务返回 jobId，并有 idempotencyKey + inputRevisionIds；队列消息重复消费不得重复提交结果。

### License
- 既有 `research_only` / `pending` / `cleared` / `blocked` 值保留兼容，用于记录来源方声明或已知限制，不因值本身自动阻断内部候选、分镜、裁剪、合成和 MP4 下载。不可商用也不等于不能内部开发测试。
- `cleared` 仍不能伪造，有明确凭证时才记录；LicenseRecord 为可选追溯资料，不建设商业许可审批。商业发布前另行核查，内部测试不自动转为公开发布。
- 后续媒体协议以 `usageContext=internal_test` 表达用途，保存 sourceUrl、sourcePlatform、creator（如有）、knownRestrictions；这是后续协议设计，不在本次同步中迁移 Phase 00–01 数据。

## 4. 关键 Zod Schema 草案（示意）
```ts
import { z } from 'zod';
export const CreativeBriefSchema = z.object({
  schemaVersion: z.literal(1),
  topic: z.string().min(1),
  targetDurationMs: z.number().int().positive(),
  fps: z.number().int().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  language: z.string().default('zh-CN'),
  entryType: z.enum(['topic', 'script', 'upload']),
  voiceMode: z.enum(['tts', 'import', 'none']),
});
export const CandidateClipSchema = z.object({
  sourceAssetId: z.string().min(1),
  sourceInMs: z.number().int().min(0),
  sourceOutMs: z.number().int().positive(),
  description: z.string(),
}).superRefine((c,ctx) => {
  if (c.sourceOutMs <= c.sourceInMs) ctx.addIssue({code:'custom', message:'sourceOutMs 必须大于 sourceInMs'});
});
```

## 5. 数据相互引用的统一方法
- 文稿段落通过 Claim ID 引用可核实内容；动态图表的数值通过 `dataRef` 指向 Source/Claim 派生表，不能由 Code Agent 虚构。
- 导演镜头绑定 `ScriptSegment.id` 和 `VoiceCue.id`；具体素材通过 AssetBinding 引用源 ID 和时间区间。
- Preview、正式 Render 使用 `renderManifest` 固定所有上游修订和组件版本；完成前不得从“latest”读取。
- 依赖变化只标记可能受影响的下游，影响算法先比较 revision 输入与依赖图，再确定重新构建粒度。

## 6. 必须覆盖的迁移与一致性测试
1. 同一个修订重复提交/批准返回幂等结果；批准旧版本返回 409。
2. 已批准文稿不能 PATCH 原文；fork 后批准新修订，原批准版仍可读。
3. 文稿 v3 的第三段改动：相关 Cue/Shot/Scene stale，其他镜头仍复用。
4. `pending`、`research_only` 或不可商用素材可进入内部测试合成/下载，来源及已知限制不丢失，不产生商业授权审批；访问/SSRF/媒体完整性失败仍受保护，结果不自动公开发布。
5. 同一素材多个 CandidateClip 不复制/覆盖源文件；独立生成 PreparedAsset，按 recipeHash 复用。

## Phase 03 已实现研究子集

Phase 04.5在以下已有JSON文档增加可选字段/枚举，不新增表/DDL，不改写0001–0004，不迁移用户库：Source增加web-fetch/fetched及webCapture，保存受保护原始响应文本Blob、最终URL、获取时间、原始SHA、模型摘要、搜索片段和runId；Source.blob为独立提取文本，原始HTML只作附件文本下载，不在同源执行。摘要不放入extractedText。

Search Job增加real；candidates最多5项，记录实际搜索标题/URL/片段、模型摘要、独立fetchStatus/失败原因及可选真实来源。只将成功获取的候选加入同一研究草稿，不自动建立/核实Claim；Mock候选仍为空。searchTrace和aiRuns保存查询/URL及调用审计。Analyze Input可选vision=true，Index.analysis保存model-vision、模型/runId、源SHA/帧时间；视觉文字永不写extractedText，可在技术索引后追加语义索引，不改批准版本，不做裁剪或ASR。

ScriptResult.aiRun/Job.aiRuns可选，记录模型、CLI版本、运行ID（未建立为null）、搜索模式、耗时、实际token、quota=null及未知说明、失败码、工具策略/catalog散列和生效的隔离摘要。Attempt.workerId可选，新claim写入；取消后record-ai-run只允许相同attempt/worker追加元数据，保持cancelled/null租约，不改变用户状态版本；旧执行者不能覆盖新尝试。

新代码兼容旧JSON。回滚优先STUDIO_CODEX_ENABLED=0并保留此版本数据；旧Phase04程序不认识新real搜索/web-fetch文档，不能直接降级读取新记录。代码回退前备份数据库和Blob，不删除数据适配旧程序。

四个独立实体表为 `research_sources` / `research_claims` / `research_claim_evidence` / `research_index_entries`。每行保存经过 Zod 校验的 schemaVersion=1 文档，关联 Project 与具体研究 `revisionId`；证据到 Claim/Source、索引到 Source 使用包含 revisionId 的外键，禁止混用不同修订的实体。

研究资料由该修订拥有，纳入其 contentHash；摘要仍使用原 Revision.text。批准/提交后的研究记录由服务与数据库触发器保持只读，修改时复用原 fork：复制资料快照、生成修订内新实体 ID 并重映射引用，复用原 Blob，不覆写原件。历史 revisionId 保留其完整来源/证据视图。未带研究资料的 Phase 01 文本修订继续使用原内容散列规则，不改写历史。

Source 保存真实上传原件 Blob（UUID、MIME、大小、SHA256）、来源标题、URL 备注、发布者/平台、作者、发布日期、获取时间、采用状态及已知限制。URL 标记为 user_supplied；未访问核实的 URL 不作为“已检索文章”导航。许可未知/blocked/research_only/pending 不阻断内部分析，不无凭证写 cleared。初始项目上传资料可显式加入研究，原 Project/附件不改变。

Claim.verificationStatus 为 `unverified/supported/conflicting/withdrawn`。supported 仅表示人工选择的支持引用已在真实提取文本中定位，**不等于独立核验**；没有 matched 支持引用不得设置 supported，Mock 不可作为 matched。存在采用中的支持与反驳引用时标记冲突，保留双方证据。没有自动 verified 入口，审批报告不改变事实真实性。

ClaimEvidence 保存 role、quote 与结构化 locator（文本标签、实际 PDF 页码、图片说明或原视频毫秒区间），validation 为 unvalidated/matched/mock。ResearchIndexEntry 保存内容类型、摘要、关键词、可提取文本、页码/时间段及抽帧引用、real/mock 来源；视频只是索引，不生成 PreparedAsset。页码及时间范围依实际元数据校验，列表按页码/起始时间排序。

Workflow Job 兼容追加 provider=research 和可选 researchInput/researchResult。分析固定 sourceId、revisionId、Blob 与 mode，沿用原 Job/Outbox/幂等/租约；提交或批准后到达的结果失败为 TARGET_CHANGED，不改写已审资料。迁移为增量 0003，不重写 0001/0002，不自动迁移真实用户库。

## Phase05 语音快照实现（2026-10-24）

权威运行时协议为 `apps/web/src/domain/voice.ts`。新增0005，仅追加 `voice_timelines`、`voice_cue_versions`、`subtitle_tracks`；PG Prisma/SQLite同构JSON快照，草稿外禁止修改，历史禁止删除。`WorkflowRevision.voiceSchemaVersion=1`与固定Script依赖。

- VoiceTimeline：物理id、revisionId、scriptRevisionId、mode、durationMs（有音频时必须FFprobe实测）、targetDurationMs、audio、timingBasis、alignmentConfirmed、audioStale。
- VoiceCue：逻辑id与anchorId跨保存/同输入Fork稳定；物理版本行另有id/revisionId/cueId。segmentId+UTF-16 startChar/endChar+segmentTextSha256精确映射重复词，不允许切开代理对。level=sentence/phrase/word；同层非重叠、跨层可嵌套；时间非负且start<end<=duration。alignment=manual/estimated/planned/forced，forced只有真实结果可创建，手改后降为manual；confidence未知为null，原始模型概率另存，不伪造精度。
- SubtitleTrack：稳定trackId、语言、独立字幕数组；字幕稳定id、可空anchorId/segmentId、text/start/end/sourceRunId。ASR未绑定字幕segmentId=null且不可提交；不把识别结果当作原文自动绑定。字幕改动不写ScriptSegment/Claim/Source。
- Job.voiceInput冻结目标修订/版本、已批准文稿、音频blob/SHA、operation、Provider与资源限额；voiceResult区分audio/asr/alignment，保存原始词（可零宽）、模型SHA、音频SHA、时间与字幕草稿。voiceRuns记录每次attempt的runId/时长/失败、输入SHA、模型/进程信息及ASR是否有参考文稿；没有远程账号用量。输出校验和事务保护沿用Workflow。

删除Cue用removed保留版本，替换音频标旧锚点stale，改变批准Script使配音依赖失效；同输入Fork不改逻辑ID，改变输入保留能证明身份的段落并标变化，不能把旧时间直接确认为新音轨。旧Phase01通用配音文本保持兼容/历史可读，不是可用VoiceTimeline；显式转换草稿或Fork后再建立。
