# Phase 05 本机配音、识别与强制对齐

需要 Node/pnpm 与 PATH 中的 FFmpeg/FFprobe。Web 与 `pnpm worker` 必须使用同一数据库和绝对 `STUDIO_DATA_DIR`。生产验收使用独立目录；不要修改用户数据库指向。PostgreSQL 先备份、审核后再手动执行 `pnpm db:generate` 和 `pnpm db:migrate`，包含追加的 `0005_voice`；不会自动把 SQLite 数据复制到 PG。

## Provider 的实际边界

| 能力 | Provider | 运行条件 |
|---|---|---|
| TTS | Windows System.Speech / SAPI | 显式 `STUDIO_SYSTEM_TTS_ENABLED=1`，Windows PowerShell 5.1/.NET、本机已安装声音。实际验证 Huihui 中文和生成 WAV；系统声音不是神经 AI。 |
| 云端神经 TTS | unconfigured | 未接入付费 API；提交任务明确失败，不生成假音频。 |
| 中文 ASR | openai-whisper/base + stable-ts | 本地模型真实 CPU 推理；ASR 无参考文稿输入，识别错误由用户修正。 |
| 强制对齐 | 同一模型 `model.align` | 固定已批准文稿及真实音频，句/词时间来自声学模型；零时长词不补造时长。 |
| 人工 / 估算 | manual / estimated | 明确标识，不算模型对齐；静默轨只允许 planned。 |
| Mock | 显式 mock | 不输出音频、转录或伪精确时间，任务明确失败。 |

Codex CLI 的文本/搜索/视觉不具备本项目所需音频合成接口；不扩大其权限，也不复制其认证。上述本地语音引擎不需要 OpenAI API Key。

## 项目内独立安装

本次实际使用 Python 3.8.16、CPU torch/torchaudio 2.4.1、Whisper 20250625、stable-ts 2.19.1。依赖见 `scripts/voice-requirements.txt`；安装只写忽略的 `.tools/speech-python` 和 `.cache/voice-models`，不改全局 Conda 环境。其他 Python/系统组合需重新验证，不能承诺通用兼容。

```powershell
# 显式联网安装，模型约139MB，torch约199MB，预留数GB磁盘。
powershell -NoProfile -File scripts/setup-voice-speech.ps1 -Python python
$env:STUDIO_SYSTEM_TTS_ENABLED='1'
$env:STUDIO_SPEECH_ENABLED='1'
# 默认单音频模型推理上限600秒，任务超时600000ms；都可配置。
$env:STUDIO_SPEECH_MAX_SECONDS='600'
$env:STUDIO_SPEECH_TIMEOUT_MS='600000'
$env:STUDIO_DATA_DIR='W:/path/to/isolated-private-data'
pnpm dev
# 新终端设置同样的环境变量，再启动：
pnpm worker
```

可选服务端绝对路径 `STUDIO_SPEECH_PYTHON`、`STUDIO_WHISPER_MODEL_PATH`。运行时不下载模型。加载前验证官方 base.pt SHA256 `ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e`；错误权重拒绝加载。网页不能指定解释器、模型、命令或文件路径。

全局上传限制 `STUDIO_MAX_UPLOAD_MB` 默认10、最大100；项目/音轨时长上限 `STUDIO_MAX_DURATION_SECONDS` 默认3600。模型单任务上限独立并在第05页显示。每修订最多2000 Cue及2000字幕，超限失败；长音频分批优化留后续，不以固定样例时长限制产品。

## 数据与安全

可信固定 PowerShell/Python 程序接收 JSON 数据；不执行用户命令、SSML、模型生成代码或 Git。模型子进程只继承 render-worker 的白名单环境，不继承数据库 URL、API Key、Codex认证环境；工作目录为私有 `voice-work/<runId>`。该环境过滤不等于 OS 文件/网络沙箱，固定可信引擎仍可访问宿主机文件；不允许替换成未经审查脚本。Phase04.5 Codex门禁原样保留。

`voice-blobs` 保存不可变原件；`voice-work` 保存模型请求/输出、stderr和系统合成中间文件，可能含文稿/音频路径，是私有数据，和数据库/会话一起不得提交。失败/取消诊断保留，不自动清理用户数据。共享 Worker 有心跳、租约、取消/重试和目标版本屏障；过期任务不能写入批准或已修改修订。

ASR字幕是未绑定草稿，不能直接批准；人工绑定或真实对齐后，试听、修正并确认。批准只表示用户确认，不自动升级人工/估算为精确模型时间。字幕文本可独立纠错，稳定 segmentId 和文稿 Claim/Source 不变。更换正式音频使旧锚点失效；更换批准文稿使整个配音依赖失效。

回滚：停 Worker，备份数据库和整个私有目录，检出基线代码；保留新增表与原件，不 reset/drop/delete。旧版不理解真实 VoiceTimeline，后续创作必须使用匹配代码。旧文本配音修订仍可读；通过 Fork 后显式转换草稿，不将旧文本当作可用音频时间轴。

## 验证

```powershell
pnpm test
pnpm typecheck
pnpm build
node tests/voice/run.cjs
# 按 POSTGRESQL_LOCAL.md 启动专用本机集群，再运行：
node tests/voice/run.cjs --postgres
```

验收使用 Chrome 和3015/3016端口，独立数据/数据库。无引擎时测试会失败，不降级Mock宣称真实通过。stable-ts 仓库已归档（2026-05-30），适配层可替换；模型错字、零宽边界、维护状态及旧Windows原生异常均记录为风险，不能凭一次重跑消除。
