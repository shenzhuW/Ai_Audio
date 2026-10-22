# 核心数据模型与版本协议 v1.2

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
| `SourceAsset` | id, sourceId?, blobId?, kind, licenseStatus, licenseEvidenceRef?, metadata, contentTags | licenseStatus 由可信规则/用户核验 |
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
- `research_only`（仅内容分析）；`pending`（候选未证实）；`cleared`（有适用授权凭证）；`blocked`（许可不允许）。
- `cleared` 必须有 `LicenseRecord`，不同项目/平台使用范围可以不同。素材相关性再高也不能覆盖 License 拒绝。

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
4. 引用 `pending` 或 `research_only` 授权的素材时，正式导出得到 `LICENSE_BLOCKED`，同时保留预览能力（预览也必须遵守适用许可）。
5. 同一素材多个 CandidateClip 不复制/覆盖源文件；独立生成 PreparedAsset，按 recipeHash 复用。
