# PostgreSQL 本地集成与 SQLite 安全过渡

Phase 00.5 使用 PostgreSQL 17.6 / Prisma 6.19.3。应用、UI、Project JSON 协议及 `0001_project` 迁移保持原有边界；不包含 Phase 01 功能。SQLite 默认模式仍可使用。

## 独立测试环境

Windows / PowerShell 7 / Node 24。Docker Desktop 未能提供 daemon，所以本次使用 PostgreSQL 官网链接的 [EDB 二进制包](https://www.enterprisedb.com/download-postgresql-binaries)，没有安装系统服务。

- 下载源：`https://get.enterprisedb.com/postgresql/postgresql-17.6-2-windows-x64-binaries.zip`。
- 包 SHA256：`46128E93245CAB5FD18BEB13E10A43AD8B31ACF9BEF1790A811BD59F1B721A58`，用于记录本次下载内容，不声称是发布方签名验证。
- 本机二进制：`.tools/postgresql-17.6/pgsql/bin`；也可用 `STUDIO_POSTGRES_BIN` 指向已安装的同版本工具目录。测试运行器固定检查 17.6，升级时同步调整并重新验收。
- 专用 cluster：`.cache/postgres-phase005/cluster`；仅监听 `127.0.0.1:55432`，SCRAM-SHA-256 认证。
- 随机密码位于被忽略的 `.cache/postgres-phase005/connection.json`；不要打印、提交或分享该文件。工具只在 cluster 不存在时初始化，遇到不完整旧目录会停止，不覆盖旧数据。
- 每次测试创建 `studio_phase005_<run>` 和 `_fresh` 两个新数据库；应用角色 `studio_app` 非超级用户、无创建数据库权限。管理员只用于测试环境初始化。
- 原件/会话/log 位于 `.cache/phase005-runs/<run>`，与默认 `.data` 及旧 `.cache/acceptance-data` 分开。数据库和原件不会在测试结束时删除。

在项目根目录执行：

```powershell
# 当前机器没有全局 pnpm 时
$env:Path=(Join-Path $PWD '.tools/bin')+';'+$env:Path
# 如果当前 PowerShell 7 不在 PATH，将当前终端的可执行目录加入 PATH
$env:Path=(Split-Path (Get-Process -Id $PID).Path)+';'+$env:Path
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:local init
pnpm db:local start
pnpm build
pnpm test:postgres
pnpm db:local status
# 使用完毕停止进程，保留全部测试数据
pnpm db:local stop
```

`test:postgres` 需要空闲应用端口 3003，并会重启专用 PostgreSQL cluster；仅在该 cluster 没有其他用途时运行。所有测试名均要求 `studio_phase005_` 前缀；不接受任意生产 DATABASE_URL，不执行 DROP、reset 或迁移历史改写。结果在 `docs/evidence/phase00-5/`，非敏感进度和最终状态会落盘。

查看本次测试项目时，可从 `postgres-results.json` 的 database 字段取得 `<run>`，在应用终端加载该次运行的忽略环境文件（只设置环境，不输出密码）：

```powershell
# 将 <run> 替换为结果中的后缀
Get-Content '.cache/phase005-runs/<run>/.env.postgres' | ForEach-Object {
  $pair=$_.Split('=',2)
  [Environment]::SetEnvironmentVariable($pair[0],$pair[1],'Process')
}
pnpm dev
```

测试使用生产构建和同一 HTTP 套件。只有从 PostgreSQL 实际查询版本、表行并与 HTTP 返回完整 JSON 比对后，才标记 PostgreSQL 验收通过。SQLite 测试另行标识，不能替代此结果。

## 普通开发数据库

由数据库管理员创建独立数据库和有表 DDL 权限的项目所有者。参考根目录 `.env.postgres.example`；密码用实际本地秘密替换，但不要提交真实环境文件。通过进程变量设置 DATABASE_URL 可同时供 Prisma CLI 和 Next 使用；Next 也读取 `apps/web/.env.local`，Prisma 6 CLI 读取 `apps/web/.env`，两者不是同一个环境文件。

```powershell
pnpm db:generate
pnpm db:migrate
pnpm dev
```

首次安装后先 generate 再 typecheck/build；适配器现在使用生成的 Prisma 类型。`db:migrate` 是 `prisma migrate deploy`，重复执行只应用未执行的迁移。部署命令本身不检测 schema 漂移，因此验收另运行 `migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code` 并要求退出 0。参见 [Prisma CLI](https://www.prisma.io/docs/orm/reference/prisma-cli-reference)。不要用 `db push` 或 `migrate reset` 代替已有迁移。

## 已有 SQLite 数据的安全过渡方案

本次没有自动迁移真实用户数据，没有修改默认数据库指向。验证范围是两个仓储对相同九份项目文档的精确往返一致性；不是既有用户数据迁移成功的声明。

1. 停止应用写入。将整个 SQLite 数据目录及原件复制到新的带时间戳备份目录；保留 DB、WAL/SHM（如存在）、blobs 和会话文件。记录文件大小/散列。不能只复制正在写入的主 DB 文件。
2. 创建全新的空 PostgreSQL 库和新的原件目录，应用既有迁移；确认目标项目表为空、目标原件目录为空。保持旧 SQLite 与原件只读。
3. 后续导入工具应以只读连接打开 SQLite，经 ProjectSchema 逐条校验；在一个 PostgreSQL 事务中写入原 UUID、ownerId、version、updatedAt 与完整 JSON。遇到重复 UUID 或验证失败立即终止，不 upsert、不重编号、不覆盖数据。当前未提供批量导入工具。
4. 原件按原附件 UUID 复制至新 blobs 目录，比较大小与 SHA256；数据库附件路径不可指向缺失文件。复制阶段出现失败时丢弃本次目标运行的资格，保留源数据和错误记录。
5. 比较数量、排序键、每个完整 JSON、附件散列及受保护下载。核对通过并审核迁移报告后，才将应用 DATABASE_URL 与 STUDIO_DATA_DIR 一起切换；禁止自动双写。
6. 试运行期间冻结旧目录。若新库尚无新增写入，可恢复原环境配置回到 SQLite；若已有新写入，先停止写入并备份 PostgreSQL/新原件，人工核对增量后再回退，不能直接切回造成新数据丢失。

保留当前 ISO UTC 字符串、JSON schemaVersion=1 及 UUID 约定。后续如果要规范化 ProjectInput/产物表，应追加迁移并另行评审，不重写 `0001_project`。测试用 17.6 为固定复现版本；正式部署需选择维护版本最新安全补丁并重新验证。
