# Phase05 配音与语音时间轴交付

日期：2026-10-24。已批准基线 `3e5e7268f175546fe226e893c71eeb6bb33e69b8`，从干净本地main开发。包含用户追加的**真实中文ASR、真实强制对齐及试听校正**；不以未配置Adapter或Mock代替。Phase06未启动，不推送远程。最终独立本地提交Hash由交付回复提供，本报告与源码/证据在同一提交中。

## 已完成与实际边界

| 要求 | 实现/证据 |
|---|---|
| 三种模式 | TTS、真实音频导入、无口播均持久化。Windows Huihui实际合成WAV，临时试听不替换正式音轨；云端神经TTS未配置且明确失败，系统声音不冒充Codex或神经AI。Mock不生成假声音。 |
| 真实中文ASR | 本地CPU Whisper base/stable-ts实际识别自制中文口播，未传参考文稿，输出原始文字/词时间及未绑定字幕草稿。绑定音频SHA、模型SHA、runId、时长/进程/退出/失败审计。两库各完成“未配置→超时→重试成功”，三次记录保留。 |
| 真实强制对齐 | 对固定已批准文稿和实际WAV运行`model.align`；25条原始模型词、24个有效词Cue及3个句Cue，时间非均分，字符范围/段落SHA区分重复“测试”。1个零宽词保留原始，不创造独立词时间；句界来自有效模型词的范围。 |
| 第05页试听/校正 | Chrome实际解码、播放、进度推进，当前字幕随模型时间出现；人工改首条字幕和起点到250ms，保存/刷新保留，Cue/anchor/segment及文稿原件不变。另有定位、增删字幕/Cue、整体偏移、层级筛选和手工范围绑定。没有假波形。 |
| 稳定结构与保护 | 新增VoiceTimeline/VoiceCue/SubtitleTrack；一个段落可多Cue，多层嵌套。同层和字幕轨重叠、负数、无效时间、越界、错误文本范围/段落拒绝；手改模型时间只能标manual，不能伪造forced来源。 |
| 审核与依赖 | 复用草稿/提交/批准/拒绝/Fork/历史/差异；批准API和三张表数据库保护；409保留编辑缓冲，幂等重试。字幕新批准版使合成下游依赖失效；换音频使旧Cue失效；新批准Script使配音整体依赖失效。ASR未绑定草稿不可提交，确认不把估算升级为精确对齐。 |
| Worker | 复用Workflow/Job/Outbox，2秒心跳、30秒租约、任务取消/重试。真实模型取消杀对应子进程树、租约清空且PID退出；目标版本变化的迟到结果不写库。批准历史保持原始数据。 |
| 数据安全 | 增量0005，不改既有迁移，不迁移真实用户数据。所有验收独立目录/数据库，原数据目录散列前后完全一致。旧通用文本配音历史可读，草稿只能显式转换，不当作有效音轨。 |

ASR真实输出含繁简体与同音错误，例如“校验”识别为“教驗”；需要用户校正。强制对齐是实际声学模型结果，**没有人工金标准误差评测，不宣称每个词毫秒精确**。另用FFmpeg silencedetect独立提取了[实际静音区间](evidence/phase05/silence-check.log)，可和词/句时间及播放对照：模型边界可能延伸至停顿，并非逐词金标准，需听校而非自动批准。浏览器是实际自动化操作，不代表用户已人工体验/听审。真实模型、人工/估算、静默计划和未配置状态分别显示。

## 实际测试

[自动核对汇总](evidence/phase05/summary.json)：**56项单元全通过、126组主流程/相关回归通过、最终浏览器pageErrors均为空**。126组包含旧测试程序内部的分组，不等于126个独立原子断言；内层HTTP/workflow另有实际日志。

| 命令 | 结果 | 输出 |
|---|---|---|
| `pnpm test` | 56/56，0失败/跳过 | [unit.log](evidence/phase05/logs/unit.log) |
| `pnpm typecheck` / `pnpm render:typecheck` | 各退出0 | [类型](evidence/phase05/logs/typecheck.log)、[渲染类型](evidence/phase05/logs/render-typecheck.log) |
| `pnpm build` | 生产构建退出0 | [build.log](evidence/phase05/logs/build.log) |
| `pnpm db:generate` / Prisma validate | 实际成功，validate不连接用户库 | [generate](evidence/phase05/logs/prisma-generate.log)、[validate](evidence/phase05/logs/prisma-validate.log) |
| `node tests/voice/run.cjs` | SQLite真实模型/音频/Chrome/保护/重启12组 | [结果](evidence/phase05/sqlite/results.json)、[命令日志](evidence/phase05/logs/voice-sqlite.log) |
| `node tests/voice/run.cjs --postgres` | PostgreSQL14组；0001–0004基线项目保留、升级0005、重复deploy、零漂移 | [结果](evidence/phase05/postgresql/results.json)、[迁移](evidence/phase05/postgresql/migrations.log)、[diff](evidence/phase05/postgresql/schema-drift.log) |
| `node tests/research/run.cjs` / `--postgres` | 15/16组；旧HTTP/工作流及研究/真实媒体提取回归 | [SQLite](evidence/phase05/regression-research/sqlite/results.json)、[PG](evidence/phase05/regression-research/postgresql/results.json) |
| `node tests/script/run.cjs` / `--postgres` | 9/11组；文稿/引用/修订/409/数据库保护 | [SQLite](evidence/phase05/regression-script/sqlite/results.json)、[PG](evidence/phase05/regression-script/postgresql/results.json) |
| `node tests/render/run.cjs` / `--postgres --quick` | 两库真实Remotion MP4/FFprobe、重复关键帧、播放/重启；SQLite额外异常/重试/取消 | [SQLite](evidence/phase05/regression-render/sqlite/results.json)、[PG](evidence/phase05/regression-render/postgresql/results.json) |
| `node tests/real-ai/run.cjs --claims-supplement` / `--postgres` | 13/14组，真实Codex搜索/图片/视频/候选Claim/整体及局部写稿/取消 | [SQLite](evidence/phase05/regression-real-ai/sqlite/results.json)、[PG](evidence/phase05/regression-real-ai/postgresql/results.json) |
| `node tests/voice/collect-evidence.cjs` | 核对全部10份PASS、56单元、音频SHA及ASR无参考文稿 | [汇总](evidence/phase05/summary.json) |

回归设置 `STUDIO_UI_BROWSER_PATH` 指向本机Chrome，`STUDIO_TEST_PHASE_EVIDENCE_ROOT=docs/evidence/phase05/regression-research` 或`regression-script`；Codex测试设置 `STUDIO_TEST_REAL_AI_EVIDENCE_ROOT=docs/evidence/phase05/regression-real-ai`，不覆盖已验收旧证据。测试工具只调整证据输出位置/按实际迁移目录计数，不改旧模块业务行为。

Remotion另设置 `STUDIO_CHROMIUM_PATH` 指向本机Chrome，证据目录用`regression-render`。重复MP4保留在本机该目录并按.gitignore排除，公开提交其规格、关键帧和结果，避免重复提交已验收Phase02样片。

音频独立命令：`ffprobe -v error -show_format -show_streams -of json fixtures/voice/chinese-system-speech.wav`。实际9.601451s、22050Hz、mono、pcm_s16le，应用9602ms：[输出](evidence/phase05/ffprobe.json)。模型和依赖安装实际使用 `python -m venv .tools/speech-python`、该venv中`pip --isolated install --index-url https://pypi.org/simple -r scripts/voice-requirements.txt`及官方base权重下载/SHA核对；运行时不联网下载。精确依赖见[版本记录](evidence/phase05/python-versions.json)，安装/启用步骤见[VOICE_SETUP](VOICE_SETUP.md)。

## 截图、样例和源码

[完整证据索引](evidence/phase05/README.md)包含两库实际页面：播放字幕、模型对齐、人工修改刷新、409、批准只读、系统TTS、静默模式、移动端及旧阶段回归截图。[自制中文WAV与操作流程](../fixtures/voice/README.md)，不含真人私有录音。

主要变更：

- `apps/web/src/domain/voice.ts`、`server/voice/*`：运行时协议、音频校验/存储/受保护下载、模型时间映射、Provider边界和workspace。
- `apps/web/src/server/workflow/{engine,service,tables}.ts`及domain/workflow：语音命令、快照/审批/任务/审计，保留原工作流。
- `apps/web/src/app/api/v1/projects/[projectId]/voice-*`：7组真实路由；`components/voice-panel.tsx`、`voice.module.css`及stage/workflow集成。
- Prisma schema / `0005_voice`：3张表、索引、FK和草稿写入保护；SQLite同等增量表与触发器。
- `scripts/voice-*`、`setup-voice-speech.*`：固定可信System.Speech/Whisper运行器及独立安装，未修改Codex安全运行器。
- `tests/unit/voice*.test.ts`、`tests/voice/*`、`fixtures/voice/*`；测试脚本证据目录/迁移数量适配。
- `.env.example`、README、架构/数据/API/UI/参考研究/开发说明/计划/验收及此报告。完整路径见[修改文件清单](evidence/phase05/changed-files.txt)。

## 迁移、权限与回滚

PG17.6专用loopback集群55432，新建每轮测试库；应用角色非superuser且无createdb。SQLite同一Schema初始化/重开，PG旧项目JSON升级后原样保留；实际用户`.data`/旧验收目录未更改，散列为`7a677496c48a00a14538bc505faf99f1b0fbed6a47b678600a9d62facf470b54`。不drop/reset/删除原件，不自动把SQLite搬到PG。

模型和TTS使用固定可信文件+JSON、白名单子进程环境、私有work目录，无DB/API/Codex认证继承；不存在用户Shell/SSML/代码/Git执行入口。仍是可信宿主进程，**不是OS文件或网络沙箱**。既有Codex只读数据门禁未扩大。原件、模型请求/输出、中间WAV/日志留在忽略的私有dataDir；Git只包含自制可公开样例和脱敏验收材料。待提交精确字节扫描和人工文件核对见[安全审计](evidence/phase05/security-audit.json)，模式扫描有局限，不宣称绝对检测所有编码秘密。

回滚先停Worker、备份数据库和私有目录，再检出基线；保留新增表/数据，旧版无法正确消费新VoiceTimeline，恢复编辑须用匹配代码。测试结束停止专用服务并保留测试数据，不干扰用户项目。

## 遗留风险与阶段边界

1. 云端神经TTS未配置；实际已提供Windows系统TTS，不承诺等同自然人/神经音质。ASR、强制对齐已真实实现，均非Mock。
2. Whisper base中文识别错误、模型时间零宽及精度需听校；不自动批准。stable-ts仓库已归档，跨平台/新Python依赖组合、模型升级、长音频分批和人工标注精度留后续评估。600秒推理上限可配，不限制项目只能做10秒示例。
3. Windows旧两次原生异常仍为**UNCONFIRMED**。本次全局Python依赖失败、测试脚本缺陷与PG浏览器首轮加载超时均保留[诊断记录](evidence/phase05/diagnostics/README.md)，独立重跑成功不能消除旧风险。
4. 没有实现Research视频全音轨转录扩建、Director、素材匹配/裁剪或Phase06功能；合成下游文本只验证依赖，不冒充镜头。没有重构既有Phase00–04.5或改变D-17/D-18。

本地验收要求已满足；提交后停止等待用户正式审核。**未获批准不推送，也不进入Phase06。**
