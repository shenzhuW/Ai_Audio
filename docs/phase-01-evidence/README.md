# Phase 01 最终验收摘要

复核日期：2026-10-23。核查代码：`70d4ddf06d3ce306b7f30cd3c78e4de3b6251638`。

**结论：满足 [plans/01-workflow.md](../../plans/01-workflow.md) 的全部本阶段任务及三项可验收交付物，提交用户最终审核。** 本轮未发现需要修改应用的验收缺陷；只新增本目录中的说明、复核脚本、日志和截图。没有进入 Phase 02，没有执行真实 AI、音频或渲染。

## 交付标准逐项结论

| 计划要求 | 真实核查结果 | 证据 |
|---|---|---|
| Artifact / Revision / ApprovalEvent / Job / Dependency、审计与迁移 | 真实 PostgreSQL 新库部署 0001/0002，重复部署成功且 schema diff 为零；SQLite 使用相同逻辑协议 | [迁移日志](migrations.log)、[综合结果](verification.json) |
| 草稿、提交、批准、驳回、fork、历史和 expectedVersion/409 | 草稿/驳回刷新恢复；批准正文 PATCH 返回 422 `IMMUTABLE_REVISION`，直接 SQL UPDATE 同样被拒绝；fork 产生新 UUID 与修订号，旧正文完整不变；审核事件不能直接 DELETE | 综合结果、[操作截图 01–07](OPERATIONS.md) |
| 两个客户端批准不同修订仅一方成功 | 同时批准旧候选与当前候选返回 409/200，错误 `REVISION_CONFLICT`，仅一个批准事件 | 综合结果“并发审批 409 与幂等重放单任务”、双数据库 HTTP |
| 相同请求重试不重复启动任务 | 同键并发/重放返回相同结果，下游仅一个 jobId；同键不同正文返回 409 `IDEMPOTENCY_CONFLICT` | [PostgreSQL HTTP](workflow-http-postgresql.json)、[SQLite HTTP](workflow-http-sqlite.json)、综合结果 |
| 总览真实状态、任务、依赖及刷新恢复 | 上游批准新版后旧依赖下游显示 stale；历史状态仍为 approved；总览刷新及应用进程重启后完整快照一致 | [依赖失效](08-dependency-stale.png)、[总览](09-overview-dependencies.png)、综合结果 |
| 可查询异步 jobId、Mock 来源标签 | 独立 Worker 写入真实 Mock 草稿；编辑/fork 后 mock=true 保留；未配置配音失败 `PROVIDER_NOT_CONFIGURED`，无 resultRevisionId | [Mock 草稿](11-mock-draft.png)、[编辑/fork](12-mock-edited-fork.png)、[提供方失败](13-provider-unconfigured.png) |

审核针对创作修订，不代表事实已核实或素材已获许可。UI 使用“手动内容 · 未核实”或“Mock · 未核实”。对照 UI_SPEC 的详细范围与操作见 [操作说明](OPERATIONS.md)。

## 本轮实际命令与结果

环境：Windows x64、Node 24.15.0、pnpm 10.34.4、Next 15.5.19、Prisma 6.19.3、PostgreSQL 17.6、Playwright 1.55.0 / Chromium 1187。

| 实际执行命令 | 最终结果 |
|---|---|
| `pnpm typecheck` | PASS，退出 0；[checks.log](checks.log) |
| `pnpm test` | PASS，12/12、无跳过；包括 SQLite 直接 SQL 保护、版本/并发/幂等、传递 stale、Mock 标签、取消/重试/租约；同上 |
| `pnpm build` | PASS，退出 0；[build.log](build.log) |
| `pnpm db:local status`、`pnpm db:local start` | 初始专用 cluster 未运行（status 退出 3），随后正常启动；仅使用新测试库 |
| `node docs/phase-01-evidence/verify.mjs` | 最终 PASS，退出 0：16 组复核、PostgreSQL/SQLite 各 8 项现有 HTTP 检查、14 张真实浏览器截图，pageerror=0；[integration.log](integration.log)、[verification.json](verification.json) |
| 脚本内 `prisma migrate deploy` 两次及 `prisma migrate diff ... --exit-code` | 均退出 0；[migrations.log](migrations.log) |
| 脚本内 `node ../../scripts/workflow-worker.cjs --once` | 真实独立 Worker 执行；生成 Mock 文本或返回真实失败，无网络模型调用 |
| `node scripts/audit-staged.cjs --worktree`、`git diff --check` | 敏感扫描零发现；差异检查通过；[audit.json](audit.json) |
| `pnpm db:local stop` | 复核结束后正常停止；新库及测试原件保留 |

首轮复核在提供方错误补拍处失败：该测试项目已先令上游失效，真实任务正确返回 STALE_INPUT，未出现期望的 PROVIDER_NOT_CONFIGURED。已核对实际数据库行，将补拍改为没有失效上游的独立测试项目后全量复跑通过。只修正本目录验收脚本，没有改动应用。首轮诊断保留在忽略缓存 `.cache/phase01-final/mvk89hqx/first-attempt.json`，不将首轮失败算作通过。

## 数据安全与边界

- 新库名和运行时间记录在 verification.json；应用角色非超级用户、无建库权限。迁移仅用于新测试库，没有迁移真实用户项目。
- 原 `apps/web/.data` 及 `.cache/acceptance-data` 的文件路径/内容聚合 SHA256 前后相同，涵盖其中数据库、原件和会话文件；没有删除或覆盖旧数据。
- 14 张 PNG 均来自本轮真实应用、真实 PostgreSQL、无拦截模拟响应；截图时间、URL 和 SHA256 在 verification.json。生成文本本身为 Mock。
- Worker 生产打包、长任务心跳、大规模历史性能及真实 Provider 仍待后续验证。本轮没有扩展这些功能；此前数据库整体重启验收见 [原交付报告](../PHASE_01_DELIVERY.md)。
- 此代码已按此前“上传代码”的明确授权提交并上传，既有 Phase 01 提交即上方 Hash。验收整理期间未新增提交或推送；随后用户明确授权“验收材料上传仓库”，本目录作为独立文档提交上传，核查代码基线不变、不改写历史。上传不代表获准进入 Phase 02。

## 复跑

在根目录执行以下命令；需已有的专用 PostgreSQL cluster 和 Chromium。脚本使用 3005 端口，每次创建独立 `studio_phase01_final_*` 库及 `.cache/phase01-final/<run>` 原件目录；不 reset、不 DROP，不使用真实用户 DATABASE_URL。旧运行的数据保留，证据目录展示最新运行。

```powershell
$env:Path=(Join-Path $PWD '.tools/bin')+';'+$env:Path
# 若 pwsh 不在 PATH，先把本机 PowerShell 7 可执行目录加入当前终端 PATH。
pnpm typecheck
pnpm test
pnpm build
pnpm db:local start
$env:STUDIO_CHROMIUM_PATH='C:/Users/WZS/AppData/Local/ms-playwright/chromium-1187/chrome-win/chrome.exe'
node docs/phase-01-evidence/verify.mjs
pnpm db:local stop
```

本次停止于 Phase 01 最终验收，等待用户审批。
