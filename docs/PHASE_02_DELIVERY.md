# Phase 02 · 真实 Remotion MP4 技术闭环

2026-10-23：本阶段实现完成，等待用户验收；未进入 Phase 03。基线为已审核代码 `70d4ddf06d3ce306b7f30cd3c78e4de3b6251638` 和材料 `bdb1a56254e9903f557ce4017c0039951d73d57c`。本阶段本地提交的完整 Hash 随交付回复提供；不推送远程。

## 实际交付与验收

- [真实 MP4](evidence/phase02/sqlite/video.mp4)，不是截图动画；背景也是 FFmpeg 自行生成的动态几何 MP4，叠加可信 React 文字动画、SVG 柱图、三段烧录字幕。图表明确标示合成示例数值，无事实主张。
- [FFprobe 原始输出](evidence/phase02/sqlite/ffprobe-independent.json)：10 秒、1080×1920、9:16、30 FPS、300 帧、H.264、yuv420p。无音频轨，使用 `none` 无口播分支；不宣称接通 TTS。
- [帧 60](evidence/phase02/sqlite/frame-060.png)、[帧 150](evidence/phase02/sqlite/frame-150.png)、[帧 240](evidence/phase02/sqlite/frame-240.png)。每帧独立渲染两次，严格比较 PNG SHA256，3/3 相同，三个不同时间点的帧也互不相同。
- [冻结输入与时间轴](evidence/phase02/sqlite/manifest.json)：固定 SceneSpec、Props、素材散列、组件代码散列、Remotion 版本；预览直接播放最终 MP4。抽取实际 MP4 的帧 150 与 Remotion still 对照，PSNR 38.133935 dB（有损 H.264，门禁 >30 dB）。最新 SQLite manifest 另记录浏览器二进制 SHA 和图形配置。[跨独立运行校验](evidence/phase02/cross-run.json)确认 SQLite/PostgreSQL 相同冻结输入的三张 PNG 字节也全部相同；结构化比较不依赖 JSONB 字段顺序。
- 第 08 页真实截图：[排队](evidence/phase02/sqlite/08-queued.png)、[运行](evidence/phase02/sqlite/08-running.png)、[成功播放](evidence/phase02/sqlite/08-success.png)、[失败日志](evidence/phase02/sqlite/08-failed.png)、[390px](evidence/phase02/sqlite/08-mobile.png)、[实际缺少 H.264 解码器提示](evidence/phase02/sqlite/08-codec-warning.png)。兼容浏览器实际播放超过 5 秒、刷新恢复，无页面异常或横向溢出；不兼容浏览器有真实错误提示及下载入口。
- [SQLite 最终媒体回归](evidence/phase02/sqlite/results.json)、[SQLite 完整异常流程](evidence/phase02/sqlite/full-results.json) 和 [真实 PostgreSQL 集成结果](evidence/phase02/postgresql/results.json) 均 PASS。PostgreSQL 17.6 使用独立新建测试库，直接读取 Job 行核对 HTTP/Worker 结果；应用角色不是超级用户、无建库权限。未迁移真实用户数据。

`plans/02-remotion-poc.md` 的三个交付标准均有实际证据：真实 MP4/FFprobe、UI08 播放及失败日志、重复关键帧和自动化媒体测试。此结论限于受信任预置场景与本机测试配置，不代表后续自由代码沙箱通过。

## 实现与边界

- `apps/render/`：独立 Remotion 包，精确统一 4.0.538；固定 Composition `PocVertical`，`useCurrentFrame` 驱动动画，字体本地加载。素材来源、字体 OFL 和生成配方见 [ASSET_LICENSES](../apps/render/ASSET_LICENSES.md)。
- `scripts/render-worker.cjs`：复用原 Workflow/Job/Outbox。每次尝试随机租约执行者、30 秒租约、2 秒心跳；600 秒任务超时，取消后封锁迟到结果；异常只影响当前 Job，可重试，保留每次尝试。心跳不增加业务版本，避免取消遭遇遥测导致的冲突。每个 Worker 串行，Remotion 帧并发 2，Node 堆上限 1024 MB；不声称限制整个浏览器进程树内存。
- `scripts/render-child.cjs`：只启动固定仓库入口，校验输入和本地素材散列；独立工作目录，不覆盖原件。环境变量白名单去除 DB、Provider、会话、Token、代理、NODE_OPTIONS 等；API 不执行 TSX。运行时使用新 headless 与 `swangle`。子进程退出监听在首次异步心跳前注册，防止快速失败漏收。
- Docker daemon 当前不可连接，**OS 级文件/网络沙箱未验证**。可信子进程仍与本机用户共享文件权限；必须显式 `STUDIO_TRUSTED_LOCAL_RENDER=1`，任意 TSX/远程入口/代码上传保持拒绝。不把环境变量过滤冒充完整安全沙箱。未来自由代码执行须另行验证容器隔离。
- `POST /api/v1/projects/:id/render-runs`：只接受 `presetId=poc-v1` 与声明的字号 52–92，要求幂等键；返回真实 202/jobId。项目自定义时长不改写，PoC 的 10 秒有明确提示。
- 下载接口绑定当前用户、项目和成功 Job；固定六种产物、SHA/大小核对，支持 GET/HEAD 和单段 Range。匿名 401、非法文件 400、未完成 409、无效 Range 416。没有自动公开发布。
- 字号调整冻结新输入，保留旧产物及时间轴；UI 轮询真实任务，支持取消/重试。没有同源自由编译器或虚假进度。
- 只追加兼容的可选 Job JSON 字段，无 Prisma schema 或 SQL migration 修改；SQLite/PostgreSQL 旧 CRUD、上传和 Phase 01 工作流回归均通过。原默认数据及旧验收数据目录前后散列完全一致。

## 实际命令与结果

环境为 Node 24.15.0、pnpm 10.34.4、Windows；测试浏览器使用显式可执行文件路径，无额外提升权限。

```powershell
$env:Path=(Join-Path $PWD '.tools/bin')+';'+$env:Path # 本机工具未全局安装时
$env:CI='true'
pnpm install --no-frozen-lockfile
pnpm db:generate
pnpm render:fixtures
pnpm typecheck
pnpm render:typecheck
pnpm test
pnpm build
# 测试用实际路径；其他机器请替换
$env:STUDIO_CHROMIUM_PATH='C:/Users/WZS/AppData/Local/ms-playwright/chromium-1187/chrome-win/chrome.exe'
$env:STUDIO_UI_BROWSER_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
node tests/render/run.cjs
node tests/render/run.cjs --postgres --quick
node tests/render/run.cjs --quick # 仅补充运行时 manifest 的非视觉改动后复跑
node tests/render/codec-warning.cjs --saved-sqlite
node tests/render/compare-evidence.cjs
node scripts/audit-staged.cjs --worktree
git diff --check
```

类型检查与 Render 类型检查通过；17 单元测试全部通过；生产构建通过。完整日志：[类型](evidence/phase02/typecheck.log)、[Render 类型](evidence/phase02/render-typecheck.log)、[单元](evidence/phase02/unit-tests.log)、[构建](evidence/phase02/build.log)。集成测试会启动专用 3006 端口的生产实例和实际 Worker，创建独立数据目录/测试数据库，不清空现有数据。

SQLite 完整测试还覆盖真实缺少 Chromium 的失败、日志出现在 UI、同输入 attempt 2 成功、运行中取消、无迟到产物以及应用重启恢复。PostgreSQL `--quick` 实际渲染并重复迁移、执行 15 项原 HTTP 验收和 8 组 Phase 01 工作流验收；失败重试/运行取消的子进程场景只在 SQLite 完整流程执行，不冒充 PostgreSQL 已重复执行。

独立 FFprobe 命令由集成脚本实际执行：

```powershell
ffprobe -v error -show_streams -show_format -of json docs/evidence/phase02/sqlite/video.mp4
```

测试 ffprobe/ffmpeg 4.3.1。渲染使用 Remotion 自带媒体工具，不混称版本。

## 发现的失败与处理

| 实际失败 | 处理和验证 |
|---|---|
| 首次无 TTY 的 pnpm 安装失败；重装后 Prisma client 缺失 | CI 模式安装并重新 generate；最终类型检查/构建通过 |
| SceneSpec 联合类型与心跳递增 Job.version 导致单元测试失败 | 修正运行时联合类型；遥测只更新心跳/日志/租约，最终 17/17 通过 |
| 第一次 Worker 因 Chromium 移除旧 headless 启动失败 | 统一新 headless；错误持久化，后续真实渲染通过 |
| 视频验收已过，但 Playwright Chromium 无 H.264 解码器，UI 等待失败 | 使用支持 H.264 的本机 Chrome 实际播放；添加播放错误提示及有界测试等待，不将此轮记为全通过 |
| 一轮 frame 240 重复 PNG 散列不一致 | 观察到全帧部分像素单通道差 1；诊断不同图形后端，显式固定 swangle 后 SQLite/PG 三帧严格一致。未放宽门禁，不推断任意硬件跨平台位级一致 |
| 初次无解码器提示测试超时 | 测试误选了最新取消任务，改为显式选择成功历史；不把该超时记为产品渲染失败 |

首轮诊断数据保留在忽略目录 `.cache/phase02/`；当前受版本管理的结果明确属于最终通过的独立测试运行，原始失败不伪装成通过。

## 修改文件与文档同步

核心新增：`apps/render/**`、`apps/web/src/domain/motion.ts`、`server/render/{preset,files}.ts`、两条 render API route、`components/render-panel.tsx`、三个 `scripts/render-*.cjs`、`tests/render/*.cjs` 和三个 `tests/unit/render*.test.ts`。

最小兼容修改：根/应用 package 与锁文件、Job 协议、Workflow engine/service、制作页/共享任务标签/壳层/CSS、环境示例。研究、API、开发说明、计划和验收矩阵同步；未重写项目 CRUD、审批模型或数据库迁移。[完整修改文件清单](evidence/phase02/CHANGED_FILES.txt)。提交前暂存区扫描 110 个文件，敏感信息零发现，Git whitespace 检查通过；数据库、原件、会话和凭据均未暂存。

本轮另按用户要求，仅在文档同步内部开发测试素材策略（D-17/D-18），完整清单与访问边界见 [策略更新](INTERNAL_TEST_POLICY_UPDATE.md)。许可未知/不可商用不作为内部 MP4 的商业门禁；保留来源及限制；不提前实现 Phase 07，不自动公开发布。

## 遗留问题与审核条件

- 任意代码的容器/网络/文件权限/整个进程树资源隔离 NOT RUN；当前只允许可信预置组件，不得用此 Worker 执行用户或 AI TSX。
- Remotion bundler 的 webpack 5.105.0 与传递 schema-utils peer 声明存在警告；实际打包与生产构建通过，未为消除警告擅自升级 Remotion。Remotion 商业使用主体/许可需正式发布时另核查，字体许可证已随仓库保存。
- 当前不含实时 Remotion Player；预览复用实际最终 MP4，需支持 H.264 的浏览器。没有 Research、Director、素材智能匹配、配音或自由 Code Agent 实现；后续验收项仍 NOT RUN。
- 不保证不同 GPU、Chrome、系统的 PNG 位级一致；冻结输入及运行时信息可定位，当前明确的软件后端通过严格重复帧门禁。
- 全局多 Worker 并发总额、自动磁盘回收、生产部署与不可信代码沙箱属于后续工作；测试产物和原始数据均保留。

本阶段交付后停止，等待用户审核；不自动进入 Phase 03，不推送仓库。
