# Phase 04.5 候选 Claim / Evidence 结项补充

整理：2026-10-24。实际执行时间以证据中的 UTC 时间戳为准。本次补齐“真实原文 → Codex候选 → 精确Evidence → 用户审核 → 正式Claim → 文稿引用”，等待补充审核，Phase05暂停。

基线：`d8c71a55cd99a20f34b0bdcddc156467353a8486`，原代码 `a6aee3746e704645e84a8870aaaeff8c4cd3278b`。独立代码提交：`f64b1655f0f5ca5d1050d18683759041bd75d112`。完整31文件及哈希见[确切提交核查](evidence/phase045-claims/code-commit-audit.json)。验收材料另立提交，不amend或重写历史，本报告不代替用户批准。

## 实现

- `domain/research.ts`、`workflow.ts` 增加真实claims任务、候选和审核JSON协议。`server/research/claim-candidates.ts` 冻结当前修订中已采用的真实文本/PDF页，排除Mock、搜索摘要、视觉描述、抓取失败结果。20段/每段12000字符/共60000字符上限与截断明确提示。
- `scripts/codex-claims.cjs` 复用CLI0.163.0 / gpt-6.1-sol，候选分析关闭搜索。模型只输出Claim内容、允许集内Source/Index及原文quote、冲突说明；应用生成候选ID并重算逐字连续匹配的UTF-16 `[start,end)`、PDF页码、原件与完整提取文本SHA256。Worker与写库端校验，接受时再核原文/来源选择。
- 原始生成结果保存于既有Job.researchResult，用户编辑、接受、拒绝保存于claimCandidateReviews，保留runId/model/来源映射/耗时/token/失败尝试。只有用户接受后同一事务写正式Claim/Evidence。候选只能unverified；支持与反驳并存时正式记录沿用conflicting，永不自动supported或“已核实”。
- `research/engine.ts` 沿用草稿、expectedVersion、事务幂等、批准不可变、Fork和迟到结果围栏。第03页新增编辑/保存/刷新/接受/拒绝/出处定位/审计/取消重试；轮询保留未保存编辑与原版本。历史/批准只读。文稿继续绑定固定已批准研究、稳定段落ID与正式Claim/Source。
- 新增POST `.../research-claim-runs`、`.../research-candidates/:candidateId`；既有API兼容。没有重做搜索/视觉/写稿/审批，没有新依赖、DDL、迁移或权限扩张。契约同步至[API](API_SPEC.md)、[数据模型](DATA_MODELS.md)、[架构](ARCHITECTURE.md)、[UI](UI_SPEC.md)。

## 实际命令与结果

| 验证 | 命令 | 结果与证据 |
|---|---|---|
| 单元 | `pnpm test` | **45/45**，原36项+9项候选边界；[日志](evidence/phase045-claims/logs/unit.log) |
| 类型/生产构建 | `pnpm typecheck`；`pnpm build` | exit0；[类型](evidence/phase045-claims/logs/typecheck.log)、[构建](evidence/phase045-claims/logs/build.log) |
| SQLite真实闭环+旧真实AI回归 | `node tests/real-ai/run.cjs --claims-supplement` | **13组PASS**；[结果](evidence/phase045-claims/sqlite/results.json) |
| PostgreSQL同链路 | 上一命令加 `--postgres` | **14组PASS**，含0001–0004初始化/重复迁移；[结果](evidence/phase045-claims/postgresql/results.json)、[迁移](evidence/phase045-claims/postgresql/migrations.log) |
| SQLite无原文/Provider/冲突/重试/Fork | `node tests/real-ai/run.cjs --claims-boundaries` | **4组PASS**；[结果](evidence/phase045-claims/boundaries/sqlite/results.json) |
| PostgreSQL同边界 | 上一命令加 `--postgres` | **5组PASS**；[结果](evidence/phase045-claims/boundaries/postgresql/results.json) |
| Phase03及Phase00/01 HTTP/Workflow回归 | `node tests/research/run.cjs`；加 `--postgres` | **SQLite15 / PG16组PASS**；[证据](evidence/phase045-claims/regression-phase03/) |
| Phase04文稿/版本/依赖回归 | `node tests/script/run.cjs`；加 `--postgres` | **SQLite9 / PG11组PASS**；[证据](evidence/phase045-claims/regression-phase04/) |
| 实际注入及事件核对 | `node tests/real-ai/remote-cli.cjs --claims-supplement --canary`；最终不带 `--canary` 汇总 | **PASS，21次真实CLI**，含2次预期取消；[注入/实际argv](evidence/phase045-claims/remote/injection-canary.json)、[脱敏事件](evidence/phase045-claims/remote/cli-event-projection.json) |
| 最终只读截图复核 | `node tests/real-ai/capture.cjs --claims-supplement` | **两库PASS**，真实Chrome、批准只读、移动端；[日志](evidence/phase045-claims/logs/captures.log) |
| 保存证据交叉核对 | `node tests/real-ai/verify-claims.cjs` | **PASS**；[核对](evidence/phase045-claims/verification.json)、[文件哈希](evidence/phase045-claims/manifest.json) |

运行前 `.tools/bin` 加PATH，`STUDIO_CODEX_ENABLED=1`。PG为本地17.6 / 127.0.0.1:55432，`pnpm db:local start`启动。回归设置 `STUDIO_TEST_PHASE_EVIDENCE_ROOT=docs/evidence/phase045-claims/regression-phase03` 或 `regression-phase04`，不覆盖已审核材料；Phase03另需 `STUDIO_UI_BROWSER_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe`。测试新建唯一目录/数据库，原用户目录散列前后不变，无用户库迁移。

## 验收结论

1. 两库先真实live搜索，再由受限获取器独立取得公开FFmpeg文档。Codex候选的Source/Index属于固定研究，quote、字符范围与双SHA对上实际提取原文；生成后正式Claim/Evidence仍为零。[SQLite定位](evidence/phase045-claims/sqlite/candidate-grounding.json)、[PG定位](evidence/phase045-claims/postgresql/candidate-grounding.json)。
2. 实际浏览器编辑、保存、刷新、接受、拒绝；接受后才写正式记录。伪造quote/未知Source请求422且无部分写库，过期版本/重复审核409，批准后写入422。Fork拒绝旧候选，正式引用正确重映射。
3. 自制冲突文本经真实CLI形成同一候选关联两个Source、支持/反驳与冲突提示；接受后仍conflicting。Provider关闭失败、释放租约且无Mock回退，启用后同任务第二次尝试成功，失败尝试保留。[SQLite](evidence/phase045-claims/boundaries/sqlite/real-conflict-candidates.json)、[PG](evidence/phase045-claims/boundaries/postgresql/real-conflict-candidates.json)。这些原件明确为虚构标注，不代表现实事实。
4. 无原文实际Worker返回insufficient、零模型调用、零正式事实。搜索/抓取失败结果不能成为允许集。PDF页码、精确空白、截断、Mock/视觉排除及迟到保护有单元覆盖，旧PDF实际解析/失败流程有回归覆盖。
5. 新接受AI Claim在研究批准后进入文稿固定绑定；真实局部改写保留其他段落内容/ID/引用，整体写稿保持全部稳定ID与引用。两库重启后候选、审核、正式引用、来源及文稿关系一致。
6. 安全运行时源码与已审核基线相同。实际注入未泄露合成哨兵、未修改合成源码、未产生命令标记；argv/环境键/目录/附件哈希/模型审计脱敏公开。认证仍由CLI自读，应用不读取或复制登录文件。

## 截图、风险与回滚

操作与证据见[索引](evidence/phase045-claims/README.md)、[可复现原件](../fixtures/claims/README.md)。核心截图：[生成](evidence/phase045-claims/sqlite/03-candidates-generated.png)、[编辑后接受](evidence/phase045-claims/sqlite/03-candidate-accepted.png)、[批准只读](evidence/phase045-claims/postgresql/03-candidate-approved-final.png)、[移动端](evidence/phase045-claims/postgresql/03-candidate-mobile-final.png)、[文稿](evidence/phase045-claims/postgresql/04-real-script.png)。

- 首轮Phase03回归漏配系统Chrome，默认Playwright Chromium140的视频元数据超时。保留[失败](evidence/phase045-claims/failures/research-sqlite-first.json)、[日志](evidence/phase045-claims/failures/research-sqlite-first.log)；同一自制MP4的[独立诊断](evidence/phase045-claims/failures/video-browser-diagnostic.json)确认默认浏览器不支持H.264、error4，系统Chrome155正常解析10秒。按原文档配置后两库通过，未改业务视频功能。
- 原两次Windows原生异常 `-1073740791 / 0xC0000409` 继续 **UNCONFIRMED**，保留[原交付](PHASE_04_5_DELIVERY.md)和[原最终验收](PHASE_04_5_FINAL_ACCEPTANCE.md)记录。本次成功不代表根因解决，未作无关系统重构。
- 精确引用只证明出处，不能证明逻辑或真实性，模型可能漏报冲突，仍需用户审核。视觉/OCR/ASR文字不能成为本阶段原文证据。额度/剩余额度未知，调用消耗账户资源；不是任意TSX的OS沙箱。
- 无DDL，可设 `STUDIO_CODEX_ENABLED=0` 停止真实调用。但新claims任务持久化后，直接回到不认识它的旧二进制不能保证读兼容；须保留兼容解析器或在独立备份副本上验证回滚，不能删除用户数据。本次仅使用独立测试库。
- 提交检查覆盖确切Git字节、凭据/Token模式、私有路径、数据库魔数、大文件，并人工审查公开文档/自制输入及输出；不承诺检测任意编码秘密。未提交认证、会话、数据库、上传目录、构建缓存、私人输入输出。Phase05未启动。
