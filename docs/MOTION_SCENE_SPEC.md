# SceneSpec 与 Motion Code Agent 协议

## 1. 原则
- 一个项目视频由若干镜头 Shot 组成，不机械每一句一个 Shot；导演表优先说明观众获得的信息。
- SceneSpec 是**可编辑的画面意图**，TSX 是其**实现**。Agent 不得把 TSX 当成唯一的可持久状态。
- 组件库优先（受测组件 + schema），个性化视觉表达可生成自由代码，但进入隔离执行环境。
- 图层支持授权视频/图片作底层 + React/SVG/Canvas 绘制文字、数值、路径、高亮和相机运动；字幕统一来自 VoiceTimeline。
- 所有动画均以 frame 和 inputProps 确定，不依赖 `setTimeout`/普通运行时随机源，也不依赖浏览器真实世界时间。

## 2. SceneSpec v1 示例
```json
{
  "schemaVersion": 1,
  "sceneId": "scene_03",
  "shotId": "shot_03",
  "narrativeGoal": "说明 GPU 擅长大规模并行计算",
  "fps": 30,
  "durationFrames": 750,
  "resolution": {"width":1080,"height":1920},
  "scriptSegmentIds": ["seg_gpu"],
  "cueBindings": [{"cueId":"cue_gpu","targetElementId":"title","action":"emphasize"}],
  "layers": [
    {"id":"bg","kind":"video","assetBindingId":"bind_gpu_video","fit":"cover","zIndex":0},
    {"id":"data-lines","kind":"component","component":"GlowLine","zIndex":20,"props":{"count":12,"color":"#3B82F6"}},
    {"id":"chart","kind":"component","component":"BarChart","zIndex":30,"dataRef":"dataset_gpu","props":{"accent":"#60A5FA"}},
    {"id":"title","kind":"component","component":"KineticText","zIndex":40,"props":{"text":"GPU 并行计算","fontSize":72}},
    {"id":"subtitles","kind":"subtitle","voiceTimelineRevisionId":"rev_voice_approved","zIndex":50}
  ],
  "transition": {"in":"crossfade","out":"camera-pull"},
  "visualStyleGuideId":"style_darktech_v1"
}
```
这只是建议契约，不是 Remotion 原生 JSON。实际实现时 schema 必须校验镜头时间、图层顺序、组件支持比例与依赖权限。

## 3. ComponentCatalog 元数据
```ts
interface ComponentDescriptor {
  id: string;
  version: string;
  entryFile: string;
  propsSchemaRef: string;
  editablePropNames: string[];
  supportedAspectRatios: string[];
  visualTags: string[];
  previewRef?: string;
  licenseRef: string;
}
```
**首批组件**：VideoLayer、ImageLayer、KineticText、Subtitle、NumberTicker、BarChart、LineChart、GlowLine、SpotlightAnnotation、BasicCamera。不要第一天就开发功能齐全的 3D 引擎。

## 4. AI Code Agent 的工具集
`listComponents`、`readScene`、`writeScene`、`patchScene`、`validateScene`、`typecheck`、`renderStill`、`renderPreview`、`getRenderLog`、`reviewFrames`。仅 Render Worker 可以执行不可信代码；Agent 只调用受限工具协议。

**生成任务输入** 固定 storyboardRevisionId、sceneSpecRevisionId、styleGuideVersion、componentCatalogVersion、assetBindingRevisions、voiceTimelineRevisionId。输出 TSX BlobRef、组件列表、依赖/许可证清单、编译结果和质量记录。

## 5. 动画与配音绑定
- `cueId` 是稳定的对齐锚点，计算 `frame=round(startMs/1000*fps)`；每个场景注意局部帧与全局帧坐标转换。
- 同一句重复词语必须使用 anchorId 而非 `indexOf` 查第一个匹配的字符串。
- 更改 TTS 时对齐会更新 VoiceTimeline 修订并标记受影响场景 stale；不要默默复用旧时间轴。

## 6. 媒体渲染与反馈循环
```text
SceneSpec → 组件匹配 / Agent 生成代码 → 禁用危险依赖检查 →
隔离 typecheck / bundle → 关键帧截图与连续预览 →
规则 QA +（可选）视觉模型 → 找到 SceneId/ElementId →
生成 Patch 作为新修订 → 最多 N 次尝试 → 用户预览/审核
```
- 视频里所有数字绑定 `dataRef`，禁止 Code Agent 发明“权威数据”。
- 修复作用域必须明确，AI 不应在用户要求修改镜头 03 时顺手改镜头 01/02。
- QA 不只是好看与否：还要检查黑帧、文字被裁、语音不同步、画面突然跳变、授权缺失、叙事表达偏差。
- 生产级 RenderManifest 冻结所有版本+渲染工具链版本+处理参数，用于重建/审计。

## 7. 第 08 页验收
- 一个实际视频底图 + 3 个程序化层在预览和 MP4 中可见。
- 修改 `title.fontSize` 不需要整项目文稿重做。
- AI 生成新 TSX 的失败有可见错误，不可能获得主站服务端秘密。
- 自定义源代码的部分属性只在组件显式声明时开放 UI 修改。
