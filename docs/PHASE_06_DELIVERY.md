# Phase06 — AI 导演表与分镜审核交付

本文件保留原本地交付记录。用户随后授权本阶段最终远程验收和安全核查后的快进推送；新增复核见[正式远程验收报告](PHASE_06_REMOTE_ACCEPTANCE.md)及[截图索引](evidence/phase06/remote/README.md)。受检代码ad26a25保持不变，不amend，不进入Phase07。

日期：2026-10-24。批准基线：`0f2fa62bf4fd9ef6cde2ff21540fed71574b8258`。开工fetch确认本地与origin/main一致、工作区干净。仅实施Phase06；独立本地提交的完整Hash见最终回复及Git历史，不推送远程、不进入Phase07。

## 实现与阶段边界

- 真实Codex CLI结构化导演：固定批准ScriptRevision及已确认、同文稿的VoiceRevision，冻结brief、段落、Cue/字幕、事实、选中来源/索引及应用分配shotId。每镜保存叙事任务、观众理解、段落/anchor引用、帧区间、画面层级/构图/转场/动画意图、VisualSearchIntent、资料引用和风险。不是自由文本或静态模板。
- 复用Workflow/Job/Outbox和既有数据分析运行时；2秒心跳、30秒租约、3次尝试、取消、失败重试、目标版本及输入批准保护。主API不运行模型代码；旧Codex/Research/Script/Voice/Render安全边界保持。搜索在导演任务中关闭，模型输出须结构、引用及时间校验后才事务写入；未配置明确失败，Mock明确标识。
- 统一30FPS半开区间`[startFrame,endFrame)`；`totalFrames=ceil(Voice.durationMs*30/1000)`，只在末尾向上取整，不足一帧误差；镜头连续、正时长、不越界，转场占本镜内部。编辑时重算后续镜头，显示受影响镜头和剩余帧；草稿可明确保留尾段，提交必须完整覆盖。必须绑定时段内所有正在讲述的段落；真实停顿可延续对象。一个段落多镜、多个段落一镜均已实测。无口播不伪造语音anchor。
- 第06页真实镜头卡、时间轴、逐镜编辑/增删排序、Cue/文稿/Claim/Source与限制、纯代码/待匹配/真实候选路线、保存刷新、提交批准驳回、Fork/历史和修改前后差异。SVG仅随实际图层/深度变化的示意，不是生成好的最终动画。409保留编辑缓冲；后台Job更新、取消/重试不覆盖未保存编辑。
- pending有非空检索意图，API输出`assetRequirements(directorRevisionId,shotId,status,intent)`给Phase07；批准不表示素材已找到。bound仅使用固定研究已选真实图片/视频元数据及合法候选区间。本阶段不批量搜索/裁剪，不执行任意TSX。`blocked`商业状态的自制素材实测可内部绑定，D-17/D-18不增加商业审批，也不绕过访问保护。
- 新增`0006_director`及两类快照表：director_documents、director_shot_versions。SQLite幂等建表登记版本6；PG从0001–0005升级、重复部署、非超级用户及Prisma零漂移通过。旧迁移未改，旧JSON/API保持兼容，不迁移真实用户库。
- 批准、待审核、驳回快照只读；API和数据库均保护。Fork保留有效shotId，换输入后标记needsRebind；引用/时长不兼容时新草稿明确要求重新规划，旧版不动。新批准文稿或配音使导演及镜头整体保守stale；不声称已实现逐镜自动缓存复用。

## 真实样例与证据

入口：[证据索引](evidence/phase06/README.md)、[自动核对汇总](evidence/phase06/summary.json)、[可复现夹具](../fixtures/director/README.md)。

[自制中文WAV](../fixtures/director/director-120s.wav)：FFprobe实测120.000000秒，22050Hz单声道PCM。四段自撰文稿用本机Huihui系统TTS生成，再按已知30秒槽拼接；每段实际文件时长独立测量。Cue为`manual`，包含系统声音首尾静音，**不是声学强制对齐或词级金标准**。真实空白停顿明确保留。原始文本、区间、SHA在sample.json，音频参数在ffprobe.json。

SQLite和PostgreSQL各真实调用Codex0.163.0 / gpt-6.1-sol生成6镜、3600连续帧。每库有原始Job输入/结果、模型runId/usage/时长/失败原因、CLI事件、时间映射、数据库JSON快照及6张页面截图。CLI agent_message JSON已逐字结构比对持久结果一致。数据库快照仅导出自制验收项目相关行，不含数据库文件、凭据或用户资料。Mock仅用于显式静默示例/边界，不代替两套真实导演验收。

截图入口：[导演工作台](evidence/phase06/sqlite/06-director-workbench.png)、[批准只读](evidence/phase06/sqlite/06-approved-readonly.png)、[409缓冲](evidence/phase06/ui-protections/sqlite/06-conflict-buffer.png)、[前后差异](evidence/phase06/ui-protections/sqlite/06-before-after-diff.png)、[移动端](evidence/phase06/sqlite/06-mobile.png)。自动化操作不等于用户已经人工体验/听审。

## 实际命令与结果

Node24.15.0、pnpm10.34.4、Next15.5.19、Prisma6.19.3、PostgreSQL17.6、FFmpeg/FFprobe4.3.1、Windows Chrome。命令均从仓库根目录；本地包管理器可先将`.tools/bin`加入PATH。

| 命令 | 实际结果 | 日志/目录 |
|---|---|---|
| `pnpm db:generate` | PASS | logs/prisma-generate.log |
| `pnpm test` | 66/66，0失败/跳过 | logs/unit.log |
| `pnpm typecheck` | PASS | logs/typecheck.log |
| `pnpm build` | PASS；旧voice CSS有autoprefixer start兼容性警告，无构建错误 | logs/build.log |
| `node scripts/director-fixtures.cjs` | 自制真实120秒WAV及FFprobe | fixtures/director；logs/fixture.log |
| `node tests/director/run.cjs` / `--postgres` | SQLite16组、PG18组 | sqlite/postgresql |
| `node tests/director/ui-protections.cjs` | 4组浏览器缓冲/409/增删排序/前后差异 | ui-protections/sqlite |
| `node tests/voice/run.cjs` / `--postgres` | 12/14组，真实ASR/对齐/系统TTS回归 | regression-voice |
| `node tests/script/run.cjs` / `--postgres` | 9/11组，含旧HTTP/工作流 | regression-script |
| `node tests/research/run.cjs` / `--postgres` | 15/16组 | regression-research |
| `node tests/real-ai/run.cjs` | SQLite9组，真实搜索/图片/视频/整体与局部写稿/取消 | regression-real-ai |
| `node tests/real-ai/run.cjs --claims-boundaries`，另加`--postgres` | 4/5组，含真实重试、候选/引用/不足/保护 | regression-claim-boundaries |
| `node tests/render/run.cjs` / `--postgres` | 11/13组，真实MP4、FFprobe、帧确定性、失败/重试/取消/重启 | regression-render |
| `node scripts/director-evidence.cjs` | 4/4目标runId事件匹配：两套真实生成+两次实际取消 | cli-evidence.json |
| `node tests/director/verify-evidence.cjs` | PASS，原始模型输出/固定输入/时间/两库快照核对 | summary.json |

合计**157组**主流程与相关回归，分组采用既有测试程序统计；不重复计算内嵌HTTP/workflow断言。实际浏览器pageErrors为空。真实AI旧能力完整重跑为SQLite；两库均重跑导演、研究、文稿、配音、渲染及Claim边界，不把旧日志当作本轮重新执行。独立测试目录/数据库保留，原用户数据目录散列前后相同。

运行导演：API与`pnpm worker`使用相同数据配置，均设`STUDIO_CODEX_ENABLED=1`，复用本机已授权固定CLI登录；不复制Token。PG只在独立测试实例执行迁移。回归证据目录配置及完整复现命令见证据README。

## 失败、审查与风险

全部早期失败保留在`attempts/`和TDD日志，不与最终PASS混合：负时长Zod返回400而测试预期422；测试重排辅助函数误删绑定媒体的Source；浏览器取消定位遇到旧自动任务同名按钮；渲染回归相对证据路径/缺少Chrome配置。测试适配已修正。共享Worker写稿日志一度改文案导致旧取消断言漏判，已恢复原文案并真实重跑通过。

独立代码审查发现“跨段镜头仅要求任一Cue相交”及取消/重试覆盖编辑缓冲：已通过失败测试复现并修复；补充Job元数据独立刷新、按图层预览和前后差异。本机最终66项及浏览器专项验证通过。独立静态复查未再发现阻塞问题；审查者最后一次独立重复实验因额度停止，未将该未完成实验标为通过。

一次PG研究回归原生批次提前结束，只有迁移PASS，无JS栈/可用退出诊断；独立重跑16组通过。另一次PG渲染重试中Worker提前结束，任务仍running，无成功产物，退出码未被旧测试捕获；保留原日志/状态，独立重跑13组通过。只对该隔离测试库中过期租约执行已有recover，结果WORKER_INTERRUPTED、空租约、无resultRevision/renderResult。诊断见attempts/render-interruption-diagnosis.json，**根因UNCONFIRMED**；不能推断与历史Windows异常相同或已修复。历史两次`0xC0000409`继续保留，未做系统重构。未来复现应捕获PID/父PID/原生退出码和故障模块，私下保存诊断，不提交内存/凭据。

其他限制：Whisper中文错字、停顿/零宽边界及强制对齐精度限制仍在；云端神经TTS未配置，系统TTS不是神经模型。Codex输出仍需用户审阅，剩余额度未知、消耗现有账号额度，不承诺免费。Director输入存储上限750KB，而既有CLI prompt上限250000 bytes可能更早明确拒绝；没有静默截断。当前仅本机可信数据任务安全边界，未宣称自由代码沙箱完成。

## 修改清单、安全与回滚

主要新增domain/director、server/director(engine/provider/service/http/tables)、director/director-runs路由、DirectorPanel、0006迁移/Prisma关系；最小接入Workflow状态/命令/内容Hash/Fork/提交/finish及Worker分支、统一审核面板和第06页。新增director单元/HTTP/浏览器/证据核对与夹具脚本；旧voice测试仅更新基线迁移筛选与动态迁移数，未改配音业务。同步架构、数据/API协议、参考审查、阶段计划、README、实施日志和验收表。完整路径以同一独立Git提交为准。

安全检查见security-audit.json与logs/security-worktree.log、最终暂存扫描。仅新增自制合成音频和脱敏测试证据；不提交认证、数据库、会话、上传原件、模型权重、缓存、venv、构建产物。扫描有规则局限，结合夹具来源/截图/文件清单审阅，不宣称可识别任意编码秘密。

迁移为加法，回滚代码可用独立提交的revert；数据库不自动drop新表、不执行逆向破坏性迁移。已有用户库未迁移，测试库原样保留。若未来真实库采用0006，先按现有备份流程操作；旧版本不消费导演表，但不要删除已产生的导演历史。

本阶段目标与plans/06-director.md交付标准已满足，等待正式审核。Phase07只接收固定导演修订、shotId、VisualSearchIntent及候选源区间；尚无大规模素材搜索、自动匹配或正式裁剪。**本地提交后停止，未经确认不推送、不进入Phase07。**
