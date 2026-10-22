# Phase 00.5 交付报告 · 2026-10-22

状态：Git 基线已保存，真实 PostgreSQL 集成门禁通过。工程基础具备进入 Phase 01 的条件，但尚未进入，等待用户明确审核批准。没有开发审核、不可变修订或工作流功能。

## 1. Git 基线

实际项目目录为 `W:/a_study/Other/AI_Audio/AI_audio_work/AI_Code_Video_Studio_Codex_BAE6A58CE5AB8EE58B`。对当前目录和上级执行 `git rev-parse --show-toplevel` 均返回非 Git 仓库，随后按用户授权执行 `git init -b main`。

- 基线提交：`e53ab169d590cb1c7d6f334ae962121cc33d29cb`。
- 标题：`chore: establish verified Phase 00 baseline`，共 131 个文件。
- 使用机器原有 Git 作者配置，没有修改全局身份或系统配置。
- 暂存区 131 个文件的敏感内容扫描零发现；这表示本工具规则未发现问题，不代替专业秘密扫描器。规则检查私钥、常见 Provider token、非占位数据库密码及不该提交的文件路径，输出不显示匹配内容。
- `.gitignore` 排除环境秘密、session-key、本地数据库及 WAL/SHM、上传原件、媒体目录、备份、构建产物、node_modules 和缓存；环境示例保留。API 源码路径 `uploads/[blobId]/route.ts` 已确认正常纳入基线。
- 新增 `.gitattributes` 固定文本 LF，图片标记二进制。Phase 00.5 的后续代码/文档修改保留在工作区供审核，未追加提交。
- 没有远程仓库配置，没有推送，没有删除、重置或覆盖用户项目数据。

## 2. PostgreSQL 环境和迁移方案

环境：Windows x64、Node 24.15.0、pnpm 10.34.4、Prisma Client/CLI 6.19.3、PostgreSQL 17.6。Docker 客户端存在，但 Docker Desktop 没有提供可用 daemon，因此采用 PostgreSQL 官网推荐的 EDB 独立二进制包，没有安装系统服务。

二进制和下载 SHA256、认证配置及完整命令见 [POSTGRESQL_LOCAL.md](POSTGRESQL_LOCAL.md)。专用 cluster 位于忽略目录 `.cache/postgres-phase005/cluster`，仅监听 `127.0.0.1:55432`，使用 SCRAM-SHA-256。应用角色是非超级用户且没有建库权限；管理员仅用于隔离测试环境初始化。

每次验收新建 `studio_phase005_<run>` 和 `_fresh` 两个数据库，不复用默认开发库，不执行 DROP/reset。应用使用端口 3003 和独立 `.cache/phase005-runs/<run>` 保存原件/会话。数据库及测试文件均保留，应用测试进程在结束时退出；交付前已通过 `pnpm db:local stop` 正常停止专用数据库，复查时用 `pnpm db:local start` 恢复。

现有 `schema.prisma` 已指定 PostgreSQL，`0001_project/migration.sql` 创建项目 UUID、owner/version 索引列和 JSONB 文档，足以支持本阶段。因此**没有修改 Schema、数据模型或已提交迁移，也没有追加空迁移**。实际执行原迁移到两个空库，并重复执行，数据库迁移记录保持唯一；实际数据库与 Schema 的 diff 为空。时间仍使用协议允许的 UTC ISO 字符串。

唯一生产代码修改是 Prisma 仓储的导入与类型：Phase 00 为无法生成客户端的环境保留了手写结构类型和动态加载，本次改用 `PrismaClient` 与生成的 `Prisma.ProjectUncheckedCreateInput`。服务与仓储接口、API、UI 和既有 CRUD 行为保持原有范围；首次安装后需要 `pnpm db:generate`，启动说明已同步。

## 3. 命令与实际测试

在项目根目录执行。本机 pnpm 临时 wrapper 位于 `.tools/bin`，先加入 PATH；生成的客户端、数据库、下载包和凭据不会提交。

```powershell
$env:Path=(Join-Path $PWD '.tools/bin')+';'+$env:Path
$env:Path=(Split-Path (Get-Process -Id $PID).Path)+';'+$env:Path
pnpm db:generate
pnpm typecheck
pnpm test
pnpm build
pnpm db:local init
pnpm db:local start
pnpm test:postgres
node scripts/audit-staged.cjs --worktree
```

| 实际执行项 | 结果和证据 |
|---|---|
| `git init -b main`、`git add .`、`node scripts/audit-staged.cjs`、`git commit -m ...` | PASS，基线信息见第 1 节；没有远程推送 |
| `pnpm db:generate` | PASS，Prisma Client 6.19.3 生成成功 |
| `pnpm typecheck` / `pnpm test` | PASS，TypeScript 无错误，7 项单元测试通过；[日志](evidence/phase00-5/checks.log) |
| `pnpm build` | PASS，编译、类型检查、页面生成与构建跟踪完成；[日志](evidence/phase00-5/build.log) |
| `postgres-local.ps1 init/start` | PASS，真实 PostgreSQL 17.6 初始化并在 loopback 启动 |
| Prisma `migrate deploy` | PASS，测试库首次部署、同库重复部署、第二空库初始化、数据库重启后再部署；没有 pending migrations |
| Prisma `migrate status` 和 `migrate diff --from-schema-datasource ... --to-schema-datamodel ... --exit-code` | PASS，实际数据库无 schema 漂移；原迁移未改写 |
| `pnpm test:postgres` 仓储验证 | PASS，真实数据库九种 entryType × voiceMode 组合，30/240/90.5 秒，列表/详情、owner 隔离、更新、并发冲突与重连 |
| 同一测试运行的 HTTP 套件 | PASS，15 项全部连接真实 PostgreSQL 应用；包含创建/读取/设置 PATCH/409、上传/签名/容量/保护下载、401/403、路由与 Demo 隔离；[HTTP 结果](evidence/phase00-5/http-results.json) |
| 应用及数据库重启 | PASS，3 份 HTTP 项目完整 JSON 保持一致；原件重启后下载字节不变，SHA256 对应；迁移记录仍为 1 条 |
| SQLite 兼容性及数据保护 | PASS，9 份项目在两个仓储逐字段一致；原 `.data` 和旧验收目录含文件名/内容的 SHA256 聚合散列前后相同 |
| 敏感文件与忽略规则复查 | 工作区扫描结果见 [日志](evidence/phase00-5/audit.json)；仅保留非敏感结果 |

完整 PostgreSQL 检查名、实际服务版本、数据库名和对应项目 UUID 见 [postgres-results.json](evidence/phase00-5/postgres-results.json)。HTTP 返回的三份项目完整 JSON 均另外直接查询 PostgreSQL 行比对，不能由 SQLite 或 Mock 代替。

测试执行中遇到过 Windows `pg_ctl restart` 启动的子进程继承输出管道、导致测试进程等待的问题。PostgreSQL 已重启，但当次测试未完成，未标记全通过；测试工具改为使用配置好的日志文件并忽略该子进程 stdio 后，重跑完成所有步骤。该修改仅涉及测试工具。

运行 package 脚本时还发现当前执行终端是 Windows PowerShell 5，且 `pwsh` 不在 PATH；补充 PowerShell 7 可执行目录后，`pnpm db:local init/start/stop` 及 `pnpm test:postgres` 均实际通过。辅助脚本要求 PowerShell 7，文档已写明，未更改系统 PATH。

## 4. SQLite / PostgreSQL 兼容与安全过渡

兼容验证使用同一 ProjectSchema 和服务接口，保存相同 UUID、ownerId、version、ISO 日期及完整 JSON。SQLite 的文档文本解析结果与 PostgreSQL JSONB 读取结果精确相同；版本更新仍采用单条带 expectedVersion 条件的原子写入。

本次**没有自动切换默认数据库或导入已有用户项目**。SQLite 与原件保持原状。正式过渡按以下顺序执行，详细方案见 [数据库说明](POSTGRESQL_LOCAL.md)：

1. 停写后完整备份 SQLite 数据及原件目录，记录散列。
2. 初始化新的空 PostgreSQL 库和空原件目录，应用已验证迁移。
3. 用只读 SQLite 连接验证每份文档；后续导入工具应在 PostgreSQL 事务内保留原 UUID/版本/日期写入，重复主键或错误立即终止，不能 upsert 覆盖。
4. 按附件 UUID 复制原件，核对数量、字节和 SHA256；逐项目比较完整 JSON 和保护下载。
5. 审核导入结果后一起切换 DATABASE_URL 与 STUDIO_DATA_DIR。发生新写入后不能直接切回旧库，应先停写、备份并核对增量。

目前只交付此安全方案与协议兼容测试，未实现批量导入工具。新增数据库开发不依赖用户旧数据迁移；如后续需要带旧项目进入 PostgreSQL，应单独批准执行迁移。

## 5. 本阶段修改文件

| 文件 | 内容 |
|---|---|
| `.gitignore`（已在基线提交）、`.gitattributes` | 忽略私密/本地数据与构建缓存，统一文本行尾 |
| `scripts/audit-staged.cjs` | 暂存区及工作区敏感路径/内容检查，只输出规则和文件名 |
| `apps/web/src/server/project/postgres.ts` | 使用 Prisma 生成客户端和类型，删除临时结构类型及动态加载 |
| `scripts/register-typescript.cjs`、`scripts/test.cjs` | 单元和仓储集成共用进程内 TS 加载器 |
| `scripts/postgres-local.ps1` | 专用 cluster 初始化/启停/重启/状态，不覆盖已存在数据 |
| `tests/postgres/repository.cjs`、`tests/postgres/run.cjs` | 真实 PostgreSQL 迁移、兼容、CRUD、HTTP、重启及旧数据保护验收 |
| `tests/http/run.mjs` | 明确数据库后端标识，可配置证据目录；原有 15 项测试保留 |
| `package.json` | 数据库本地运行、集成验收和扫描命令；未新增依赖 |
| `.env.example`、`.env.postgres.example` | PostgreSQL 示例及独立原件目录说明，无真实密码 |
| `README.md`、`docs/LOCAL_DEVELOPMENT.md`、`docs/POSTGRESQL_LOCAL.md` | 当前状态、首次 generate、启停与安全切换说明 |
| `plans/00-5-postgresql.md`、`tests/ACCEPTANCE.md`、`docs/CHANGELOG_IMPLEMENTATION.md` | 本阶段计划、INF-001 至 INF-005 验收与实施日志 |
| 本报告、`docs/evidence/phase00-5/` | 可复核的命令日志及实际 PostgreSQL/HTTP 结果 |

`AGENTS.md`、产品需求、现有 UI、SQLite 仓储和 Prisma Schema/迁移没有改动。

## 6. 遗留问题、风险和下一阶段条件

- Docker daemon 仍未可用，但已通过独立原生 PostgreSQL 完成本地真实集成，不阻碍本阶段验收。
- PostgreSQL 17.6 固定用于本次复现；部署前须更新到所选受支持分支的安全补丁并重跑测试。当前只完成本机单用户集成，没有生产部署、远程认证或备份恢复演练。
- 测试数据库、下载包、原件及随机凭据保留在忽略目录，占用本机空间，未自动清理。不要将该测试 cluster 用于生产或其他长期任务；集成测试会重启它。
- 尚无 SQLite 批量数据导入工具。本次没有丢弃用户数据，也不宣称真实用户项目已搬迁到 PostgreSQL。
- Git 只保存了用户要求的 Phase 00 基线；Phase 00.5 后续修改待审核，未追加提交和推送。

结论：Git 基线、真实 PostgreSQL 迁移及持久化、版本冲突、上传保护、兼容与回归门禁已具备。**工程上满足进入 Phase 01 的前置条件；是否进入仍由用户确认，当前停止在 Phase 00.5。**
