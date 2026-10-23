# Phase 04.5 本地交付：Codex 优先真实搜索、视觉与口播

日期：2026-10-23。基线 `881e1022ea27638bf7a3c7364c55871802c56fe5`。先新建原本不存在的 [04-5计划](../plans/04-5-real-ai.md)、更新架构及D-19，再实施。**三个真实能力目标及本机集成验收已完成，正在按用户另行授权提交最终远程验收材料，不进入Phase05。** 没有购买外部搜索/模型API，没有将Mock替代真实模型结果。代码提交 [`a6aee3746e704645e84a8870aaaeff8c4cd3278b`](https://github.com/shenzhuW/Ai_Audio/commit/a6aee3746e704645e84a8870aaaeff8c4cd3278b)；新增的12项复核、安全清单与Windows专项见[最终验收报告](PHASE_04_5_FINAL_ACCEPTANCE.md)和[证据索引](evidence/phase045/README.md)。本地原始运行记录保留，补充检查不冒充整轮真实AI重跑。

## 结果与技术取舍

| 目标 | 实际结果与证据 |
|---|---|
| 本机CLI/登录 | 实际为 **codex-cli 0.163.0 / ChatGPT登录 / gpt-6.1-sol**，支持text/image；[脱敏环境检查](evidence/phase045/codex-environment.json)。应用不读取/复制auth.json或Token，CLI自行使用现有登录。 |
| 实时搜索 | 真实live事件、查询、实际返回的标题/URL/搜索片段与模型摘要持久化。只接受能在实际搜索事件中对照的URL/标题；[CLI PoC](evidence/phase045/cli/search.json)、两库结果与研究快照。 |
| 独立原文 | 受限HTTP获取器单独获取网页，保存原始响应/提取文本Blob、SHA/时间/最终URL。成功才加入研究Source/内容索引；失败候选仍保留失败原因，不生成原文证据。原始HTML作为受保护text/plain附件，不执行页面。 |
| 真实视觉 | 自制三柱图被实际识别出红/绿/蓝柱、A/B/C和10/20/30；源SHA绑定。10秒自制视频在 **0/3333/6666ms** 三帧逐一分析，独立FFmpeg重抽的JPEG SHA与存储帧完全一致。描述不写extractedText、不作为matched原文，不声称音轨/动态理解。 |
| 真实写稿 | 真实整体/局部生成均经现有ScriptSegment解析。局部只改目标ID，其他段保持；整体保留全部ID/引用。输入固定批准研究、Claim/Source允许集及叙事意图，未核实Claim保留提示，不编造新来源。 |
| 原工作流 | 复用Research/Workflow Worker、Job/Outbox、心跳/租约、幂等、409、批准只读、Fork和依赖机制。取消时终止CLI进程树，已取消内容不回写；重启后结果与审计保持。 |
| 使用审计 | 每次实际调用记录模型/CLI版本/runId、live或disabled、耗时、实际token/缓存、失败码和隔离摘要。未建立会话则runId=null；取消/超时无法获得最终token则usage=null；**剩余额度unknown，未推算为0/无限**。 |
| SDK/app-server | 优先评估了SDK **0.164.0** 官方源码/Apache-2.0许可。SDK缺少本次依赖的ignore-user-config/ignore-rules/ephemeral开关，故保留CLI桥接，未安装/实际运行SDK；暂无持久会话/审批需求，不引入常驻app-server。[研究记录](REFERENCE_REVIEW_LOG.md#2026-10-23--phase-045--codex-cli--sdk-数据分析)。 |

Codex账号调用受套餐、模型、任务、共享额度和可能的credits限制；不是“已有登录即可永久免费”。官方[额度说明](https://learn.chatgpt.com/docs/pricing)建议查看usage dashboard或CLI /status。此次exec未提供当前账号的剩余额度/订阅档位，未读取个人账号资料推测；项目金额预算也尚未折算为ChatGPT额度。未修改计费设置或自动购买credits。

## 执行器与安全边界

- `scripts/codex-runtime.cjs` 使用固定可信二进制及版本，每次预检登录、工具catalog和MCP。独立用户临时目录，输入只经stdin和必要PNG/JPEG附件；不开放用户控制argv/环境/二进制。模型子进程环境移除应用数据库、Provider/Git凭据；认证留给CLI。
- `--sandbox read-only --ignore-user-config --ignore-rules --ephemeral --json --output-schema`，关闭Shell、补丁、view_image、MCP服务、插件、Hook、技能、浏览器、子Agent等；固定catalog的shell=disabled、patch=null、扩展工具为空，并再次检查生效。遇到其他CLI版本或失败预检直接拒绝，不使用全权限/yolo。
- 本版本live搜索需要独立Code Mode Host。它提供V8数据计算，**没有Node进程/文件/网络API**；实际[诊断](evidence/phase045/cli/safety.json)中process/require/fetch/Deno均undefined，node:fs导入被拒绝。关闭进程内fallback。源码注册与固定版本一并核查，不只相信提示词或模型自述。
- CodeModeOnly总会列出三个MCP资源辅助入口。空表不会移除已有MCP配置；本机两项均通过单次调用覆盖为disabled并预检启用数0，不改全局配置。这些入口没有可用服务器，不能宣称工具表为空，也不授权MCP凭据/本机文件访问。
- 模型子进程默认120秒、4MiB事件、6张图片/每张8MiB；研究含三帧任务最多240秒。Heartbeat每2秒续30秒租约，取消/关闭信号传到全进程树。Attempt.workerId允许取消后只补同次审计，租约仍null，旧worker/attempt不能覆盖新尝试。
- 获取器不使用浏览器/脚本/Cookie/凭据，HTTP(S)默认端口、公开IPv4检查、DNS固定、每次重定向复核，最多3次/1MiB/15秒含DNS。私网、localhost、IPv6直连/仅IPv6、非文本、异常编码、超限和受保护页面明确失败，不绕过DRM/登录/付费墙。
- 这是本机固定版本的有限工具数据分析边界，**不是任意AI TSX的通用OS沙箱**；可信组件限制和D-17/D-18保持，未开放源码修改、Shell、Git或自动发布入口。

## 实际运行与结果

| 检查 | 最终结果 | 记录 |
|---|---|---|
| 单元 | **36/36 PASS，0失败/跳过**，原29项+7项真实桥接/抓取/审计规则 | [日志](evidence/phase045/unit-tests.log) |
| 类型 | Web及Render检查退出0 | [Web](evidence/phase045/typecheck.log)、[Render](evidence/phase045/render-typecheck.log) |
| 生产构建 | 退出0 | [构建](evidence/phase045/build.log) |
| CLI真实能力 | Schema写稿、live搜索、图片、视频单帧均实际执行 | [CLI证据](evidence/phase045/cli/) |
| CLI安全/超时 | 有限工具/V8诊断通过；500ms模型截止触发实际CODEX_TIMEOUT并结束进程 | [安全](evidence/phase045/cli/safety.json)、[超时](evidence/phase045/cli/timeout.json)。总墙钟还包含单独有界的预检/进程终止。 |
| SQLite真实AI | **9/9组PASS** | [结果](evidence/phase045/sqlite/results.json)、[原运行记录](evidence/phase045/sqlite-initial-run.log)、[最后两步复核](evidence/phase045/sqlite-finalize.log)、[Worker](evidence/phase045/sqlite/workers.log) |
| PostgreSQL真实AI | **10/10组PASS** | [结果](evidence/phase045/postgresql/results.json)、[运行](evidence/phase045/postgresql-run.log)、[Worker](evidence/phase045/postgresql/workers.log) |
| PG初始化/迁移兼容 | 独立PG17.6、沿用0001–0004，重复deploy后每条完成记录各1；无新DDL/用户库迁移 | [迁移](evidence/phase045/postgresql/migrations.log)、PG结果第一组 |
| 最终浏览器 | 两库重新读取同一已通过的隔离项目；无模型重调用；数据/截图/390px/无pageError通过 | [输出](evidence/phase045/browser-final.log)、每库captures.json |
| 原Phase04及00/01 | SQLite9/PG11组完整回归，含两库HTTP15项/工作流8组、409/幂等、批准保护、稳定ID和下游失效 | [Phase04回归](evidence/phase045/regression/phase04/) |
| 原Phase03 | SQLite15/PG16组完整回归；PDF/文本/媒体/Claim/引用/原件保护及PG零漂移 | [Phase03回归](evidence/phase045/regression/phase03/) |

Phase02渲染代码/素材与0001–0004未修改，此次没有重跑Remotion渲染，不把旧渲染结果当作本阶段新测试。原`.data`与旧验收原件目录前后散列一致；真实AI验收使用的散列算法及值见两库结果最后一组。所有测试库/原件保留，不删除用户数据。

实际命令（安装依赖未变化，Node24.15.0/pnpm10.34.4，Windows）：

```powershell
codex --version
codex login status
codex exec --help
node scripts/codex-inspect.cjs
node scripts/codex-poc.cjs structured
node scripts/codex-poc.cjs search
node scripts/codex-poc.cjs image
# FFmpeg从background.mp4的3.333s抽一帧到.cache后：
node scripts/codex-poc.cjs video
node scripts/codex-poc.cjs safety
pnpm test
pnpm typecheck
pnpm render:typecheck
pnpm build
pnpm db:local start
node tests/real-ai/run.cjs
# 同一SQLite隔离运行仅最后两步的测试断言修正后：
node tests/real-ai/run.cjs --resume-finalize
node tests/real-ai/run.cjs --postgres
node tests/real-ai/capture.cjs
# STUDIO_TEST_PHASE_EVIDENCE_ROOT设置到本阶段regression/phase04或phase03：
node tests/script/run.cjs
node tests/script/run.cjs --postgres
node tests/research/run.cjs
node tests/research/run.cjs --postgres
pnpm db:local stop
node tests/real-ai/verify.cjs
node scripts/audit-staged.cjs --worktree
git diff --check
```

本机使用已有忽略目录`.tools/bin`的pnpm及PowerShell7；模型调用无绕过沙箱参数。具体启动/环境配置见[本地说明](LOCAL_DEVELOPMENT.md#phase-045本机-codex-真实能力)。上述真实AI集成脚本仅对自身子进程显式启用STUDIO_CODEX_ENABLED=1，不改用户.env。

## 失败与修正，未掩盖项目

1. 首次CLI搜索把中间“正在搜索”进度当JSON解析而失败；另一次禁用CodeModeHost导致没有搜索事件。这些轮次不算live搜索通过。修复最终消息解析，核对Host/V8边界后重新执行，最终保存真实live事件和官方URL。
2. 首次安全门禁因三个原生MCP资源辅助入口判FAIL（[保留记录](evidence/phase045/cli/safety-initial.json)）。源码确认是固定辅助入口，另发现本机MCP配置不能靠空表清除；增加逐项disabled和0启用预检，再做V8诊断通过。不因“提示词要求只读”放行。
3. 真实取消测试最初丢失使用审计：终态清空leaseOwner使补记被拒。新增测试先失败，再持久化Attempt.workerId做同次审计授权；取消后state/空租约不变，新attempt有fencing。最终双库实际取消都通过，迟到结果未写入。
4. SQLite最终流程的Fork请求**实际已成功返回既有200**，新测试误期望201。只修正测试，不改API；同一隔离运行的前7组保持，重新验证批准只读/Fork和重启/移动端最后2组完成9组。results.resumedFinalization明确记录，未重复付费模型调用伪造整轮重跑。
5. 最终截图脚本把“查看研究任务和日志”写成“与”，第一次超时；修正选择器后两库重新完整采集通过，不修改业务功能。
6. 两个不同批次出现原生进程退出`0xC0000409`：一次Phase03回归只完成HTTP，一次最终复拍只完成SQLite，未完成的轮次不计PASS。根因未确认。独立重跑后Phase03双库15/16组通过，PostgreSQL最终复拍也通过；后者仅重读相同隔离项目，不重调模型。[复拍短记录](evidence/phase045/browser-native-exit.log)、[PG独立重拍](evidence/phase045/browser-postgresql-retry.log)及[诊断摘要](evidence/phase045/diagnostics.json)保留这一环境风险。后续应继续监测，未宣称已修复其底层原因。
7. TDD新增模块/取消授权/抓取DNS截止的预期失败保留本机.cache。最终材料交叉核验发现构建虽退出0但有createRequire动态参数警告；改为原生动态加载可信宿主桥接，并新增无模型调用的取消加载测试，最终构建无该警告，单元36项全部通过。有意的未配置、422/409、取消和超时是阻断验收，不是伪造外部模型成功。
8. 最后文件清单检查发现两份自制HTTP回归结果被子进程相对路径写到apps/web/docs；已原样移回对应证据目录，未覆盖其他文件，并将旧研究测试的证据根目录解析为绝对路径。业务逻辑/原件未改；两份真实HTTP记录各15项保留，不将文件搬移说成重新运行测试。

## 页面、来源与复现

- [真实搜索/独立原文](evidence/phase045/postgresql/03-real-search.png)、[三柱图视觉](evidence/phase045/postgresql/03-real-vision.png)、[视频时间索引](evidence/phase045/postgresql/03-real-video.png)、[研究任务](evidence/phase045/postgresql/03-real-audit.png)。
- [真实文稿/运行ID/token](evidence/phase045/postgresql/04-real-script.png)、[390px](evidence/phase045/postgresql/04-mobile.png)；SQLite同名截图也已保存。
- [研究证据投影](evidence/phase045/postgresql/research-snapshot.json)、[文稿快照](evidence/phase045/postgresql/script-snapshot.json)、[自制输入及操作](../fixtures/real-ai/README.md)。原文只公开100字符预览/长度/SHA；完整网页原件/HTML位于隔离数据目录并受保护下载，公开投影不能直接当作数据库导入文档。
- 最终[交叉核验](evidence/phase045/verification.json)、[文件清单](evidence/phase045/manifest.json)、[安全扫描](evidence/phase045/security-audit.json)。截图来自实际Chrome，图表是自写SVG，视频背景沿用自制测试素材；没有生成假研究文章或假核验结论。

## 修改内容与遗留风险

- 新增AiRun协议、CLI固定版本桥接/脱敏检查/PoC、Codex Research和Script Adapter、受限网页获取器、任务使用量组件；研究/文稿页面增加真实Provider和边界说明。
- 原domain/research、script、workflow及Worker最小增量：真实搜索、可选vision、AI审计、信号取消、Attempt执行者；修订/审批/数据库/上传管理不重写。没有新包依赖/锁文件变化/迁移文件。
- 更新计划、D-19、AGENTS、PRD/架构/数据/API/UI/启动/参考研究/进度/验收文档；增加真实双库/浏览器与安全测试、自制SVG和证据。完整文件及SHA见manifest。
- **限制**：仅验证本机Windows、CLI0.163.0和gpt-6.1-sol；新版本/模型/平台须重做门禁。SDK仅源码评估，剩余额度/金额换算未知；站点抓取覆盖有限，无动态页面、完整OCR/ASR或整段视频运动理解。模型可能误解图片/写错推断，仍需审核/事实核对；无证据Claim不自动核实。
- **回滚**：停止Worker、备份数据库/私有目录，设置STUDIO_CODEX_ENABLED=0保留当前代码/记录。旧Phase04不认识新增JSON枚举，不能直接降级读取新数据；不以删数据实现回退。测试库和CLI临时数据未自动清除，不包含在提交范围。

已满足本阶段三个真实验收目标；Phase05继续暂停，等待阶段审核。没有因已登录而承诺永久免费，也没有为适配参考项目重写已验收模块。
