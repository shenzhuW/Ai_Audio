# 本地开发与验证 · Phase 00 / 00.5 / 01

## 运行

要求 Node.js >= 22.13，推荐与本次验证一致的 Node 24；pnpm 10.34.4。仓库目录是 `AI_Code_Video_Studio_Codex_BAE6A58CE5AB8EE58B`，不是它的父目录。

```powershell
pnpm install
pnpm db:generate
pnpm dev
```

访问 `http://127.0.0.1:3000/projects/new` 或 `/projects`。普通本机开发不必创建环境文件。需要调整限额时，将根目录 `.env.example` 复制为 `apps/web/.env.local`。

- `STUDIO_MAX_DURATION_SECONDS=3600`：运行资源限额；页面会显示，API 超限返回 429。不是固定 90 秒产品限制。
- `STUDIO_MAX_UPLOAD_MB=10`：创建项目时文件总额限制；最多 5 个初始附件，支持 UTF-8 TXT/MD、PDF、PNG、JPEG。服务端校验扩展名、文本编码或文件签名；原件只作为附件下载，不嵌入执行。音视频上传和分析属于后续阶段。
- `STUDIO_DATA_DIR=.data`：相对于 `apps/web`；保存 `studio.db`、WAL、原始文件 `blobs/` 和会话密钥 `session-key`。备份前停止应用，完整备份目录；不要只复制运行中的主 DB 文件。
- `DATABASE_URL`：不配置时使用真实 SQLite 文件数据库；以 `postgres` 开头时切换 Prisma 仓储，连接失败不默默回退到 SQLite。

`pnpm dev` 使用 Next.js 官方 custom-server API，仍支持 App Router、Route Handlers 和开发热更新。使用该入口是为了避开此机器的 CLI 子进程监督器限制；Next.js 升级时要重新验证。仅监听 127.0.0.1。未实现公网认证或生产部署。

工作台链接显式设定 `prefetch={false}`，保留客户端导航。该设置避免本次在 Next 15 生产构建中观察到的部分预取/导航异常；升级框架后再用真实点击验收评估是否恢复预取，详见交付记录。

Phase 01 已接通研究/文稿页的保存、审核、历史和后台任务，总览显示真实状态。另开终端用相同数据库及数据目录执行 `pnpm worker`；未启动时任务保持可查询 queued，不在 HTTP 请求里生成。Mock 文本有明确标签；真实音频/视频不在本阶段实现。详见 [工作流说明](WORKFLOW_IMPLEMENTATION.md)。创建成功使用浏览器完整导航打开永久项目地址，避免当前 Next 15 客户端导航偶发停留；项目 CRUD 契约没有改变。

## 项目数据与路由

创建成功后进入 `/projects/<UUID>`，其他路径追加 `research`、`script`、`voice`、`storyboard`、`assets`、`motion`、`review`、`export`。`/projects` 是真实项目列表；`/demo/overview` 及对应 Demo 子页仅读取夹具，不写入真实数据库。

Project 与 ProjectInput 在 Phase 00 以带 `schemaVersion: 1` 的 Zod 校验聚合 JSON 保存，索引列含 UUID、owner、version、更新时间。SQLite 首次启动建表并记录 migration 1，重复启动不会清空数据。设置 PATCH 以版本条件原子更新，冲突 409；当前只允许编辑标题、风格、受众与预算。需求原文和初始附件不通过这个接口覆写。

## 认证与 API

打开本机页面时签发 12 小时 HMAC 会话，Cookie 为 HttpOnly、SameSite=Strict；HTTPS 时附 Secure。API 自身重复检查会话和 Host，写请求还校验 Origin。浏览器失效后重新打开工作台即可恢复会话；外部 Host、跨站请求和匿名 API 会被拒绝。该模式依赖服务器只监听 loopback，不是多用户登录。

- `POST /api/v1/projects`：JSON brief 或 multipart（`brief` JSON 字符串，零到五个 `files`）；201。
- `GET /api/v1/projects`、`GET /api/v1/projects/:id`：持久数据，统一 data/meta 包装。
- `PATCH /api/v1/projects/:id`：必须 expectedVersion；冲突 409。
- `GET /api/v1/projects/:id/uploads/:blobId`：已鉴权原件下载，校验文件属于当前项目，强制 attachment。
- UI 从上传起点创建时要求选择文件；API 也允许先创建无附件的 upload 需求草稿，后续附件增补接口尚未实现，不代表已经上传。

创建和上传失败有错误包装与 requestId。上传中途失败删除本次已经写入的原件；进程崩溃的孤儿文件回收、病毒扫描、上传任务会话留后续阶段。不要把此入口用于大规模媒体摄取。

## 测试

```powershell
pnpm typecheck
pnpm test
# 独立终端：用隔离的数据目录启动验收实例
$env:PORT='3001'
$env:STUDIO_DATA_DIR='../../.cache/acceptance-data'
pnpm dev
# 另一终端运行（默认 URL 是 http://127.0.0.1:3001）
pnpm test:http
pnpm --filter @studio/web exec playwright install chromium
pnpm test:e2e
```

`test:http` 会创建带“验收”前缀的真实项目，不清空数据库。结果写入 `docs/evidence/http-results.json`。`test:e2e` 检查创建、错误提示、保存、刷新、十路由以及 390/768px 宽度，并将真实截图写入 `docs/evidence/screenshots/`。本次已在生产实例端口 3002 上执行 HTTP 和浏览器验收，截图为实际页面。

可通过 `STUDIO_TEST_URL` 修改测试 URL。`PLAYWRIGHT_FROM` 可指定已有 Playwright 模块绝对路径，`STUDIO_CHROMIUM_PATH` 可指定浏览器可执行文件；这只复用已安装工具，不改变浏览器权限。单元测试使用 TypeScript 的进程内转译加载器，避免该环境的 esbuild/Node 子进程限制；类型正确性由独立 `tsc --noEmit` 检查。

## PostgreSQL / Prisma

schema 和 SQL migration 位于 `apps/web/prisma/`。在能够安装 Prisma 平台引擎且已有 PostgreSQL 的环境中：

Phase 01 新增 `0002_workflow`，不改写 `0001_project`。本次只对新测试库验证升级；真实数据库应用迁移前应按现有备份/审核流程操作，不自动导入用户数据。SQLite 增量添加独立 workflow 表，原项目 JSON、原件和会话保持原状。

```powershell
# 先设置 DATABASE_URL（不要把真实密码写入仓库）
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Prisma CLI 从 `apps/web/.env` 或进程环境读取 DATABASE_URL；Next 从 `.env.local` 读取。建议在终端环境变量中统一设置。当前使用 PostgreSQL JSONB 聚合，SQLite 文件不会自动转换为 PostgreSQL。Phase 00.5 已验证同仓储文档兼容性、既有迁移和真实 PostgreSQL CRUD；未自动导入用户数据。独立测试库、启动停止命令及安全过渡方案见 [POSTGRESQL_LOCAL.md](POSTGRESQL_LOCAL.md)。本阶段没有执行破坏性迁移。

## 本次环境与验证记录

### Phase 04 结构化口播文稿

第 04 页支持导入已有文稿（不要求研究），或从当前有效批准研究建立草稿。已有旧文本修订仍可查看；未结构化草稿可显式转换，批准/驳回版本先 fork 再转换。正文按段编辑、增删/上下移动，段落 ID 保持稳定；purpose、观众收获和画面意图用于后续叙事，不自动等同镜头。

```powershell
pnpm db:generate
# PostgreSQL 只在已备份、明确配置目标库后执行，增量为 0004；不对用户库自动运行
pnpm db:migrate
pnpm dev
# 另一终端同样 DATABASE_URL / STUDIO_DATA_DIR
pnpm worker
```

Workflow Worker 继续处理旧文本任务，并消费新的结构化文稿任务；本轮没有真实 Script 模型配置。页面显式选择 Mock 才能演示整体/局部改写；“真实模型 · 未配置”只生成明确失败任务，不返回假 AI 内容。不需要增加或分享 API Key 即可测试用户编辑、引用、版本和 Mock 流程；以后通过 `ScriptProvider` 接入真实模型。

估时为中文汉字+其他语言词数，单位/分钟可调 60–600（中文默认 240），另加 slow/brisk 因子及停顿。它不等于真实音频时长。保存最多 300 段、每段 10000 字符、总正文 50000 字符；接口请求上限 300000 bytes。上游研究替换时会显示绑定段落和旧依据；显式 fork 至新研究后需重新绑定，不能悄悄沿用旧 Claim ID。

```powershell
pnpm build
$env:STUDIO_UI_BROWSER_PATH='C:/path/to/h264-capable-chrome.exe'
pnpm test:script
# 专用 PostgreSQL 测试集群启动后
node tests/script/run.cjs --postgres
```

自动验收使用端口 3010、`.cache/phase04/<runId>`，PG 只新建 `studio_phase04_*`。不会使用/迁移用户数据库。Phase 02/03 回归可设置 `STUDIO_TEST_PHASE_EVIDENCE_ROOT` 指向新的绝对证据目录，保留旧材料；修改迁移数量断言后仍验证每条迁移唯一且对照当前 schema。[样例操作](../fixtures/script/README.md)、[交付报告](PHASE_04_DELIVERY.md)。

### Phase 03 研究资料运行说明

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
# 使用 PostgreSQL 时，明确配置 DATABASE_URL 后再按审核/备份流程应用增量迁移
pnpm db:migrate
pnpm dev
# 另一终端，从仓库根目录，使用与 Web 相同的 DATABASE_URL / STUDIO_DATA_DIR
pnpm research:worker
```

无 DATABASE_URL 时仍使用真实 SQLite，启动时只增量建立研究表和保护触发器。Worker 从 apps/web 解析默认 `.data`；自定义数据目录建议用绝对路径。Worker 不自动读取 Next 的 `.env.local`，需在终端显式配置相同环境。不要直接将真实用户库用于验收。

需要 Node >=22.13、FFmpeg/FFprobe（本机实际 4.3.1）；PDF.js 精确版本 6.4.299 随 pnpm 依赖安装，字体数据本地读取。可设置 STUDIO_FFMPEG_PATH / STUDIO_FFPROBE_PATH。上传默认 10MB，通过 STUDIO_MAX_UPLOAD_MB 调整；STUDIO_RESEARCH_MAX_VIDEO_SECONDS 默认 120（1–600），STUDIO_RESEARCH_MAX_PDF_PAGES 默认 50（1–100）。PDF 单页最多 100000 字符、每文件总文本 300000 字符，截断会标明。任务 120 秒超时；这些是分析预算，不是项目目标时长限制。

视频播放需要支持 H.264 的浏览器；本机浏览器验收使用已安装 Google Chrome。UI 只显示真实元数据、文本、时间索引；OCR、视觉语义与 ASR 未配置，不能用分析成功冒充事实核验。已分析快照保留，失败任务可按原输入重试；需要替换成功分析时，可在新修订添加新来源并排除旧来源。

```powershell
pnpm build
$env:STUDIO_UI_BROWSER_PATH='C:/path/to/h264-capable-chrome.exe'
pnpm test:research
# 按 POSTGRESQL_LOCAL.md 启动专用的 127.0.0.1:55432 测试集群后
node tests/research/run.cjs --postgres
```

验收使用 3008 端口、`.cache/phase03/<runId>` 和新建 `studio_phase03_*` 数据库。PostgreSQL 流程先部署旧两项迁移并保存测试项目，再增量升级 0003、重复部署、对照 schema；不 reset/drop 或导入现有用户库。[样例及手工流程](../fixtures/research/README.md)、[交付报告](PHASE_03_DELIVERY.md)。

### Phase 02 真实渲染

安装依赖后，`apps/render/public/` 已包含自制测试片和附许可证的本地字体；需要重建测试片可执行 `pnpm render:fixtures`（需要 ffmpeg，保留已有文件）。启动 Web 和 Render Worker 的终端需使用一致的 `DATABASE_URL` 与 `STUDIO_DATA_DIR`；Worker 不读取 Next 的 `.env.local`，请显式传入进程环境。默认 Web 数据目录从 `apps/web` 解析为 `.data`。

```powershell
# 已有 pnpm dev 的另一终端，从仓库根目录运行
$env:STUDIO_TRUSTED_LOCAL_RENDER='1'
$env:STUDIO_CHROMIUM_PATH='C:/path/to/chrome.exe' # 实际 Chrome/Chromium 路径
# ffprobe 不在 PATH 时：$env:STUDIO_FFPROBE_PATH='C:/path/to/ffprobe.exe'
pnpm render:worker
# 打开任意真实项目的 /projects/:id/motion，点击“渲染 10 秒示例”
```

当前仅接受仓库内固定可信组件，本机子进程没有 OS 文件/网络沙箱，禁止改成任意 TSX。每个 Worker 串行，600 秒超时；取消/重试和产物保留在原 Job。网页预览使用实际 MP4，需要 H.264 解码能力；无解码器时显示错误并保留下载。

自动验收使用独立数据和端口 3006，不要让其他应用占用。`STUDIO_UI_BROWSER_PATH` 用于实际播放测试，可与渲染浏览器不同；本机 Playwright Chromium 无 H.264 解码器，使用已安装 Chrome 进行播放测试。

```powershell
$env:STUDIO_UI_BROWSER_PATH='C:/path/to/h264-capable-chrome.exe'
pnpm test:render
# 先按 POSTGRESQL_LOCAL.md 启动专用测试集群，再运行
node tests/render/run.cjs --postgres --quick
```

结果/视频/截图见 [Phase 02 交付](PHASE_02_DELIVERY.md)。PostgreSQL 测试只新建专用测试库，不迁移已有用户数据。整个数据目录不可放入 Git。

- 初期外网 npm 被限制，从已有 npm 缓存安装运行依赖；权限调整后执行冻结锁文件安装成功。锁文件没有 localhost registry 或本机路径。
- `pnpm` 未全局安装，本次从缓存解出到忽略目录 `.tools/`。在当前工作区可执行 `$env:Path=(Join-Path $PWD '.tools/bin')+';'+$env:Path` 后运行标准 `pnpm` 命令。这个临时缓存不作为可分发依赖，其他机器正常安装 pnpm。
- Playwright 1.55.0 和 Prettier 已通过锁文件安装；浏览器验收使用本机 Chromium 1187。浏览器进程最初受到 EPERM 阻断，在获准的沙箱外执行后成功。
- `pnpm build` 已完整通过编译、类型检查、页面数据采集、静态生成与构建跟踪。开发服务器和生产服务器均实际启动；最终 HTTP / 浏览器证据来自生产实例。
- `prisma generate` 和 `prisma validate` 已通过。Phase 00 时 PostgreSQL 未运行；Phase 00.5 使用独立 PostgreSQL 17.6 在 55432 端口完成实际迁移、CRUD、冲突、上传下载和重启测试；应用验收端口 3003，结果保存在 `docs/evidence/phase00-5/`。
- 普通开发使用 3000；验收专用生产实例使用 3002 和 `.cache/acceptance-data`，与默认工作数据隔离。运行生产实例：`$env:PORT='3002'; $env:STUDIO_DATA_DIR='../../.cache/acceptance-data'; pnpm start`（从项目根目录）。
