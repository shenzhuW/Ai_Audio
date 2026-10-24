# Phase05 验收证据

2026-10-24远程验收补充：[报告](../../PHASE_05_REMOTE_ACCEPTANCE.md)、[新双库重跑/原始模型IO/拖动/字幕修改后重启](remote/README.md)。原证据保留，本轮没有修改已交付业务功能。

语音主链路使用真实中文WAV和本地Whisper/stable-ts，不是Mock。浏览器为真实Chrome的自动操作，不代表用户已经人工体验或独立听审。

| 验收 | SQLite | PostgreSQL |
|---|---|---|
| 主流程/数据库/版本 | [12组结果](sqlite/results.json) | [14组结果](postgresql/results.json) |
| 实际独立ASR及三次尝试 | [识别/失败/重试审计](sqlite/real-asr.json) | [识别/失败/重试审计](postgresql/real-asr.json) |
| 给定文稿声学对齐/原始词/Cue | [模型结果](sqlite/real-alignment.json) | [模型结果](postgresql/real-alignment.json) |
| 实际取消 | [状态及审计](sqlite/cancelled-job.json) | [状态及审计](postgresql/cancelled-job.json) |
| 迟到结果保护 | [旧版本任务](sqlite/stale-result-job.json) | [旧版本任务](postgresql/stale-result-job.json) |
| 第05页实际播放 | [截图](sqlite/05-playing-subtitle.png) | [截图](postgresql/05-playing-subtitle.png) |
| 人工改字幕及时间刷新 | [截图](sqlite/05-manual-edit-persisted.png) | [截图](postgresql/05-manual-edit-persisted.png) |
| 409保留缓冲 | [截图](sqlite/05-conflict-buffer.png) | [截图](postgresql/05-conflict-buffer.png) |
| 批准版只读 | [截图](sqlite/05-approved-readonly.png) | [截图](postgresql/05-approved-readonly.png) |
| 真实系统TTS | [截图](sqlite/05-real-system-tts.png) | [截图](postgresql/05-real-system-tts.png) |
| 无口播180秒 | [截图](sqlite/05-silent-timeline.png) | [截图](postgresql/05-silent-timeline.png) |
| 移动端 | [截图](sqlite/05-mobile.png) | [截图](postgresql/05-mobile.png) |

FFprobe独立输出见[ffprobe.json](ffprobe.json)，Python精确版本/元数据许可见[python-versions.json](python-versions.json)。模型权重、虚拟环境、原始认证、会话和运行时原件目录未进入证据包；唯一公开音频为[自制WAV](../../../fixtures/voice/chinese-system-speech.wav)。

回归：[研究/Phase00–01](regression-research/)、[真实Remotion](regression-render/)、[文稿](regression-script/)、[真实Codex搜索/图片/视频/候选Claim/整体及局部写稿/取消/批准](regression-real-ai/)。每目录包含真实结果和截图；`logs/`保存脱敏命令输出，`summary.json`由`node tests/voice/collect-evidence.cjs`核对生成，不手工改PASS。重复测试MP4保留本机，避免再次提交已验收的测试视频，FFprobe/帧/渲染元数据可公开查看。

操作顺序见[夹具说明](../../../fixtures/voice/README.md)，引擎安装和启动见[VOICE_SETUP](../../VOICE_SETUP.md)。模型时间由原始words决定，字幕可人工纠错；ASR草稿未绑定不能批准。没有模型时，验收命令实际失败，不能以Mock替代。

失败记录与实际重跑见[diagnostics/README.md](diagnostics/README.md)。运行中的生产实例不得同时重建共享`.next`，各测试使用独立数据与端口；本轮没有修改旧阶段功能来适配测试。
