# Phase 04.5 最终远程验收复核

日期：2026-10-23。仅整理本阶段材料、补充验证；Phase05暂停，等待正式审核。代码提交：[`a6aee3746e704645e84a8870aaaeff8c4cd3278b`](https://github.com/shenzhuW/Ai_Audio/commit/a6aee3746e704645e84a8870aaaeff8c4cd3278b)。材料提交是包含本报告的独立后续提交，完整Hash由交付消息及Git历史提供，不改写先前提交。

## 基线、公开范围与测试结论

- 重新fetch后，实施前本地与远程main均为 `881e1022ea27638bf7a3c7364c55871802c56fe5`，无未知分叉。本轮用户已明确授权安全核查后的正常快进推送；不force、不amend、不改写历史。
- 代码提交56个文件，最大43,796字节；[逐文件提交审计](evidence/phase045/remote/code-commit-audit.json)包含完整文件清单、Git Blob、SHA256，未发现敏感路径、Token/私钥、认证JSON/JWT、签名会话、数据库二进制或过大文件。材料另做暂存区和最终提交扫描，不只扫描工作副本。
- Git不含本机auth.json、原始认证文件、会话密钥、SQLite/PG数据、上传存储或CLI原始events.jsonl。公开图片/视频帧均来自自制验收素材；公开模型文字仅为非敏感测试案例。来源网页完整HTML/全文不提交，投影只保留100字符预览/长度/SHA；CLI事件中的模型正文、推理及一般工具参数被移除。路径/模式扫描有局限，同时人工核对了素材来源和提交范围。
- **本轮重新执行**36项单元（0失败/跳过）、Web/Render类型检查、生产构建全部通过；[新日志](evidence/phase045/remote/)。原本SQLite9组、PostgreSQL10组真实AI结果及两阶段回归原记录保留，本轮没有将证据交叉校验说成整轮重新调用AI。
- 新增实际检查：两库各4组重启/批准响应重放/浏览器证据；新独立SQLite库3组原生CLI异常/同任务重试/重启；真实CLI恶意文本哨兵检查。两库原验收项目未被修改，新故障注入只使用新测试目录。PostgreSQL临时启动后已正常停止，数据未删除。

## 12项逐条复核

| # | 结论与实际证据 | 适用边界 |
|---|---|---|
| 1 | **通过**。两库实际live任务有web_search事件、真实标题/URL/片段及runId；Source.webCapture另存模型摘要、实际获取URL/时间/原始响应SHA，文本索引SHA与独立提取Blob匹配。见[两库结果与快照索引](evidence/phase045/README.md)、[19次实际事件投影](evidence/phase045/remote/cli-event-projection.json)。 | 只允许搜索轨迹内的精确URL进入真实Adapter；CLI早期PoC的模型自行规范化URL不作为已获取来源。模型摘要和搜索片段均不作为matched原文。抓取器不执行网页脚本。 |
| 2 | **通过**。实际传入的PNG附件SHA与图片Source.blob.sha256相同，索引analysis.sourceSha256/runId可对照实际事件的附件散列。自制三柱图被模型描述；[交叉核对](evidence/phase045/remote/verification.json)。 | 描述可出错，不等于事实核实或完整OCR。图片文本不写extractedText。 |
| 3 | **通过**。自制10秒视频0/3333/6666ms三帧实际送模；原视频SHA、frameTimeMs、帧附件SHA和独立FFmpeg重抽帧均一致。见每库frame-*.jpg、研究快照与实际附件事件。 | 单帧视觉，不是连续运动/音轨理解；无正式裁剪。 |
| 4 | **通过现有安全约束**。真实搜索/视觉不创建Claim，更不会自动核实；人工加入的测试Claim在两库保持unverified，批准研究也未将它变为verified。 | **尚未实现AI自动抽取Claim**，不能将此项描述成已经完成抽取功能；本项核查“不自动核实”的现有行为。 |
| 5 | **通过**。整体写作job的real结果是ScriptSegment，输入固定已批准ResearchRevision，所有Claim/Source ID逐项属于该修订。[核对结果](evidence/phase045/remote/verification.json)、各库script-snapshot。 | 两库均使用自制简短事实边界主题，非全题材质量保证；审批与独立事实核验仍由原流程负责。 |
| 6 | **通过**。局部job的全部输入段落与随后整体job的输入比较：只替换目标ID，其他段落所有字段完全一致；目标段factBindings完全相同。模型结果不含order，仓储按原位置写入order。[自动断言](../tests/real-ai/remote-verify.cjs)。 | 原局部结果保存于job.scriptResult；独立截图展示其实际任务卡，当前编辑器已是后续整体结果，不伪装成先前状态。 |
| 7 | **通过**。两库读取实际批准修订，用其已保存的真实模型响应重放finishResearch/finishScript，均返回TARGET_CHANGED，整个状态前后SHA一致；既有HTTP回归另验证批准只读/Fork和版本保护。见[SQLite](evidence/phase045/remote/sqlite-restart-fences.json)、[PostgreSQL](evidence/phase045/remote/postgresql-restart-fences.json)。 | 这部分是**真实响应的内存重放边界测试**，不是额外发起模型后抢时机批准的网络竞态测试；数据库无写入。真实取消迟到不回写另有双库实测。 |
| 8 | **通过本机固定版本门禁**。实际诱导文本要求读取外部自制哨兵、改写自制source.ts、执行命令：秘密未传给模型也未泄露，源码哨兵SHA不变、命令标记不存在。[实测](evidence/phase045/remote/injection-canary.json)。固定catalog移除Shell/补丁，所有MCP服务禁用；独立V8诊断拒绝node:fs且process/require/fetch/Deno不可用。 | 不是对任意未来版本的数学证明或通用OS沙箱。早期boundary.json只是模型自述，已明确标INCONCLUSIVE；三个原生MCP资源辅助入口仍可见，但启用服务器为0。 |
| 9 | **通过当前公开面核查**。实际CommandLine已捕获并脱敏，prompt只走stdin；API只返AiRun等数据，不返登录文件。应用从未读取/复制认证文件；调用凭据仍由CLI自身读取。精确Git对象扫描无凭据/会话。 | 实际子环境仅继承PATH/Path、SystemRoot/WINDIR、TEMP/TMP、USERPROFILE/APPDATA/LOCALAPPDATA；实现还允许现有HOME/CODEX_HOME和代理变量，若存在也仅按白名单传递；不传DATABASE_URL、Provider/Git Token、SSH或STUDIO_DATA_DIR。不是无认证进程。 |
| 10 | **通过分层实测**。真实CLI受控原生终止后job失败CODEX_PROCESS_FAILED、租约null、无scriptResult、原文未变；相同job attempt2真实重试成功并重启保持。[故障与重试](evidence/phase045/remote/failure-retry.json)。两库运行中取消保留CODEX_CANCELLED审计且不回写；真实500ms模型截止触发CODEX_TIMEOUT。 | 超时为CLI层实测，没有另等待完整120秒HTTP写稿超时；取消/进程失败的持久化由实际Worker验证。未人为耗尽用户额度来制造限额错误，剩余额度unknown。 |
| 11 | **通过**。真实结果mode=real/provider=codex-cli，附模型/runId/使用量；Mock结果保持mock、未配置返回PROVIDER_NOT_CONFIGURED。两库原阶段回归与真实截图可对照。 | STUDIO_CODEX_ENABLED默认0；启用后也需实际版本/ChatGPT登录预检通过。不得把技术元数据提取标成视觉理解。 |
| 12 | **通过**。两库分别读取完整Research与Script工作区，停止应用、重新启动、再读并deepEqual：Source、Claim、Evidence、索引、文稿引用与AI审计一致；前后摘要相同。见两库restart-fences.json第一组。另对PG服务正常stop/start前后完整数据摘要做了独立比较，[结果](evidence/phase045/remote/postgresql-server-restart.json)相同。 | 包含应用重启与PG服务正常停启，不是断电/数据库崩溃恢复。迁移初始化/重复执行与PG零漂移另见已有真实测试记录；未迁移用户真实库。 |

## Windows两次原生异常

[专项JSON](evidence/phase045/remote/windows-native-incidents.json)保留原命令退出观测、原stdout和独立重跑索引。两次均为 `-1073740791 / 0xC0000409`，**不是Codex模型任务自身被证实崩溃**，不能由该退出码推断根因。

1. **Phase03回归批次**：2026-10-23本地18:03左右，仅打印HTTP通过，下一工作流组尚未报告完成；准确的原生指令/组件未知。隔离目录mvksxxvt仍有3个HTTP自制项目、上传/会话及SQLite WAL；本轮只读检查0个Job、0个AI调用、0个运行租约。未完成批次不算通过，数据未删除。之后独立SQLite15组/PG16组均通过，完整重跑控制台与结果保留。
2. **最终复拍批次**：SQLite已完成，转入PostgreSQL复拍/启动阶段时原生退出；无JS异常栈/可用stderr。复拍只有GET和截图，不启动AI Worker，不产生新AI租约或部分AI写入。SQLite产物保留；PostgreSQL用独立`--postgres`完整复拍通过。退出后曾定向检查3013端口项目Next进程，没有发现残留。

2026-10-23本地17:55–18:50范围的Application 1000/1001查询未找到匹配node.exe的事件；未捕获dump，原崩溃PID亦未保存。只能确认后续定向检查无项目Node残留，**无法追溯证明崩溃瞬间没有任何孤儿进程**。测试目录/CLI临时文件按交付约束保留在忽略目录，不当成已经自动清理。

缓解措施：每个后端独立运行、端口占用/就绪门禁、原Worker心跳/租约/attempt fencing、实际CLI终止重试测试。根因标**UNCONFIRMED**；复现时记录PID/父PID/时间/退出码，定向采集stdout/stderr及对应故障模块事件，检查该隔离库的租约和部分结果。若需要进程dump须另行授权并私下存储，禁止提交可能包含凭据的内存。未声称重跑已修复根因。

## 本轮补充命令与范围

```powershell
git fetch origin main
git rev-list --left-right --count HEAD...origin/main
node tests/real-ai/remote-cli.cjs --canary
node tests/real-ai/remote-state.cjs --failure-retry
pnpm db:local start
node tests/real-ai/remote-state.cjs --sqlite
node tests/real-ai/remote-state.cjs --postgres
pnpm db:local stop
node tests/real-ai/remote-cli.cjs
node tests/real-ai/windows-diagnostics.cjs
pnpm test
pnpm typecheck
pnpm render:typecheck
pnpm build
node tests/real-ai/verify.cjs
node tests/real-ai/remote-verify.cjs
node tests/real-ai/audit-remote.cjs --staged .cache/phase045-code-staged-audit.json
node tests/real-ai/audit-remote.cjs a6aee3746e704645e84a8870aaaeff8c4cd3278b docs/evidence/phase045/remote/code-commit-audit.json
git diff --check
```

旧SQLite9组含一次测试Fork状态码201→既有200的断言修正，最后两步在同一隔离运行续验，未伪装成整轮重跑。新增故障注入测试第一次错误传入不存在的scriptText字段被严格API拒绝400，未启动模型，记录见failure-retry-initial.json；仅修测试后执行上述真实终止/重试。补充证据校验器最初未考虑模型结果的order由持久层补齐，并将PNG Buffer按JSON而非字节计算SHA；仅修正测试，重新运行双库只读验收/截图，最终字节SHA独立校验通过。没有业务功能返工。

PG服务重启采证的第一次PowerShell Tee-Object批次在启动后挂起，未执行到Node测试；只终止了核对身份的该采证Shell，PG服务保持。随后独立stop/start和Node复核全部通过，最终服务正常停止；[独立输出](evidence/phase045/remote/postgresql-server-restart-independent.log)与[原始短输出](evidence/phase045/remote/postgresql-server-restart.log)均保留。这不计入两次原生应用崩溃，也不把未完成批次报通过。

源码/计划/规范在代码提交；本报告、原始测试记录、真实页面截图、脱敏投影、提交清单与安全扫描在后续材料提交。新真实调用仅限自制安全哨兵和受控异常/重试，不涉及真实用户资料。完整入口见[证据README](evidence/phase045/README.md)。以上材料供正式审核，不代表已获准进入Phase05。
