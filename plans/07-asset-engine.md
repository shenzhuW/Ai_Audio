# Phase 07 — 素材搜索、许可与自动准备

**边界**：这是本阶段目标，Codex 不得一次性开发后续所有功能。见 `docs/DECISIONS.md`、`docs/ARCHITECTURE.md`、`docs/UI_SPEC.md`。

## 参考仓库阅读与适配
开工前阅读 wallstreet-explainer `scripts/footage.py`、`references/sourcing.md`，重点验证联系表、镜头切点和按需裁剪；不得将 yt-dlp 能下载视为有素材使用授权。 请将已核实结论、路径、日期与许可注意事项记录到 `docs/REFERENCE_REVIEW_LOG.md`。

## 输入与前置条件
- 已通过上一阶段的测试门禁；仓库 `AGENTS.md` 与原型资料可读。
- 若使用外部 Provider，密钥与许可条件由用户提供；未具备时明确演示 Mock。

## 本阶段开发任务
- 内部素材库优先，外部 Provider Adapters（首版候选 Pexels、Pixabay，API/许可可用性现场验证）；支持用户上传和官方资料 Research-only。
- 查询由 DirectorShot.visualIntent + 画幅/时长/素材类型驱动，不把整段文稿原封不动丢给 API。
- 去重、许可可用性、画面相关性、候选片段时间索引；只对 Top-K 候选进行更深的视频分析。
- 允许用户在第 06 页批准**素材使用方案**；在第 07 页查看原始 SourceAsset/候选 CandidateClip/实际使用 AssetBinding。
- 批准后自动 FFmpeg 裁剪/转码缓存（PreparedAsset）并记录 recipeHash，不出现单独裁剪审批。
- 下载强制 SSRF 与文件大小/时长约束，`cleared` 需要实际 LicenseRecord。

## 可验收交付物
- 原始素材保持不变，给同一源视频建立两个区间候选不产生两份原素材副本。
- 第 07 页能以素材类型、许可证和制作状态过滤；第 06 页可绑定到镜头。
- 对被标记 `pending` 的媒体，正式导出得到 LICENSE_BLOCKED；使用自有测试素材可正常准备。
- FFmpeg 区间裁切输出时长和入出点满足可解释误差界限，并留完整日志。

## Codex 必须报告
1. 修改文件、数据迁移和关键设计取舍。
2. 实际执行的安装/测试/类型检查/启动/媒体渲染命令及结果。
3. 页面截图或媒体产物可验证路径；Mock/Real 区分。
4. 遗留问题与下一阶段依赖；**完成本阶段后停止，不自动扩建下一阶段**。
