# 素材与研究双阶段检索详细规范

> 2026-10-23：依据 D-17/D-18，以下流程面向内部开发测试。商业许可未知、不可商用、research_only/pending 标签不自动淘汰候选或阻断内部渲染/下载。记录来源和已知限制，不新建商业授权审批。资源访问仍遵守 DECISIONS 的访问保护边界。

## A. 第一轮：围绕主题进行内容研究

**输入** CreativeBrief 和上传资料。Research Agent 搜索网页、文章、论文、报告、图片、视频以及数据源；提取 Claim、图表数据与说明。视频可转写、抽帧、保存镜头边界和重要区间。**不在这时大规模制作剪辑片段**。

**产物**：ResearchReport、Source、ClaimRegistry、MediaIndex。Source 的用途可同时是事实证据和潜在视觉参考，但两种用途分别评分/审核。真实来源且取得可引用证据才可作为已核实事实。

**视频媒体轻索引步骤**：读取公开可访问、用户提供或已获访问权限的候选代理数据→FFprobe 技术元数据→按镜头或定间隔抽取时间码帧→有语音时使用可用 ASR→多模态理解/文本 OCR→保存 `TimecodedSegment`。对数百个搜索结果使用分层预算，初筛低成本，只深度分析 Top-K。

## B. 第二轮：围绕分镜找到画面

**输入** 通过审核的 Script、VoiceTimeline、DirectorShot 初稿：`narrativeGoal`、`visualIntent`、`viewerTakeaway`、镜头时长、目标画幅、期望空间布局、可叠加区域。

**检索意图的例子**：
```json
{
  "shotId":"shot_03",
  "visualIntent":"展示 GPU 服务器设备和并行计算的真实工业环境",
  "evidenceRole":"illustrative",
  "contentEntities":["GPU","server racks"],
  "shotStyle":"dark-tech",
  "overlaySpace":"right",
  "desiredDurationMs":6000,
  "aspectRatio":"9:16",
  "fallback":"programmatic_diagram"
}
```

**检索顺序**：①已分析的项目与全局资源 → ②已上传资源 → ③可访问素材 API（Pexels、Pixabay 等为候选）→ ④可访问的官方资料、新闻与其他公开来源。跨来源统一按画面匹配质量重排，不把商业许可未知直接当成研究专用或低质候选。

**候选步骤**：关键词、实体名、英文术语多查询 → Provider 结果归一化并记录来源/限制 → 哈希/感知去重 → 源真实性与可访问性检查 → 相关性检索/重排 → Top-K 多模态片段分析 → 镜头索引和联系表预览 → 时长、清晰度、画幅与构图评估 → 原视频时间区间建议 → 返回导演表。

**评分**：优先 semanticMatch / contentQuality / aspectFit / framing / sharpness / durationFit / overlaySpace 与片段时间匹配；不以商业许可标签作为内部测试硬门禁，也不因模型评价高就写“可商用”。访问失败、文件无效和安全检查可阻断技术流程，商业许可未知本身不阻断。

**实现参考（后续阶段研究，不代表已实现）**：充分查阅 wallstreet-explainer 的 `scripts/footage.py` 和 `references/sourcing.md`，记录具体 SHA/函数/适配差异；重点验证多查询找片、镜头切点、时间码索引、联系表、候选区间定位、按需裁剪与画面匹配。复用设计而不搬用其渲染链或绕过访问保护机制。

## C. 三层素材关系
- `SourceAsset` 保存源文件原始字节、技术元数据、sourceUrl、来源平台、作者（如有）及已知使用限制，缺失信息明确标未知。
- `CandidateClip` 是源时间段 + 内容语义 + 可能的镜头建议；**只是虚拟区间**。
- `PreparedAsset` 在导演分镜审批之后由 FFmpeg 自动物化裁剪/转码、缩放/封装，并根据原文件哈希和 recipeHash 缓存。

同一源文件可以有多段候选，不删除不覆盖原文件。系统不要求用户批准媒体处理任务，但用户需确认最终镜头采用了什么素材及时间区间。

## D. 素材叠加动画的空间信息
在视觉理解中可选提取 `safeTextRegions`、主体 bbox、可跟踪目标与遮挡标签。第一版只需固定 Overlay 布局 + 可编辑变换；运动跟踪/抠像留给 P2。普通视频图层可叠加：标题、字幕、SVG 连接线、重点高亮、动态图表、轻量摄像机推拉。

**事实证据 / 说明性画面严格分开**：数据中心 B-roll 可以用于说明计算基础设施，但不能冒充某一公司的特定数据中心或某一财务事件发生的证据。

## E. Provider Adapter（以实现为准）
```ts
interface AssetSearchProvider {
  id: string;
  supports: Array<'image'|'video'>;
  search(query: VisualSearchQuery): Promise<AssetSearchResult[]>;
  getUsageNotes?(candidate: AssetSearchResult): Promise<UsageNotes>;
}
interface MediaAnalysisProvider {
  inspect(assetId: string): Promise<TimecodedSegment[]>;
  suggestClip(assetId: string, intent: VisualSearchIntent): Promise<CandidateClip[]>;
}
```
- 统一 `providerId`、sourceUrl、sourcePlatform、creator（可缺省）、publisher、duration、width、height、metadata、knownRestrictions、thumbnailRef；已有 licenseEvidence 可保留，但不作为内部测试前置条件。
- Provider 速率限制与失败退避、可并发数量、下载大小/时长限制都在服务端配置。
- 不依赖单一平台；禁用或未配置某 Provider 时搜索其他来源，仍失败则建议代码图解而非无限搜索。

## F. API 用户场景验收
1. 研究阶段选中一段 60s 视频，只存内容时间索引而不创建 60s 全部正式裁剪文件。
2. 一段口播绑定到 5s 的候选范围，保存后可在分镜页预览原视频相应时间段。
3. 用户批准分镜后 PreparedAsset 自动生成（可用源文件直接引原区间，不一定预先物化），不需要额外“允许裁剪”按钮。
4. 换一个素材只使对应 AssetBinding、准备文件、场景预览和最终合成受影响；其他导演表和文稿复用。
5. 商业许可未知或不可商用的候选仍能完成分镜绑定、区间准备、Remotion 内部测试合成和 MP4 下载；来源/限制沿绑定与导出清单保留，无额外商业审批、不自动公开发布。
