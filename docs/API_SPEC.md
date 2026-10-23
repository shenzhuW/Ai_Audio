# HTTP API 契约 v1.2（建议草案）

> 使用 `/api/v1` 前缀，API 输入/输出 Zod，内部动作必须先在 service 层实现，再包薄 HTTP 接口；异步操作统一返回 202 + Job ID。首版单用户也需要受限 session；Cookie CSRF / API 认证方式由 Phase 00 文档记录后统一实施。

## 通用结构
成功：`{ "data": ..., "meta": { "requestId": "..." } }`；异步：`{ "data": { "jobId": "...", "status": "queued" } }`。
错误：
```json
{
  "error": {"code":"REVISION_CONFLICT","message":"修订版本已变化","details":{"currentRevisionId":"rev_004"}},
  "meta": {"requestId":"req_123"}
}
```
HTTP 400 输入错误；401 未认证；403 无访问权限；404 对象不存在；409 审核/修订冲突；422 状态不合法；429 额度限制；500 内部错误；503 Provider 不可用。日志不可含 API Key。按 D-17，商业许可未知或不可商用不作为内部测试合成/下载的错误或商业许可门禁。

## 项目与需求
| Method | Path | Action |
|---|---|---|
| POST | `/projects` | 创建，校验自定义 targetDurationMs、画幅、创作起点；返回 201 |
| GET | `/projects` | 列表 |
| GET | `/projects/:id` | 项目详情、各阶段状态与当前有效修订 |
| PATCH | `/projects/:id` | 改标题、预算、风格等，必须 expectedVersion |
| GET | `/projects/:id/workflow` | 当前阶段、运行任务、待确认事项、依赖影响 |
| GET | `/projects/:id/artifacts` | 产物类型、修订列表 |

创建示例：
```json
{
  "title":"为什么 AI 大模型需要大量 GPU？",
  "prompt":"解释 GPU 并行计算与大模型训练",
  "targetDurationMs":120000,
  "fps":30,"width":1080,"height":1920,"language":"zh-CN",
  "entryType":"topic","voiceMode":"tts","budgetLimit":{"currency":"CNY","amount":50}
}
```

## 产物/审核/版本
| Method | Path | Action |
|---|---|---|
| GET | `/artifacts/:artifactId/revisions` | 列出版本 |
| GET | `/artifacts/:artifactId/revisions/:revisionId` | 读取具体版本 |
| POST | `/artifacts/:artifactId/revisions` | 从已有版本新建草稿分支 |
| PATCH | `/artifacts/:artifactId/revisions/:revisionId` | 只允许编辑 draft，带 expectedVersion |
| POST | `/artifacts/:artifactId/revisions/:revisionId/submit` | 提交审核 |
| POST | `/artifacts/:artifactId/revisions/:revisionId/approve` | 批准精确版本 |
| POST | `/artifacts/:artifactId/revisions/:revisionId/reject` | 驳回并记录 comment |
| GET | `/artifacts/:artifactId/revisions/:revisionId/impact` | 预计受影响的下游修订 |

批准示例：
```json
{"expectedVersion":3,"comment":"文稿已审阅，可进入配音"}
```
**重要**：批准与“进入下一阶段”在事务中分别记录状态，并由 outbox/幂等任务调度确保最多启动一个下游 job。不可用前端简单按钮状态代替后端审核。

## 研究/资料
| Method | Path | Action |
|---|---|---|
| POST | `/projects/:id/research-runs` | 发起研究 job；需有明确真实或 Mock provider |
| GET | `/projects/:id/research-sources` | 来源列表/筛选/时间码 |
| GET | `/projects/:id/claims` | 事实状态和证据列表 |
| PATCH | `/projects/:id/claims/:claimId` | 更新研究审核标注，不可伪造核验来源 |
| GET | `/sources/:sourceId` | 来源详情和媒体时间索引 |

## 文稿/音频/导演
| Method | Path | Action |
|---|---|---|
| POST | `/projects/:id/script-runs` | 生成或改写指定段落 |
| POST | `/projects/:id/voice-runs` | TTS / import / none 路径生成 VoiceTimeline |
| GET | `/projects/:id/voice-timeline` | 语音、字幕、Cue |
| POST | `/projects/:id/storyboard-runs` | 用已批准脚本/音频生成导演镜头 |
| PATCH | `/projects/:id/shots/:shotId` | 编辑草稿镜头、图层和素材选择 |
| GET | `/projects/:id/storyboard` | 镜头、素材绑定、Cue 与目标 |

## 素材/检索/媒体
| Method | Path | Action |
|---|---|---|
| POST | `/projects/:id/uploads` | 获取安全上传地址/上传会话 |
| POST | `/projects/:id/asset-search-runs` | 按 visualIntent 搜索内部/可访问外部素材，优先画面与时间匹配 |
| GET | `/projects/:id/assets` | 多状态筛选、URL/平台/作者/已知限制 |
| GET | `/assets/:assetId/index` | 带时间码的视频摘要、关键帧 |
| POST | `/projects/:id/candidate-clips` | 保存镜头候选源区间（虚拟裁剪） |
| POST | `/projects/:id/prepare-assets` | 按已批准 AssetBinding 自动生成派生文件；**无裁剪审批** |
| POST | `/assets/:assetId/license-evidence` | 后续商业发布扩展预留；当前不实施商业授权审批 |

素材搜索示例：
```json
{
  "storyboardRevisionId":"rev_story_v2",
  "shotId":"shot_03",
  "visualIntent":"GPU 数据中心服务器通道实拍，适合叠加数据流",
  "types":["image","video"],
  "desiredDurationMs":6000,
  "providers":["internal","pexels","pixabay"],
  "usageContext":"internal_test"
}
```

## 动画/预览/审核/导出
| Method | Path | Action |
|---|---|---|
| POST | `/projects/:id/motion-runs` | 生成指定镜头 TSX/SceneSpec，返回 jobId |
| POST | `/projects/:id/preview-runs` | 真实渲染可信预览视频或关键帧 |
| GET | `/projects/:id/scenes/:sceneId` | 镜头代码/Props/预览/日志版本 |
| POST | `/projects/:id/scenes/:sceneId/patch` | 对指定修订局部修改，不覆写已批准修订 |
| POST | `/projects/:id/review-comments` | 带视频版本、timeMs 和 shotId 的意见 |
| GET | `/projects/:id/review-comments` | 评论列表和处理状态 |
| POST | `/projects/:id/quality-runs` | QA 检查 job |
| POST | `/projects/:id/export-runs` | 通过创作批准/媒体完整性检查后生成内部测试产物，许可未知不阻断 |
| GET | `/projects/:id/exports` | 导出产物及下载链接 |

## Job / 进度
| Method | Path | Action |
|---|---|---|
| GET | `/jobs/:jobId` | queued/running/succeeded/failed/cancelled，阶段、attempt、错误 |
| GET | `/jobs/:jobId/events` | 可用 SSE 或轮询，首版先实现稳妥轮询 |
| POST | `/jobs/:jobId/cancel` | 尽最大努力安全取消 |
| POST | `/jobs/:jobId/retry` | 原输入修订重复生成新 attempt，预算许可校验 |

## 系统性条件
- 异步 POST 支持 `Idempotency-Key`；versioned PATCH 必须有 `expectedVersion`，冲突 409。
- 任务输入始终固定 exact revision IDs；禁止持续从 `latest` 读取中途变化的数据。
- 原型页面中“可下载”按钮必须真实存在合法 BlobObject + 当前用户访问权限，否则禁用并说明。
- 真实 Provider 没配置时后端返回明确 `PROVIDER_NOT_CONFIGURED` 或选择标有 `mock` 的工作模式。
- 文件下载 URL 短期有效、限制访问范围；上传失败及时清理临时对象。

## Phase 01 已实现子集（2026-10-22）

旧项目 GET/PATCH 继续使用 Phase 00 的 Project JSON 与 version，不将 workflow 状态写回初始需求。`GET /projects/:id/workflow` 是当前阶段、待审核、依赖失效、实际任务及审计的唯一查询入口；`GET /projects/:id/artifacts` 列出稳定产物身份。

新增 `POST /projects/:id/artifacts` 创建首份手动草稿，body 为 `{type,text,inputRevisionIds}`；同类产物已存在返回 409，后续使用已有修订 fork。本文定义的 revisions 查询、PATCH、submit/approve/reject/impact 已实现；`POST /artifacts/:artifactId/revisions` 要求 `{revisionId,expectedVersion,inputRevisionIds?}`。不传 inputs 时保留原依赖，传入时只接受本项目当前有效批准版；禁止同阶段/逆向依赖。草稿正文保存在版本化修订 JSON 中，最多 50000 字符，contentHash 为正文规范 JSON 表示的 SHA256，不是附件字节散列。

所有 workflow 写请求（含 PATCH）要求 `Idempotency-Key`，与旧项目创建/PATCH 规则分开，保持兼容。同项目同键同动作/内容返回原始结果，不重复审核或排队；同键异内容返回 `IDEMPOTENCY_CONFLICT` 409。expectedVersion 是当前修订的并发版本，不是 revisionNumber；旧候选批准返回 `REVISION_CONFLICT` 409。批准版 PATCH 返回 422，驳回和已提交版本也不可直接编辑，只能 fork。

`POST /projects/:id/research-runs`、`script-runs` 仅创建明确标记的 Mock 文本任务，body `{inputRevisionIds:[]}`，返回 202 `{jobId,status}`。API 不执行任务；独立 Worker 领取持久 Outbox。GET jobs/events 和 POST cancel/retry 已实现；取消/重试 body `{expectedVersion}`。审批事务原子保存事件、下游 Job、Outbox 和幂等响应。任务每次尝试绑定原 inputRevisionIds，最多 3 次，租约 30 秒；中断后标记 `WORKER_INTERRUPTED`，需显式重试。

当前 Worker 只生成研究/文稿 Mock 文本（始终 mock=true），不验证事实或授权。配音及其他提供方未配置时任务失败 `PROVIDER_NOT_CONFIGURED`，没有音频或视频输出；不会用静态原型冒充产物。手动内容 mock=false 表示用户输入，仍是“未核实”。Job 成功只代表文本草稿实际已落库，不代表已批准。

本小节之外的研究来源、Claim、音频、分镜和完整导出接口仍为后续阶段草案；Phase 02 的真实渲染子集如下。

## Phase 02 已实现子集（2026-10-23）

- `POST /projects/:projectId/render-runs`，必须 `Idempotency-Key`，严格 body `{presetId:"poc-v1",titleFontSize?:72}`，字号整数 52–92，未声明字段拒绝。仅固定可信入口，不能提交 TSX、路径、URL 或自定义执行代码。202 返回 `{jobId,status}`；同键同内容复用，同键异内容 409。
- `GET /projects/:id/workflow` 和 `GET /jobs/:id` 包含真实 Remotion Job；可选 `renderInput/renderResult/progress/heartbeatAt/logs`，历史 Job 无这些字段仍可读取。心跳更新遥测/租约，不递增取消使用的业务 version；领取/取消/重试/完成仍有并发版本保护。沿用现有 cancel/retry 接口与 attempt，不另建审批系统。
- `GET|HEAD /jobs/:jobId/render-files/:file`，仅当前用户且成功 Job，固定文件 `video.mp4`、`frame-060.png`、`frame-150.png`、`frame-240.png`、`ffprobe.json`、`manifest.json`。校验记录 SHA/大小，私有缓存策略，支持单段/后缀 Range 206；非法范围 416，未完成 409，匿名 401，其他文件名 400。没有公共视频发布入口。

Worker 生成真实 draft motion revision（mock=false），不自动批准；该 PoC 不依赖尚未实现的 Director，不生成虚假上游批准版本。项目自定义时长保持原值，只有此明确标示的验证 Composition 固定 10 秒。预览和下载使用同一最终 MP4，SceneSpec/Props/时间轴/版本固定在 manifest 中。详细运行和安全限制见 [Phase 02 交付](PHASE_02_DELIVERY.md)。
