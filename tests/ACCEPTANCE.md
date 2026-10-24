# 验收与测试记录（Codex 持续填写）

## Phase06 导演表（2026-10-24）

- PASS：真实Codex两库各生成120秒6镜结构化结果；固定批准Script/Voice、真实音频SHA、逐镜帧/Cue/来源、模型审计可追溯。模型原始JSON与保存结果一致。
- PASS：一段多镜/多段一镜、时长重算/重排、非法边界拒绝、纯代码/待匹配/真实候选、D-17/D-18、稳定shotId、刷新重启/审批只读/Fork前后差异/409、文稿配音更新stale。
- PASS：真实取消/租约/迟到保护，浏览器未保存取消重试/冲突缓冲，66单元/类型/构建与157组主流程及Phase00–05相关回归。Mock和未配置不代替真实验收。
- 风险：样例Cue为manual已知拼接范围，不冒充词级声学对齐；Windows旧异常与本轮批次中断根因UNCONFIRMED，独立重跑通过。尚无Phase07搜索/正式裁剪，云神经TTS仍未配置。[交付](../docs/PHASE_06_DELIVERY.md)、[证据](../docs/evidence/phase06/README.md)。

## Phase05 配音与语音时间轴（2026-10-24）

- 最终远程复核：受检代码4869793不改业务；重新实际运行56单元、类型/构建、SQLite12/PG14语音组，新增模型原始IO无参考文本核对、鼠标拖动定位、字幕人工修改后应用重启深比较。原126组回归是先前实际运行记录，本轮核对文件，未冒称重新执行全部搜索/渲染。见[远程验收报告](../docs/PHASE_05_REMOTE_ACCEPTANCE.md)。

- PASS：真实中文Whisper ASR→未绑定字幕草稿，真实stable-ts声学句/词对齐→试听/人工修正；不是Mock或平均分配。音频/模型SHA、固定文稿、UTF-16范围、重复词和零宽原始词均可追溯。
- PASS：系统TTS/真实导入/无口播三模式；云端神经TTS未配置和Mock明确失败，临时试听/正式音轨分离；真实FFprobe及Chrome播放/定位/字幕出现/人工编辑刷新。
- PASS：稳定segmentId/anchorId、时间边界、forced来源保护、字幕未绑定禁止提交、批准数据库只读、拒绝/Fork、409/幂等、依赖失效、真实取消/重试/迟到保护及两库重启。SQLite12组、PG14组；56项单元/类型/构建通过。
- 真实Codex旧能力及Phase00–04.5相关回归均按独立证据目录记录；原用户数据保持不变。Windows原生旧两次异常仍UNCONFIRMED。系统声音不是神经模型，识别错字和零宽模型边界须人工核对。详见[Phase05交付](../docs/PHASE_05_DELIVERY.md)。完成后本地提交停止，不推送/不进入Phase06。

## Phase04.5 候选 Claim 补充（整理2026-10-24）

- PASS：真实原文→Codex候选→逐字Evidence→浏览器编辑/接受/拒绝→固定研究文稿引用，两库真实验证；候选unverified，正式冲突记录conflicting，不自动核实。
- PASS：伪造quote/未知Source422、并发/重复审核409、批准只读、Fork旧候选拒绝、来源/文本变化与迟到保护；无原文insufficient零调用，Provider关闭失败且可真实重试。
- PASS：45项单元、类型/构建，SQLite13组/PG14组主链路，边界4/5组，Phase03回归15/16组，Phase04回归9/11组，重启与最终Chrome截图；21次CLI事件及真实注入核对。
- 保留失败：首轮默认Chromium缺H.264导致视频元数据失败，按原文档配Chrome后通过；旧Windows两次原生异常保持UNCONFIRMED。[完整报告](../docs/PHASE_04_5_CLAIM_SUPPLEMENT.md)。Phase05未启动。

## Phase 04.5 本地真实能力验收（2026-10-23）

| ID | 验收条件 | 实际状态 | 证据 |
|---|---|---|---|
| AI-045-01 | Codex ChatGPT登录复用、live搜索和标题/URL/摘要持久化，独立原文获取 | PASS，真实CLI/Worker，两库 | [结果](../docs/evidence/phase045/)、[交付](../docs/PHASE_04_5_DELIVERY.md) |
| AI-045-02 | 图片和3帧视频真实理解，SHA与原视频时间戳一致，非原文/非ASR | PASS，真实模型，两库 | 每库research-snapshot/frames/03-real-vision及video截图 |
| AI-045-03 | 真实整体/局部ScriptSegment，稳定ID、引用、审批只读/Fork、重启 | PASS，两库 | SQLite9组/PG10组；04-real-script.png |
| AI-045-04 | 禁Shell/补丁/外部MCP，V8不可读Node文件；超时、取消与审计fencing | PASS，本机固定0.163.0，非通用OS沙箱 | cli/safety.json、timeout.json、36项单元及两库取消检查 |
| AI-045-05 | SDK/账号额度如实说明 | SDK0.164.0源码评估；未采用/未实际运行；剩余额度unknown | REFERENCE_REVIEW_LOG、codex-environment.json；未把此项标为SDK集成通过 |
| AI-045-06 | Phase03/04及原HTTP/工作流回归 | PASS；一次原生进程异常后独立重跑通过 | 本阶段regression目录；失败/重试说明见交付 |

> 以下所有测试初始状态均为 **NOT RUN**。只有实际运行并保存证据后才允许标记 PASS。Mock 功能即便测试通过也必须记录 Mock，不等于完整外部服务可用。

| ID | 阶段 | 验收条件 | 状态 | 证据 / 命令 / 视频文件 |
|---|---|---|---|---|
| A-001 | 00 | 10 路由均可直接访问，导航正常，不以 PNG 冒充真实页面 | PASS | `pnpm test:http` 及 `pnpm test:e2e`；[HTTP](../docs/evidence/http-results.json)、[浏览器](../docs/evidence/screenshots/result.json)、[截图](../docs/evidence/screenshots/) |
| A-002 | 00 | 自定义 30 秒/240 秒保存并刷新仍在；无固定 90 秒限制 | PASS | `pnpm test` 实际 SQLite 关闭重开；HTTP 与浏览器创建/刷新/列表验证；未使用 Mock 仓储 |
| A-003 | 00 | 项目非法输入校验，单用户最小访问保护 | PASS | 单元与 HTTP：非法需求/画幅/时长、会话伪造/过期、401/403、上传签名、409；浏览器错误提示 |
| INF-001 | 00.5 | Git 基线、忽略规则、敏感文件检查 | PASS | 基线 `e53ab16`；131 文件扫描零发现，数据库/原件/凭据未入库；未推送 |
| INF-002 | 00.5 | 真实 PostgreSQL 迁移初始化、重复执行及 schema 对照 | PASS | [PostgreSQL 结果](../docs/evidence/phase00-5/postgres-results.json)：17.6 实际服务，两个新库，迁移记录唯一且零漂移 |
| INF-003 | 00.5 | PostgreSQL CRUD、时长、九模式组合、并发冲突 | PASS | 同上：30/240/90.5 秒，9 组合，竞争写入仅一次成功；[15 项 HTTP](../docs/evidence/phase00-5/http-results.json) |
| INF-004 | 00.5 | PostgreSQL 上传、保护下载及应用/数据库重启持久化 | PASS | 重启后项目完整 JSON 不变，附件字节和 SHA256 相同；匿名 401、跨站 403 |
| INF-005 | 00.5 | SQLite 兼容性和原数据保护，回归门禁 | PASS | 相同 9 份文档精确往返；旧数据目录前后散列相同；7 项单元/类型检查/生产构建通过 |
| A-004 | 01 | 保存草稿/提交/批准/驳回均持久化，旧版可读 | PASS | [PostgreSQL](../docs/evidence/phase01/postgres-results.json)、[浏览器](../docs/evidence/phase01/screenshots/result.json)；独立表、不可变保护、fork 和应用/DB 重启恢复 |
| A-005 | 01 | 旧修订批准冲突 409、重复请求幂等 | PASS | [PostgreSQL HTTP](../docs/evidence/phase01/workflow-http-postgresql.json)、[SQLite HTTP](../docs/evidence/phase01/workflow-http-sqlite.json)；同键并发一个下游任务、异内容 409、双候选仅一批准、固定输入和 Outbox |
| A-006 | 02 | 使用自有测试片+React SVG 层真实渲染 MP4，音/视元数据正确 | PASS | [交付报告](../docs/PHASE_02_DELIVERY.md)、[SQLite](../docs/evidence/phase02/sqlite/results.json)、[真实 PostgreSQL](../docs/evidence/phase02/postgresql/results.json)：10s/1080×1920/30fps/H.264，none 无音轨；3 组重复帧严格一致，真实播放及 MP4 帧对照 |
| A-007 | 02 | Worker 失败产生可见错误日志，不在主站直接执行不可信 TSX | PASS | [完整异常测试](../docs/evidence/phase02/sqlite/full-results.json)、[真实失败 UI](../docs/evidence/phase02/sqlite/08-failed.png)：缺少 Chromium 的真实子进程失败、重试成功、运行取消；仅可信固定入口，OS 级沙箱 NOT RUN |
| A-008 | 03 | Source/Claim 带来源与状态，未核实不显示已核实 | PASS | [交付报告](../docs/PHASE_03_DELIVERY.md)、[SQLite](../docs/evidence/phase03/sqlite/results.json)、[真实 PostgreSQL](../docs/evidence/phase03/postgresql/results.json)：双来源页码/文本引用、冲突、无证据 422、verified 400、Mock 不能升级、批准只读/fork、真实浏览器 |
| A-009 | 03 | 图片/视频内容基础索引可保存，研究阶段无正式大规模裁剪 | PASS | 同上：真实 PDF/图片/10 秒视频元数据、3 段时间码与抽帧、没有正式 MP4 裁剪；独立 Worker 异常/取消/重试、两库重启持久化；搜索/视觉/OCR/ASR 未配置明确标识 |
| A-010 | 04 | 文稿片段编辑/来源引用/历史修订/批准可恢复 | PASS | [交付](../docs/PHASE_04_DELIVERY.md)、[SQLite](../docs/evidence/phase04/sqlite/results.json)、[真实 PG](../docs/evidence/phase04/postgresql/results.json)：第二段浏览器编辑刷新、增删排序、稳定 ID、固定引用、批准/驳回/fork/历史/差异、409/幂等、双表保护和重启；Mock 显式标识，真实模型 NOT RUN |
| A-011 | 04 | Claim 变化能识别相关文稿/镜头受影响 | PASS（当前阶段子集） | 同上：研究批准版替换定位绑定段落、旧文稿保留/新稿清空旧 Claim 并显式重绑；历史下游消费者及草稿预计失效、指定段落变化失效/其他范围复用。Cue/Shot 模块尚未实现，使用明确的合成依赖记录验证，不宣称已生成真实镜头 |
| A-012 | 05 | TTS/导入/无口播三模式均可产生可验证的时间轴结构 | NOT RUN | |
| A-013 | 05 | Cue 与字幕时间边界校验，用户可修改并保存 | NOT RUN | |
| A-014 | 06 | 镜头有 narrativeGoal/viewerTakeaway/Script/Cue 关联 | NOT RUN | |
| A-015 | 06 | 镜头编辑/排序及最终素材方案批准生效 | NOT RUN | |
| A-016 | 07 | 搜索/许可/候选区间/自动裁剪独立于研究阶段 | NOT RUN | |
| A-017 | 07 | 素材原件不可变，派生文件可重复定位与缓存 | NOT RUN | |
| A-018 | 07 | 商业许可未知/不可商用素材可用于内部测试分镜、裁剪、合成和下载，来源/限制保留，无商业审批 | NOT RUN | D-17/D-18 更新；后续阶段测试，未因文档变更标 PASS |
| A-019 | 08 | 至少 3 类动画组件和真实素材叠加形成 MP4 | NOT RUN | |
| A-020 | 08 | 指定镜头参数改动仅重新构建受影响范围 | NOT RUN | |
| A-021 | 08 | 编译/渲染/视觉检查错误可定位，最多自动修复次数配置化 | NOT RUN | |
| A-022 | 09 | 评论绑定渲染版本+时间码，支持局部修复和版本比较 | NOT RUN | |
| A-023 | 09 | 合规真实样片导出 MP4、SRT、文稿和工程说明 | NOT RUN | |
| A-024 | 09 | 浏览器刷新/任务重试/取消/恢复不丢批准的产物 | NOT RUN | |
| A-025 | 09 | 内部导出检查媒体完整性并保留来源/限制，商业许可未知不阻断，不自动公开发布 | NOT RUN | D-17/D-18 更新；公开商业发布控制留后续 |

## 端到端样例（统一）

Phase 01：12 项单元测试通过；SQLite 和真实 PostgreSQL 各运行现有 15 项 HTTP 回归和 8 项工作流检查。生产构建/类型检查通过；PostgreSQL 浏览器连续三轮通过，4 张最新截图落盘。实际 Worker 成功写入 Mock 草稿；未配置音频 Provider 明确失败；任务租约/取消/重试边界通过单元测试。`0001` 测试项目升级 `0002` 后 JSON 不变，重启后修订/审批/审计/任务完整恢复。没有执行真实用户数据迁移、真实 AI、音频或视频渲染。

Phase 00 实际执行日期：2026-10-22。Node 24.15.0 / Windows / Next 15.5.19 / Playwright 1.55.0 / Chromium 1187。最终 HTTP 和浏览器使用 `STUDIO_TEST_URL=http://127.0.0.1:3002` 的生产实例及独立验收数据目录。`pnpm typecheck`、`pnpm build`、Prisma generate/validate 通过。PostgreSQL 连接/迁移/CRUD、真实 AI/TTS/媒体渲染未运行；不在 A-001 至 A-003 的 PASS 范围。详细命令与限制见 [交付记录](../docs/PHASE_00_DELIVERY.md)。

最终回归：7 项单元测试、15 项 HTTP 检查；关闭工作台自动预取后的生产构建连续三轮浏览器验收通过，生成 14 张截图。早期导航超时及修复过程已在交付记录说明。

- 题目：为什么 AI 大模型需要大量 GPU？
- 输入目标：`120000 ms`、`9:16`、`1080×1920`、`30 fps`。
- 六个镜头的示例仅用于 UI/自动测试，真实视频镜头数量可动态生成。
- 首个真实视频 PoC 推荐控制 10–15 秒；成功后逐步扩展至完整项目。
- 样例 research Source / Claim / 授权默认 **Mock/未核实**；内部开发测试优先，商业许可未知或不可商用不自动排除素材，来源/限制保留，不自动公开发布。

## Codex 每阶段需要补充的证据
```text
阶段：
执行命令：
实际环境：
PASS 项：
FAIL/BLOCKED 项：
Mock/Real 对照：
截图和 MP4 路径：
失败日志：
后续建议：
```
