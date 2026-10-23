# Phase 04 最终远程验收索引

日期：2026-10-23。受检代码提交 [`94189c817393e6a374b395969b66e373c9bfe1c6`](https://github.com/shenzhuW/Ai_Audio/commit/94189c817393e6a374b395969b66e373c9bfe1c6)。本次只增加验收断言、非敏感夹具和独立证据；`apps/`、Worker、Prisma、依赖及业务功能与受检提交一致。没有发现阻塞功能缺陷，没有 Phase 05 实现。材料提交的完整 Hash 和推送后的 main 以最终交付回复为准，不 amend、不强推、不改写历史。

## 提交、安全与数据边界

- 开始时工作区干净，main 领先 origin/main 一条代码提交；实际 fetch 后远程仍为 `4fa1d4088fc89ba2292895066443c7aa3630bdb4`，差异为 `0 1`，没有未知提交或冲突。推送前再次 fetch；只允许从该已审核基线正常快进。
- [受检提交完整清单和逐文件 blob/大小](evidence/phase04/remote/code-commit-audit.json)：扫描 **155 个文件，零发现，最大 697163 bytes**。检测私钥、Provider Token、数据库凭据、签名会话、本地私有路径、数据库魔数和大文件；另对全工作树及确切 Git 暂存内容扫描，日志见同目录的 `worktree-audit.json` 与 `staged-audit.json`。
- 人工复核新增快照、日志及实际截图均来自隔离的自制合成项目，来源是自写的 32/64 units 冲突文本。没有业务用户资料、密钥、测试数据库、会话签名、上传目录或构建缓存进入本次提交。源码中的鉴权实现和 Blob 描述信息不是会话密钥或上传原件。Git 作者身份沿用仓库已有配置，未重写既有提交身份。
- 原数据前后散列均为 `7a677496c48a00a14538bc505faf99f1b0fbed6a47b678600a9d62facf470b54`。每轮只创建新隔离测试目录/数据库；不迁移用户库、不删除既有数据库或上传原件。专用 PostgreSQL 最后已正常停止，见 [服务收尾](evidence/phase04/remote/local-services.log)。
- [原始本地交付报告](PHASE_04_DELIVERY.md) 保留原提交时的“未推送”历史说明；此次由用户另行授权推送，不改写原验收材料。

## 九项重点复核

以下均在真实 Chrome + 生产 Next.js API + SQLite/PostgreSQL 上执行。完整断言在 [实际验收脚本](../tests/script/run.cjs)，[证据交叉校验结果](evidence/phase04/remote/verification.json) 记录新旧研究 ID、段落 ID、引用和截图 SHA256。这里的“真实”指应用、数据库和浏览器；AI 写稿仍为明确的 Mock。

| 重点 | 两库实际结论与证据 |
|---|---|
| 1. 第二段编辑刷新 | 浏览器修改带双来源引用的第二段、保存、刷新，实际比对文本、稳定 ID、Claim/Source 数组及固定研究 ID 全部一致。结果中的 `refreshedBoundSecond` 保存实际值；[事实引用截图](evidence/phase04/remote/postgresql/04-claims-conflict.png)。 |
| 2. 插入、删除、移动 | 新增第三段、上移、保存，再删除新增段并保存；原两段 ID 顺序/值与预期一致，不因排序重新生成。见两库“真实浏览器第二段刷新…”组及 [编辑截图](evidence/phase04/remote/postgresql/04-user-script.png)。 |
| 3. Fork 引用归属 | 沿用同一研究的 Fork：段落和引用逐项相等，固定研究 ID 不变；换研究的 Fork：清空旧绑定、标 needsRebind，旧 Claim 保存返回 422，显式绑定新 Claim/Source 后保存成功。最终快照所有绑定属于当前固定研究，并有对应 Evidence；旧批准快照不变。 |
| 4. 批准及历史保护 | UI readonly、API PATCH 返回 422、直接更新两个文稿表被数据库约束拒绝。新修订编辑不改变旧批准内容；[批准只读](evidence/phase04/remote/postgresql/04-approved.png)、[历史](evidence/phase04/remote/postgresql/04-history.png)、[版本差异](evidence/phase04/remote/postgresql/04-diff.png)、[驳回](evidence/phase04/remote/postgresql/04-rejected.png)。 |
| 5. 已有文稿免研究 | entryType=script 项目直接从用户文稿导入两段，researchRevisionId 为 null，后续保存/批准/Fork 正常；没有先建研究。旧 Phase 01 文本草稿也经浏览器无损转换。 |
| 6. 冲突/未核实提示 | 双来源 Claim 保持 conflicting；额外无证据 Claim 保持 unverified。浏览器直接等待“未核实”、冲突警告和双方 32/64 引用可见后截图，未把批准文稿当作事实核实；[冲突与未核实](evidence/phase04/remote/postgresql/04-claims-conflict.png)。 |
| 7. 下游失效 | 第二段改变并批准后，其消费者 stale；第一段消费者仍可复用，工作流快照和第 04 页 impact 一致；[影响截图](evidence/phase04/remote/postgresql/04-downstream-impact.png)。消费者是合成依赖记录，不是已生成配音/分镜，不能据此宣称 Phase 05 已实现。 |
| 8. Mock 边界 | 整体/局部任务由真实 Workflow Worker 执行，但结果带 Mock 标志及“未调用真实模型”；局部不改其他段落/引用。未配置 Provider 返回 PROVIDER_NOT_CONFIGURED，文稿不变；[任务截图](evidence/phase04/remote/postgresql/04-mock-unconfigured.png)。引用仍仅来自用户提供的自制原文，不产生新来源。 |
| 9. 两库一致 | SQLite 9/9 组、PostgreSQL 11/11 组通过；保存、批准、Fork、稳定 ID、422、真实并发 `[200,409]`、幂等重放、重启持久化均一致。PG 多出的两组是迁移兼容性与 Schema 零漂移。UUID 在各隔离库本来不同，不要求跨库值相同。 |

## 结果与日志

| 内容 | 本次实际结果 / 文件 |
|---|---|
| 单元测试 | **29/29，0 失败/跳过**：[日志](evidence/phase04/remote/unit-tests.log) |
| Web / Render 类型检查 | 退出 0：[Web](evidence/phase04/remote/typecheck.log)、[Render](evidence/phase04/remote/render-typecheck.log) |
| 生产构建 | 退出 0：[日志](evidence/phase04/remote/build.log) |
| SQLite | **9 组 PASS**：[结果](evidence/phase04/remote/sqlite/results.json)、[运行输出](evidence/phase04/remote/sqlite-run.log)、[快照](evidence/phase04/remote/sqlite/script-snapshot.json)、[Worker](evidence/phase04/remote/sqlite/workers.log) |
| PostgreSQL | **11 组 PASS**：[结果](evidence/phase04/remote/postgresql/results.json)、[运行输出](evidence/phase04/remote/postgresql-run.log)、[快照](evidence/phase04/remote/postgresql/script-snapshot.json)、[Worker](evidence/phase04/remote/postgresql/workers.log) |
| 迁移/兼容性 | PG 17.6 本地独立库，应用角色非 superuser/无 createdb；先运行基线 0001–0003 并写旧项目，再升级 0004、重复 deploy，每条迁移只一条完成记录，旧项目原样保留；[迁移日志](evidence/phase04/remote/postgresql/migrations.log)、[零漂移](evidence/phase04/remote/postgresql/schema-drift.log)。SQLite/PG 均重启后完整 workspace 相等。 |
| 旧阶段回归 | 本次每库包含 Phase 00 HTTP 15 项 + Phase 01 工作流 8 组，实际运行通过。Phase 02/03 完整回归沿用受检代码提交已有记录，本次未重跑，也未改相关应用代码：[既有完整回归](evidence/phase04/regression/)。 |
| 移动端 | Chrome 390px 实际截图且无横向溢出，两库 pageErrors=[]：[移动端](evidence/phase04/remote/postgresql/04-mobile.png) |
| 研究替换 | [实际提示](evidence/phase04/remote/postgresql/04-research-impact.png)；旧依据保留，新依据需重新核对。 |

每库全部 10 张新截图均在 [SQLite](evidence/phase04/remote/sqlite/) / [PostgreSQL](evidence/phase04/remote/postgresql/) 目录。原 9/11 组材料不覆盖，新结果另存 remote。截图复查后将来源详情全部展开重采；最终两库又完整运行一次通过，没有业务修复。

## 实际执行及复现

```powershell
git fetch origin main
git rev-list --left-right --count origin/main...HEAD
git ls-remote origin refs/heads/main
node tests/script/audit-code-commit.cjs
pnpm test
pnpm typecheck
pnpm render:typecheck
pnpm build
pnpm db:local start
$env:STUDIO_UI_BROWSER_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:STUDIO_TEST_PHASE_EVIDENCE_ROOT='docs/evidence/phase04/remote'
node tests/script/run.cjs
node tests/script/run.cjs --postgres
pnpm db:local stop
node tests/script/verify-remote-materials.cjs
node scripts/audit-staged.cjs --worktree
git diff --cached --check
node scripts/audit-staged.cjs
# 审查后创建独立材料提交，再次 fetch 检查基线，正常推送：
git push origin main
git ls-remote origin refs/heads/main
```

日志重定向到上表文件；本机 PATH 使用忽略的 `.tools/bin` 和已有 PowerShell 7，不使用全权限绕过参数。截图复采最后一轮在新生产构建后执行。`verify-remote-materials.cjs` 将 PowerShell 重定向输出统一为 UTF-8 并检查结果、研究引用、Mock 状态、夹具散列和 PNG 签名；它只复核已保存证据，不能代替真实集成运行。

[非敏感手动操作步骤](../fixtures/script/README.md)、[已有文稿](../fixtures/script/existing-script.txt)、[来源 A](../fixtures/script/source-a.txt)、[来源 B](../fixtures/script/source-b.txt) 可直接下载复现。所有“32/64”都是测试数据，没有借用现实事实。

## 尚未解决及停止点

真实模型、联网检索、抓取和视觉理解仍未接通；时长为估计，依赖测试没有实际音频/导演产物。此次未扩建功能，没有新增阻塞缺陷。可信组件限制及 D-17/D-18 不变；不开放自由 AI 代码，不自动发布视频。完成远程材料交付后停止，等待 Phase 04 正式验收，不进入 Phase 05。
