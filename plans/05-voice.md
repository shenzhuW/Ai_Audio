# Phase 05 — 配音模式、字幕与时间基准

**边界**：这是本阶段目标，Codex 不得一次性开发后续所有功能。见 `docs/DECISIONS.md`、`docs/ARCHITECTURE.md`、`docs/UI_SPEC.md`。

## 参考仓库阅读与适配
开工前阅读 wallstreet-explainer `scripts/temp_voice.py`，对比临时语音和正式时间锚点策略。 请将已核实结论、路径、日期与许可注意事项记录到 `docs/REFERENCE_REVIEW_LOG.md`。

## 输入与前置条件
- 已通过上一阶段的测试门禁；仓库 `AGENTS.md` 与原型资料可读。
- 若使用外部 Provider，密钥与许可条件由用户提供；未具备时明确演示 Mock。

## 本阶段开发任务
### 本轮实施细化（2026-10-24）
- 用户追加强验收：实际中文ASR并生成字幕草稿；已知文稿+配音的真实模型强制对齐；第05页播放核对字幕并可人工修正。不能用均分估时、Mock或只接Adapter替代这两项。评估本机Whisper与stable-ts的真实推理，失败记录保留，不修改全局Python/Windows环境。
- 基线3e5e726；原有45项单元已实际通过。复用Workflow/Job，增加Voice模块、三张增量快照表（timeline、cue版本、subtitle track）；仅在隔离SQLite/PG库验证0005，不自动迁移用户库。
- 先验证Provider：Windows System.Speech中文Huihui/英文Zira已安装，PoC实际输出9.601451秒PCM WAV。作为可选“真实本机系统TTS（非神经模型）”，不冒充Codex或云端AI声音；云端神经TTS标未配置；本地ASR/强制对齐通过独立CPU模型实际验证。无配置与显式Mock不输出假音频。
- 导入WAV/MP3/M4A/FLAC/Ogg执行内容签名/大小校验、Worker FFprobe纯音频检查、受保护Range下载，原件不可变；实际时长与手工/估算锚点明确区分。
- 固定当前有效已批准ScriptRevision及稳定segmentId。Cue统一sentence/phrase/word，以UTF-16起止位置+段落SHA映射重复词；cueId/anchorId跨保存和同输入Fork保留；不同层级可嵌套，同层及单轨字幕不重叠。
- 三模式保存真实状态，调整Cue/字幕、增删/偏移、确认时间基准。替换音频/文稿显示失效，批准快照不回写；TTS/导入缺音频的草稿可保存，不能作为正式音频批准。
- 第05页真实播放/定位/刷新、审核/驳回/Fork/历史/差异、409保留缓冲；试听与正式用途分开。沿用Worker心跳/租约/取消/重试/幂等，可信系统语音进程不接收用户命令、SSML、模型代码或额外凭据。
- 实际音频、Chrome播放、双库重启、数据库只读保护与相关Phase00–04.5回归验收；完成后本地提交，停止，不进入Phase06，不推送。

- AI TTS/导入音频/无口播三种 mode；接口统一输出 VoiceTimeline、Cue、SubtitleTrack。
- AI TTS 通过可替换 Provider；缺少 Key 时给清楚的 Mock 结果（Mock 不伪造真实声音）。
- 导入音频执行 FFprobe，按要求调用转录/强制对齐适配器；无口播允许用户按节奏定义静默轨。
- Cue anchorId 稳定，重复词不能仅凭字符串匹配；语音或文稿变更需标记相关 Cue stale。
- 第 05 页至少支持播放真实已导入音频、调整字幕文字/时间、确认适用时间基准。

## 可验收交付物
- 三模式都能保存有效时间轴和明确状态；导入音频成功可试听并显示真实时长。
- 第 05 页可以编辑一条字幕并保存/刷新，批准的时间轴不可直接覆盖。
- 词/短语 Cue 的开始结束都满足边界，重叠/越界产生校验提示。

## Codex 必须报告
1. 修改文件、数据迁移和关键设计取舍。
2. 实际执行的安装/测试/类型检查/启动/媒体渲染命令及结果。
3. 页面截图或媒体产物可验证路径；Mock/Real 区分。
4. 遗留问题与下一阶段依赖；**完成本阶段后停止，不自动扩建下一阶段**。

## 本轮交付状态（2026-10-24）

真实ASR/模型强制对齐/音频与字幕时间轴/三模式/版本保护已完成双库及Chrome主流程验收；单元56项通过，完整回归、原始模型审计、失败/重跑和风险见`docs/PHASE_05_DELIVERY.md`及`docs/evidence/phase05/`。ASR/对齐真实运行，云端神经TTS未配置，Windows系统TTS真实运行；不混淆状态。完成本地提交后停止，等待正式审核，不推送或进入Phase06。
