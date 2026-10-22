# 工作流与增量更新规范

## 1. 生产主流程
```text
CREATE_PROJECT
 → RESEARCH (可按用户已有文稿跳过)
 → REVIEW_RESEARCH (有研究产物时)
 → WRITE_SCRIPT / IMPORT_SCRIPT
 → REVIEW_SCRIPT
 → GENERATE_VOICE / IMPORT_VOICE / NO_VOICE_TIMELINE
 → CONFIRM_VOICE_TIMELINE
 → PLAN_DIRECTOR_SHOTS
 → SEARCH_AND_MATCH_MEDIA
 → REVIEW_STORYBOARD_AND_ASSETS
 → PREPARE_MEDIA (自动无审批)
 → GENERATE_SCENE_CODE (可并行按镜头)
 → RENDER_PREVIEW_AND_QA
 → REVIEW_FINAL_VIDEO
 → EXPORT_FINAL (许可门禁)
```

## 2. 审核边界
- 一个逻辑产物多版本；提交审核需携带 revisionId 与 expectedVersion，批准时校验仍然是当前候选版本。
- 保存草稿 ≠ 审核提交 ≠ 批准；批准只能由明确按钮/API 执行。
- 正式素材裁剪、FFmpeg 转码及关键帧抽取作为任务，不是 ArtifactApproval，不出现审核按钮。
- 原型中的“已审批/已授权/已核实”是展示状态，真实状态必须后端驱动。

## 3. 素材双轮检索
- 第一轮研究：网页/报告/视频/图表理解；视频保留源地址、标题、时间索引、字幕片段、内容摘要；只对可能相关对象做轻量抽帧；不批量裁剪最终片段。
- 第二轮分镜：导演先决定 `visualIntent`、对象、动作、镜头长度和可叠加区域；内部库优先搜索，外部 Provider 补充，筛选许可和画面相关性；定位候选源区间。
- 用户在导演分镜里批准素材**使用方案**（源、区间、画面角色）。批准后 Media Worker 才准备精确片段；无需批准文件裁剪。
- 素材授权门禁独立于内容相关性；即使最相关也不能绕过许可要求。原创/无版权可用素材不足时提供代码绘图替代方案。

## 4. 版本与增量失效案例
| 改动 | 需要重新检查/生成 | 可继续保留 |
|---|---|---|
| 修改研究事实 | 引用该 Claim 的文稿、图表、有关镜头 | 无关资料、未关联镜头 |
| 修改文稿第 3 段 | 对应配音和 Cue，引用此段的镜头与下游视频 | 其他研究与未受影响代码 |
| 更换音色/语速 | VoiceTimeline、字幕、使用有关 Cue 的镜头时序 | 文稿与资料 |
| 更换镜头素材 | 对应 AssetBinding、PreparedAsset、场景预览、最终合成 | 研究、文稿、其他镜头 |
| 调整标题颜色 | SceneSpec 参数/受影响镜头预览、最终合成 | SourceAsset、文稿、配音 |
| 改变画幅 | 布局和画幅相关场景、媒体裁切、成片 | 事实资料、文稿和源素材 |

`stale` 是下游依赖有效性标记，不能删除旧产物。展示“预计影响范围”供用户知情，重建预算由后端控制。

## 5. 任务重试/取消
- 长任务应提供 `jobId`，可轮询状态；可以局部重试失败场景。
- 阶段任务必须记录明确的输入修订和幂等键；同一审批事件不启动重复任务。
- 取消仅终止可安全取消的外部进程，不可将任务取消当作批准状态回滚。
- 外部 API 失败可返回 `provider_unavailable` 并提供 Mock 演示路径，但不能伪装真实完成。

## 6. 质量与审核意见
审核反馈以 `projectId + renderRevisionId + frame/timeMs + shotId? + text` 保存。AI 改动明确指向目标版本，建议不得直接覆盖已批准镜头。修复后生成新预览，再比较原版本。
