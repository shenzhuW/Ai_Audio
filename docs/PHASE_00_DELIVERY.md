# Phase 00 交付记录 · 2026-10-22

状态：本地功能与阶段验收完成，等待审核；未进入 Phase 01。PostgreSQL 集成尚未验证，不能据此声称部署数据库已通过验收。

## 实现与数据边界

真实实现：项目创建、持久列表与详情、标题/风格/受众/预算保存、原子 expectedVersion 校验与 409；自定义秒或分秒、9:16/16:9、topic/script/upload 三起点、tts/import/none 配音偏好。上传原件保存 SHA256，校验格式/容量，鉴权下载。选择配音模式只保存意图，不产生音频。

十页路由：`/projects/new`、`/projects/:id`，以及项目下 `research`、`script`、`voice`、`storyboard`、`assets`、`motion`、`review`、`export`。另有 `/projects` 列表及 `/demo/:stage`。后八页保留对应原型的工作区结构，清楚标注未接通；创建不会发起后台 AI 任务。

设计系统从已有 HTML 提取色彩、边距、排版和卡片样式，采用 CSS Modules；桌面固定导航、移动端横向导航，公共表单、标签、错误与空状态。页面不是截图贴图。原型里的两张图片仅作创建页风格参考，不加入项目或渲染。

持久化：选择 Prisma 作为 PostgreSQL ORM，提供 schema、非破坏性初始建表 SQL 和仓储适配器。为独立运行增加真实 SQLite 文件仓储，默认 `apps/web/.data/`，两者共用服务接口。Project/ProjectInput 保存为 Zod 校验、schemaVersion=1 的聚合 JSON；UUID、owner、version、更新时间为索引列。已测试 SQLite 关闭重开及并发写入。配置 PostgreSQL 后失败不会静默回退。

ORM 取舍：Prisma 的 schema、迁移与客户端生成适合当前模块化服务，且初期受限网络下已有可用依赖缓存；没有为这一阶段同时引入 Drizzle 或额外数据库运行时。SQLite 是本机仓储适配器，不承担 PostgreSQL ORM 验证。

仅本机单用户模式：loopback 监听，HMAC HttpOnly 会话，Host/Origin 检查；不等于公网登录系统。后续接口包括 Research/Language/Voice/Asset Provider、MediaProcessor、JobQueue、RenderWorker。MockResearchProvider 返回显式 mock/unverified/research_only 数据；没有接通实际提供商。

## v1.3 同步与参考研究

用户列出的规范文件均存在并已阅读，原型仍保留。没有改动 DECISIONS、PRD 或扩大 MVP。Git 状态检查返回 `not a git repository`；没有初始化或提交仓库。此清单依据实际写入文件，不伪称 Git diff。

- 立即项：真实项目与 Demo 分离、授权凭证与未核实状态明确；已处理。新 AGENTS 对素材授权的表述与 DECISIONS 一致。
- 当前阶段项：布局、输入/上传校验、设置冲突、浏览器/API 验收与运行文档；已处理。数据库本地适配差异已公开记录。
- 后续项：不可变修订/审批事件/依赖/Job 与幂等（01），Remotion PoC（02），真实研究/时间轴/导演/素材/代码隔离/导出（03–09）；本次未实现。

Hypit 查阅 package/run 概览和 LICENSE，借鉴工程输入与运行结果的分离，未深入 DAG 实现。wallstreet-explainer 阅读 README、SKILL 前部和 LICENSE，借鉴叙事目标、词级锚点和模块边界，未运行工具。Remotion 阅读 AI 模板首页/生成接口和 current-frame 源码，确认输入校验与帧驱动设计，未引入渲染依赖。Hypit 修改版许可、Remotion 自动化许可及第三方视频素材授权需要分别处理。具体源码链接、版本可追溯限制与适配位置见 [REFERENCE_REVIEW_LOG.md](REFERENCE_REVIEW_LOG.md)。

## 修改/新增文件

| 文件 | 实现内容 |
|---|---|
| 根目录 `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`.gitignore`、`.prettierrc.json`、`.env.example` | workspace、锁定依赖、统一命令、环境配置与忽略规则 |
| `apps/web/package.json`、`tsconfig.json`、`next-env.d.ts`、`next.config.ts`、`dev.cjs` | Next/TS 构建与本机开发入口 |
| `apps/web/src/app/layout.tsx`、`globals.css`、`page.tsx`、`loading.tsx`、`error.tsx`、`not-found.tsx` | 全局页面壳层及错误边界 |
| `apps/web/src/app/projects/page.tsx`、`new/page.tsx`、`[projectId]/page.tsx`、`[projectId]/[stage]/page.tsx` | 项目列表、创建、总览及阶段路由 |
| `apps/web/src/app/demo/[stage]/page.tsx` | 隔离的模拟项目展示 |
| `apps/web/src/app/api/v1/projects/route.ts`、`[projectId]/route.ts`、`[projectId]/uploads/[blobId]/route.ts` | POST/GET/PATCH 与原件下载 |
| `apps/web/src/components/shell.tsx`、`ui.tsx`、`studio.module.css` | 导航、基础组件、设计 Tokens 与响应式样式 |
| `apps/web/src/components/project-form.tsx`、`project-list.tsx`、`project-editor.tsx`、`overview.tsx`、`stage-workspace.tsx` | 创建/搜索/编辑/详情与阶段空工作区 |
| `apps/web/src/domain/project.ts`、`navigation.ts`、`providers.ts` | Zod 协议、路由映射、后续模块接口 |
| `apps/web/src/middleware.ts`、`server/auth.ts`、`config.ts`、`http.ts`、`errors.ts`、`storage.ts` | 会话、限额、错误包装、文件存储与验证 |
| `apps/web/src/server/project/service.ts`、`repository.ts`、`postgres.ts`、`index.ts`、`page-data.ts` | 服务/仓储、并发控制和页面数据读取 |
| `apps/web/prisma/schema.prisma`、`migrations/0001_project/migration.sql`、`migrations/migration_lock.toml` | PostgreSQL schema 与尚未应用的迁移 |
| `apps/web/public/references/server.jpg`、`data_stream.jpg`；`fixtures/example-project.json` | 视觉参考及明确模拟的 GPU 示例 |
| `scripts/test.cjs`、`tests/unit/auth.test.ts`、`project.test.ts`、`upload.test.ts`、`tests/http/run.mjs`、`tests/browser/run.mjs` | 单元、实际 HTTP 与浏览器测试 |
| `README.md`、`docs/LOCAL_DEVELOPMENT.md`、`REFERENCE_REVIEW_LOG.md`、`CHANGELOG_IMPLEMENTATION.md`、本文件 | 运行、研究与交付记录 |
| `plans/00-foundation.md`、`tests/ACCEPTANCE.md`、`docs/evidence/` | 阶段进度与实际验收证据 |

`.tools/`、`.pnpm-store/`、`.cache/`、node_modules 和数据库均为忽略的本地运行文件。未删除原有文档或重新生成产品协议。

## 运行与实际验证

项目根目录执行（Node 24.15.0、pnpm 10.34.4；当前 pnpm wrapper 在 `.tools/bin`，可先加入 PATH）：

```powershell
$env:Path=(Join-Path $PWD '.tools/bin')+';'+$env:Path
pnpm install --frozen-lockfile
pnpm dev
# http://127.0.0.1:3000/projects/new
pnpm typecheck
pnpm test
pnpm build
```

| 实际执行 | 结果 |
|---|---|
| `node .tools/package/bin/pnpm.cjs install --frozen-lockfile --store-dir=.pnpm-store --offline=false` | PASS，依赖安装完成，锁文件未漂移 |
| `pnpm format` / `pnpm typecheck` | PASS，Prettier / tsc --noEmit |
| `pnpm test` | PASS，7 tests / 0 failed；真实 SQLite、版本竞争、校验、会话、上传 |
| `pnpm build` | PASS，编译/类型/静态生成/构建跟踪全部完成；[构建日志](evidence/build.log) |
| `pnpm dev` / Next production start | 实际启动；最终验收连接生产端口 3002 |
| `node ../../tests/http/run.mjs`（apps/web，STUDIO_TEST_URL=3002 URL） | PASS，15 项；[机器可读结果](evidence/http-results.json) |
| `node ../../tests/browser/run.mjs`（apps/web，相同 URL，STUDIO_CHROMIUM_PATH 指向本机 Chromium） | PASS，最终构建连续三轮通过；三起点、保存刷新、真实导航、390/768px，无 pageerror；[最后一轮结果](evidence/screenshots/result.json) |
| `prisma generate` / `prisma validate` | PASS；客户端 6.19.3 生成、schema 有效；validate 使用占位 URL，不连接数据库 |
| PostgreSQL migrate/CRUD、外部 Provider、媒体渲染 | NOT RUN；没有真实 MP4 或音频交付 |

验收服务数据目录为 `.cache/acceptance-data`，与默认 `.data` 分离。测试会留下带验收标题的真实记录，不自动删除用户数据。HTTP 测试使用真实文件并比较下载字节；浏览器上传 TXT 并刷新验证附件。流式 Next not-found 页可能返回 HTTP 200，浏览器显示 not-found/noindex；API 不存在资源返回 404。

早期受限进程返回 EPERM；获得权限后完成 build/浏览器/引擎生成。浏览器测试两处定位问题已修正后重跑通过。没有把这些早期失败记作成功，也没有将 Mock 渲染作真实结果。

最终补充的上传总量回归先复现了 `201 !== 413`，修复后 15 项 HTTP 检查全部通过，超限 1 字节不再创建项目。Next 对大于 10MB 的 middleware 克隆请求体发出警告；本实现 middleware 不读取正文，Route Handler 实际读取原始请求流并执行总量校验，已由这项边界测试验证。

生产浏览器验收曾在刷新后的首个导航上间歇超时。客户端标题等待未消除问题；诊断确认点击送达且目标 RSC 返回 200，页面仍停留在总览，没有 pageerror。参照 [Next.js 维护者记录的 15.x 预取问题](https://github.com/vercel/next.js/issues/77245) 和 [Link 文档](https://nextjs.org/docs/app/api-reference/components/link)，为工作台所有 Link 明确设置 `prefetch={false}`，避免动态工作区的自动部分预取；保留正常客户端导航。不能仅凭相似现象断言框架内部根因完全相同，但此修改后的生产构建已连续三轮通过原来的真实点击流程。测试保留失败诊断，并在交互失败时覆盖结果为 FAIL，防止保留上次 PASS。

## 截图

实际生成 14 张 PNG：桌面 01–10，以及 01/02 各 390px、768px。已人工查看桌面创建/总览/分镜和移动端总览。

- [01 创建 · 桌面](evidence/screenshots/01-create-desktop.png)
- [02 总览 · 桌面](evidence/screenshots/02-overview-desktop.png)
- [03 研究](evidence/screenshots/03-research.png)、[04 文稿](evidence/screenshots/04-script.png)、[05 配音](evidence/screenshots/05-voice.png)
- [06 分镜](evidence/screenshots/06-storyboard.png)、[07 资产](evidence/screenshots/07-assets.png)、[08 动画](evidence/screenshots/08-motion.png)、[09 审核](evidence/screenshots/09-review.png)、[10 导出](evidence/screenshots/10-export.png)
- [创建 390](evidence/screenshots/01-create-390.png)、[总览 390](evidence/screenshots/02-overview-390.png)、[创建 768](evidence/screenshots/01-create-768.png)、[总览 768](evidence/screenshots/02-overview-768.png)

## 遗留问题与下一阶段

1. PostgreSQL 服务未提供，迁移及 Prisma 仓储真实集成待验证；SQLite 转 PostgreSQL 尚无数据导入工具。部署架构没有更改为 SQLite。
2. 当前仅本机单用户工作台；未做公网部署或多用户认证。原件限 TXT/MD/PDF/PNG/JPEG；音视频上传分析、孤儿文件回收和媒体流水线在后续阶段完成。
3. API 允许无附件 upload 草稿，但 UI 的上传起点要求文件；暂未实现创建后的附件增补。设置保存只修改标题/风格/受众/预算，不覆写初始需求或附件。
4. 所有 AI/审批/配音/分镜/素材授权/渲染/导出仍未接通；保留接口不代表实现这些功能。
5. 参考仓库远程 main 没有可靠 commit SHA；记录已读范围与 wallstreet 本地文件散列，后续深入研究应固定版本复核。

建议用户审核本阶段后，先补 PostgreSQL 实际集成，再按 Phase 01 开发不可变修订、审核流、依赖失效及任务协议。当前已停止，不自行进入下一阶段。
