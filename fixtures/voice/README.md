# Phase 05 自制中文语音样例

`chinese-system-speech.wav` 是本机 Windows System.Speech 的 Microsoft Huihui Desktop (`zh-CN`, rate 0) 从以下自制测试文字实际合成的声音。不是用户录音、不是神经 TTS、不是 Mock 或静音占位；不含真人私有资料。仅供本仓库内部验收，不声明 Windows 声音资产的再分发商业许可。

> 测试，测试。这是配音时间轴的真实语音。字幕和词语时间需要分别校验。

实际 FFprobe：PCM s16le、22050 Hz、单声道、9.601451 秒，文件 423470 bytes。应用向上取整为 9602 ms。SHA256 见 `docs/evidence/phase05/*/real-asr.json` 的 `audioSha256`，测试会独立重算。

操作：创建已有文稿项目 → 将上文创建为结构化文稿并提交/批准 → 第05页“导入配音·建立草稿” → 上传此 WAV → 启动 Worker → 执行真实识别生成字幕草稿 → 执行按批准文稿强制对齐 → 播放/定位/人工修正 → 保存 → 确认时间基准 → 提交审核。ASR 不接收这段参考文稿；强制对齐才接收。

Whisper base 的实际独立识别含繁体及“教驗”同音错误，保留原始输出，不冒充正确逐字转录。强制对齐的零时长词保留在 raw words，不产生伪造独立时长。测试检查模型声学时间、字符位置、页面播放时序和手动修正；不宣称达到人工标注的毫秒精度。

重复测试：按 [VOICE_SETUP](../../docs/VOICE_SETUP.md) 安装本地引擎后执行 `node tests/voice/run.cjs`，PG 使用 `--postgres`。每轮新建隔离库和私有目录，不导入旧用户数据。
