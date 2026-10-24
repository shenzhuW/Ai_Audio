# Phase05 最终远程验收材料

日期：2026-10-24（Asia/Shanghai）。仅整理Phase05远程审核材料、加强验收断言，不新增业务功能、不进入Phase06。用户已授权安全核查通过后的正常快进推送。本报告形成于推送前；实际推送结果、代码与材料提交链接以最终交付回复及GitHub main为准。

## Git基线和提交安全

- 受检代码：[4869793eed1cbb2e448cb37bf44e47ea42715baf](https://github.com/shenzhuW/Ai_Audio/commit/4869793eed1cbb2e448cb37bf44e47ea42715baf)，父提交为已批准的`3e5e7268f175546fe226e893c71eeb6bb33e69b8`。
- 本轮开始`git status --short`为空。实际`git fetch origin main`后，`origin/main=3e5e7268…`，`git rev-list --left-right --count origin/main...HEAD`为`0 1`，ancestor检查退出0。待推送包含原代码提交和独立验收材料提交，不amend、不force、不重写历史；推送前再次fetch/检查，若远程变化则重新核对。
- 逐字节扫描原提交全部252个变化文件：[code-security-audit.json](evidence/phase05/remote/code-security-audit.json)。包含路径、大小、SHA256、Git blob清单；最大697163 bytes，密钥/认证JSON/JWT/签名会话/DB凭据/私有目录/数据库二进制/超大文件规则均无发现。材料提交另有[暂存字节扫描](evidence/phase05/remote/material-security-audit.json)；审计文件自身在最终私有扫描中另核对，避免自引用Hash问题。
- 唯一新增音频是[自制中文系统合成WAV](../fixtures/voice/chinese-system-speech.wav)，不是用户个人录音；[已知测试原文](../fixtures/voice/script.txt)由项目自编。SHA256为`eb3ac6c85fcda8f1467dd0557403e457ea24a1a00fc7e0176b9bb7d57a57f5d8`，423470 bytes。没有新增真人身份、私有录音、模型认证、用户数据库/上传原件、会话、模型权重、venv或构建缓存。
- `.cache/voice-models`、`.tools/speech-python`、测试数据库/认证配置和运行时`voice-work`均在忽略目录，公开模型输入副本只保留测试文字、字段名、音频/模型SHA及原始模型输出，删除宿主路径。既有研究回归中的公开来源和自制图像不属于用户私人资料。扫描规则不能保证发现任意编码秘密，结合已知夹具来源和截图/文件审阅，不以规则通过替代来源核对。

本轮业务源码、Prisma迁移和可信Worker脚本与受检提交一致；新增内容只有`tests/voice/run.cjs`断言、`verify-remote.cjs`、报告/索引/日志/截图。旧验收结果保留，补测另存`evidence/phase05/remote/`。完整材料文件以本报告所在Git提交清单为准。

## 九项重点复核

以下均有SQLite和PostgreSQL的实际数据/HTTP/Chrome证据。自动化浏览器的播放与编辑操作不表示用户已经独立听审，也不把模型结果升级为人工金标准。

| # | 实际结论 | 可复现证据 |
|---|---|---|
| 1 | WAV经Whisper真实推理，ASR进程输入没有`text`或参考文稿提示；输出含“測試”“教驗”等，与原文不相同。模型原始输出、Job结果和音频SHA逐项一致。 | 两库[ASR真实IO](evidence/phase05/remote/voice/sqlite/model-transcribe-io.json)、[PG IO](evidence/phase05/remote/voice/postgresql/model-transcribe-io.json)，对应`real-asr.json`保存三次尝试。 |
| 2 | 实际`model.align`使用固定批准文稿及对应音频；词时间与原始模型words逐项相同，句时间由相交的有效模型词边界合并。没有按字符均分/插值代替推理。25条原始词、24个正时长词Cue、3个句Cue，零宽词不补造。 | 两库[align真实IO](evidence/phase05/remote/voice/sqlite/model-align-io.json)、[PG IO](evidence/phase05/remote/voice/postgresql/model-align-io.json)，`real-alignment.json`保留正式Cue与runId。 |
| 3 | “测试，测试。”两个位置分别按UTF-16范围推进，第二个“测”保留1260–1260ms的原始零宽结果；逗号/句号随模型词保存，不造标点独立时间。停顿可对照FFmpeg静音检测，边界可能延伸至静音；错字、中文分词和时间误差均有明确提示。 | [SQLite位置表](evidence/phase05/remote/voice/sqlite/review-details.json)、[PG位置表](evidence/phase05/remote/voice/postgresql/review-details.json)、[独立静音区间](evidence/phase05/silence-check.log)。 |
| 4 | 真实Chrome解码/播放、当前时间推进；实际鼠标拖动页面原生range定位目标6040ms，得到6084ms并显示对应字幕。FFprobe/HTML audio实际9.601451s，页面上限9602ms，差0.549ms来自向上取整。 | [SQLite拖动数据](evidence/phase05/remote/voice/sqlite/playback-seek.json)、[PG数据](evidence/phase05/remote/voice/postgresql/playback-seek.json)、[拖动截图](evidence/phase05/remote/voice/sqlite/05-drag-seek.png)、[FFprobe](evidence/phase05/remote/ffprobe.json)。 |
| 5 | 首条字幕改为“测试，测试。（人工修正字幕）”、开始250ms，保存后刷新正确；停止并重新启动同一隔离应用后，全部字幕/Cue/绑定和版本快照深比较一致，浏览器再次读取正确。 | [SQLite重启前后快照](evidence/phase05/remote/voice/sqlite/edited-restart.json)、[PG快照](evidence/phase05/remote/voice/postgresql/edited-restart.json)、[重启截图](evidence/phase05/remote/voice/sqlite/05-edit-after-restart.png)。 |
| 6 | 三模式真实状态完整：Windows系统TTS临时/正式声音均实际生成，preview不替换正式音轨；上传实际验证/播放；无口播180秒planned且无音频/假转录。云端神经TTS未配置明确失败，显式Mock失败且不造声音。 | 两库`results.json`的TTS/静默组，[系统TTS截图](evidence/phase05/remote/voice/sqlite/05-real-system-tts.png)、[静默截图](evidence/phase05/remote/voice/sqlite/05-silent-timeline.png)。未配置神经TTS不是已完成真实神经TTS。 |
| 7 | Cue固定已批准ScriptRevision、segmentId、UTF-16范围/段落SHA，anchorId保存/Fork稳定。字幕编辑不改文稿或研究绑定；音频替换使旧Cue stale，新批准文稿使旧配音依赖stale，配音新批准版使合成下游依赖失效。 | 两库`results.json`、`review-details.json`、`edited-restart.json`；合成下游仅依赖测试，不冒充DirectorShot。 |
| 8 | API和三张表拒绝覆盖批准快照，Fork/历史保持；两个客户端保存结果200/409，页面保留编辑缓冲；未配置、超时、真实重试、运行取消/进程退出/租约清空、TARGET_CHANGED迟到保护通过。 | 两库`real-asr.json`、`cancelled-job.json`、`stale-result-job.json`，以及[409截图](evidence/phase05/remote/voice/sqlite/05-conflict-buffer.png)、[批准只读](evidence/phase05/remote/voice/sqlite/05-approved-readonly.png)。 |
| 9 | 本轮SQLite12组、PG14组再次真实通过；PG从0001–0004升级0005，旧项目保留、重复deploy无重复、Schema零漂移；原用户目录散列不变。既有126组相关回归结果文件和56项单元已核对；本轮56项单元/类型/生产构建重新执行通过。 | [本轮汇总](evidence/phase05/remote/verification.json)、两库`results.json`、PG`migrations.log`和`schema-drift.log`、[原126组汇总](evidence/phase05/summary.json)。 |

## ASR、对齐与TTS技术披露

| 项目 | 实际实现 |
|---|---|
| ASR引擎/模型 | `openai-whisper==20250625`，多语言`base`，通过`stable-ts==2.19.1`的`stable_whisper`加载。固定`language='zh'`、CPU、FP32、2线程，`transcribe(... word_timestamps=True, regroup=False, suppress_silence=False)`。ASR没有传原文/initial_prompt。来源：[Whisper官方](https://github.com/openai/whisper)。 |
| 强制对齐引擎/模型 | 同一Whisper base，stable-ts的`model.align(audio,text,language='zh',original_split=True,regroup=False,suppress_silence=False)`。给定文本tokens与实际音频特征通过模型注意力及DTW路径估计词边界，不是独立训练的CTC对齐器，也不按字符等分时长。正时长词转Cue，句级合并其声学范围。已核对本机固定依赖的`stable_whisper/alignment.py`、`stable_whisper/timing.py`及`whisper/timing.py`；官方[align说明](https://github.com/jianfch/stable-ts#alignment)。 |
| 权重来源/身份 | 官方`openaipublic.azureedge.net/main/whisper/models/<SHA>/base.pt`，SHA256固定为`ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e`，加载前核对；设置脚本见`setup-voice-speech.py`。权重不入Git。 |
| 系统TTS机制 | 固定`voice-sapi.ps1`由Windows PowerShell 5.1加载`.NET System.Speech.Synthesis.SpeechSynthesizer`，选择已安装`Microsoft Huihui Desktop (zh-CN)`、rate0，调用`Speak`和`SetOutputToWaveFile`。只收JSON纯文本，不执行SSML/命令；实际输出PCM WAV再由FFprobe验证。系统安装另可检测到Zira英文声线，但本次验收合成用Huihui。机制见[Microsoft接口](https://learn.microsoft.com/en-us/dotnet/api/system.speech.synthesis.speechsynthesizer)。 |
| 神经TTS/Mock | 云端神经TTS未配置，没有真实神经合成验收；系统TTS没有被称为神经TTS或Codex音频能力。Mock不产生假音频/假转录。 |

中文识别可能繁简体转换、漏词、同音错误、噪声幻觉；本次“校验”成为“教驗”。中文词token有时只是字或含标点片段，不保证符合语言学分词。对齐不是文本真伪核验；文稿与录音不一致时可能失败或错误吸附，静音附近可能漂移。`suppress_silence=False`避免额外静音修正掩盖原始边界，同时意味着词尾可能覆盖停顿。零宽词、低概率、未匹配内容不能用补平均时间冒充模型成功。本产品允许人工修正，批准只表示用户确认；没有人工金标准的WER/CER或词边界误差评测，不宣称绝对精准。

## 本地依赖、资源、网络和费用

[本机环境记录](evidence/phase05/remote/environment.json)：Windows x64、Intel i5-12500H、16逻辑CPU、16GiB内存；实际推理仅用CPU/2线程，不要求CUDA/GPU。本轮9.60秒语音的SQLite ASR约9.4秒/align约8.1秒，PG约12.1秒/8.3秒（含启动/加载/验证），不是性能或最低配置保证。没有采集用户名称、主机名或硬件序列号。没有测量最低RAM/长音频峰值，建议预留数GB安装空间和足够运行内存；其他硬件须自行实测，不把官方GPU表格当CPU最低需求。

- 项目内Python3.8.16 venv；torch/torchaudio2.4.1、numpy1.24.4、numba0.58.1、llvmlite0.41.1；精确依赖见`scripts/voice-requirements.txt`。Node24.15.0/pnpm10.34.4、FFmpeg/FFprobe4.3.1与Chrome用于本次验收，PG17.6仅双库验收/可选部署需要；Windows系统TTS依赖本机已安装声线。
- 安装依赖/首次下载模型需要联网；base权重约139MiB，torch wheel约199MB，完整venv需更多空间。安装不修改全局Conda环境；运行只加载已验证本地权重，没有下载或调用远程ASR/TTS API。设置offline环境变量不等于OS禁网沙箱，仍只允许可信固定程序。[安装说明](VOICE_SETUP.md)。
- 语音识别、模型对齐和系统TTS本地运行**不产生本项目的外部API调用费用**，不需要API Key；仍消耗本机CPU/磁盘/电力和安装网络流量。已有Codex研究/文稿能力使用账号额度，不能据此承诺全项目无限/永久免费；本轮未重新调用Codex，保留其既有真实回归证据。
- Whisper官方明确代码与权重为[MIT](https://github.com/openai/whisper#license)，stable-ts为[MIT](https://github.com/jianfch/stable-ts/blob/main/LICENSE)；torch/numpy为BSD系列，torchaudio2.4.1官方为[BSD-2-Clause](https://github.com/pytorch/audio/blob/v2.4.1/LICENSE)，其旧METADATA缺License字段不能据此判作无许可。Windows语音引擎/声音依其系统授权，没有复制再分发引擎或改变仓库许可证；自制合成测试样例不等于第三方素材商业授权。stable-ts官方仓库2026-05-30归档，维护风险保留。

## 本轮实际命令与结果

以下命令从仓库根目录运行；测试只创建隔离数据目录和专用PG库，不迁移真实用户数据。

```powershell
git fetch origin main
git rev-list --left-right --count origin/main...HEAD
git merge-base --is-ancestor origin/main HEAD
node tests/real-ai/audit-remote.cjs 4869793eed1cbb2e448cb37bf44e47ea42715baf docs/evidence/phase05/remote/code-security-audit.json
pnpm test
pnpm typecheck
pnpm build
# 启动既有独立PG测试集群：pnpm db:local start
$env:STUDIO_TEST_PHASE_EVIDENCE_ROOT='docs/evidence/phase05/remote/voice'
node tests/voice/run.cjs
node tests/voice/run.cjs --postgres
node tests/voice/verify-remote.cjs
# 审核材料另立提交前执行精确暂存区扫描；本地普通提交后再次fetch核对。
# 最终只使用：git push origin main:main（无force/amend）。
```

实际退出均为0，56项单元、SQLite12/PG14组本轮通过，生产构建和类型检查通过。日志见[unit](evidence/phase05/remote/remote-unit.log)、[typecheck](evidence/phase05/remote/remote-typecheck.log)、[build](evidence/phase05/remote/remote-build.log)、[SQLite](evidence/phase05/remote/remote-voice-sqlite.log)、[PG](evidence/phase05/remote/remote-voice-postgresql.log)。保留原126组回归日志与截图，不把历史运行说成本轮重新调用的搜索/渲染测试。PG测试结束停止本轮启动的专用集群，保留全部测试数据。

## Windows异常与停止点

旧Phase04.5两次原生`0xC0000409`仍为**UNCONFIRMED**，原始[诊断索引](evidence/phase045/remote/windows-native-incidents.json)与[Phase05失败/重跑记录](evidence/phase05/diagnostics/README.md)保留。本次语音补测未观察到该原生退出，但不宣称已修复或确定根因；预期超时/取消的退出不混为旧异常。

推送前后仅核对提交/文件可读性，不部署、不修改用户项目或批准历史。材料齐全后停止等待Phase05正式审核；**不得进入Phase06**。
