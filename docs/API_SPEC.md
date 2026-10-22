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
HTTP 400 输入错误；401 未认证；403 未许可；404 对象不存在；409 审核/修订冲突；422 状态不合法或授权门禁；429 额度限制；500 内部错误；503 Provider 不可用。日志不可含 API Key。

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
| POST | `/projects/:id/asset-search-runs` | 按 visualIntent 搜索内部/外部授权素材 |
| GET | `/projects/:id/assets` | 多状态筛选和来源授权 |
| GET | `/assets/:assetId/index` | 带时间码的视频摘要、关键帧 |
| POST | `/projects/:id/candidate-clips` | 保存镜头候选源区间（虚拟裁剪） |
| POST | `/projects/:id/prepare-assets` | 按已批准 AssetBinding 自动生成派生文件；**无裁剪审批** |
| POST | `/assets/:assetId/license-evidence` | 记录真实许可凭据并校验适用范围 |

素材搜索示例：
```json
{
  "storyboardRevisionId":"rev_story_v2",
  "shotId":"shot_03",
  "visualIntent":"GPU 数据中心服务器通道实拍，适合叠加数据流",
  "types":["image","video"],
  "desiredDurationMs":6000,
  "providers":["internal","pexels","pixabay"],
  "licenseRequirement":"commercial_use"
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
| POST | `/projects/:id/export-runs` | 通过批准/授权门禁后正式生成 |
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
