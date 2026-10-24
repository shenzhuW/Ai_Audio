# Phase05 远程验收补充索引

[最终远程验收报告](../../../PHASE_05_REMOTE_ACCEPTANCE.md)逐项对应九项要求、模型/许可/硬件/费用与风险；[verification.json](verification.json)为实际文件核对结果。

| 补充证据 | SQLite | PostgreSQL |
|---|---|---|
| 新建隔离库完整重跑 | [12组](voice/sqlite/results.json) | [14组](voice/postgresql/results.json) |
| 实际ASR请求字段与原始输出 | [model-transcribe-io](voice/sqlite/model-transcribe-io.json) | [model-transcribe-io](voice/postgresql/model-transcribe-io.json) |
| 实际align输入原文与原始输出 | [model-align-io](voice/sqlite/model-align-io.json) | [model-align-io](voice/postgresql/model-align-io.json) |
| 重复词/标点/零宽词位置 | [review-details](voice/sqlite/review-details.json) | [review-details](voice/postgresql/review-details.json) |
| 实际鼠标拖动音频定位 | [数据](voice/sqlite/playback-seek.json) / [截图](voice/sqlite/05-drag-seek.png) | [数据](voice/postgresql/playback-seek.json) / [截图](voice/postgresql/05-drag-seek.png) |
| 改字幕/时间后应用重启 | [快照前后](voice/sqlite/edited-restart.json) / [截图](voice/sqlite/05-edit-after-restart.png) | [快照前后](voice/postgresql/edited-restart.json) / [截图](voice/postgresql/05-edit-after-restart.png) |
| 任务取消/迟到屏障 | [cancel](voice/sqlite/cancelled-job.json) / [stale](voice/sqlite/stale-result-job.json) | [cancel](voice/postgresql/cancelled-job.json) / [stale](voice/postgresql/stale-result-job.json) |
| 迁移与Schema | SQLite启动增量表/重启测试见results | [migrations](voice/postgresql/migrations.log) / [drift](voice/postgresql/schema-drift.log) |

`real-asr.json`含未配置/超时/真实重试全部审计，`real-alignment.json`含数据库Job、输入文稿绑定及转换后的Cue；`model-*-io.json`保留真正模型进程的原始words和segments，未复制用户私有文件，只删除宿主路径。公开音频及原文位于[fixtures/voice](../../../../fixtures/voice/README.md)。

[本机环境](environment.json)、[独立FFprobe](ffprobe.json)、[原代码252文件安全扫描](code-security-audit.json)、[本轮材料安全扫描](material-security-audit.json)、[原始完整证据索引](../README.md)。本轮命令输出为`remote-*.log`。运行时模型、venv、数据库、凭据、会话和私有work目录不在本索引；不以Mock替代真实ASR/align。
