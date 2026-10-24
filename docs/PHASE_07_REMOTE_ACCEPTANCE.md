# Phase 07 最终远程验收

受检代码：`0240d6ef8a5e674598ff46758c4bca0f1e8fa9e3`。批准基线：`34d88410a1f1b1e0a92a4bae548871fcc9c7288f`。本次仅补充验收脚本、报告及证据；业务代码、迁移、Codex 安全运行时保持受检版本，不进入 Phase 08/09。

[本地交付报告](PHASE_07_DELIVERY.md) · [全部证据](evidence/phase07/README.md) · [本轮机器复核结果](evidence/phase07/remote/review.json) · [媒体公开提交审查](evidence/phase07/remote/media-publication-review.md)

## Git 与安全

- 开始时工作区干净，HEAD 与受检代码一致；代码父提交等于批准基线。fetch 后 origin/main 仍是批准基线，左右差异 `0 1`，可正常快进。
- 对代码提交的 **236 个 Git blob** 逐一读取，不依赖工作区或空暂存区；保存每项 Git blob ID、SHA256、字节数。没有发现密钥、JWT、Codex 认证、数据库、会话 Cookie、用户原件、模型权重或构建缓存。见[精确代码扫描](evidence/phase07/remote/code-security-audit.json)。
- 236 文件合计 34,627,111 字节（包含重复路径及文本），单文件最大 1,657,402 字节。12 组相同内容保留原证据路径，Git 复用相同 blob；不为去重重写已受检提交。
- MP4 和 GPU 视频是自制；NASA/Commons 仅低分辨率、注明出处的核验图。原 NASA 视频 24,938,123 字节、外部原图、数据库和认证文件不提交。逐文件媒体 SHA/分类见[媒体清单](evidence/phase07/remote/media-inventory.json)。
- 本轮在既有隔离测试目录/数据库上只读复核业务数据；新增破坏测试仅使用自制文件的新副本。原用户数据 SHA 前后均为 `7a677496c48a00a14538bc505faf99f1b0fbed6a47b678600a9d62facf470b54`。
- 材料使用独立提交；推送前再次 fetch/确认祖先关系及扫描暂存区，仅执行普通 `git push origin main`。不 force、amend、rebase 或迁移真实用户数据。远端提交 Hash 和推送后可达性由最终交付消息提供。

## 实际执行及结果

| 本轮新执行 | 结果与证据 |
|---|---|
| `pnpm test` | 76/76，0 失败；[unit.log](evidence/phase07/remote/logs/unit.log) |
| `pnpm typecheck` | 通过；[日志](evidence/phase07/remote/logs/typecheck.log) |
| `pnpm render:typecheck` | 通过；[日志](evidence/phase07/remote/logs/render-typecheck.log) |
| `pnpm build` | 生产构建通过；[日志](evidence/phase07/remote/logs/build.log) |
| `node tests/assets/remote-audit.cjs` | 精确代码提交 236 文件，无扫描命中 |
| `node tests/assets/remote-browser.cjs` / `--postgres` | 每库 3 组，只读 API、真实 Chrome H.264 播放/7 秒定位、应用停止重启、Range206、历史/状态一致 |
| `node tests/assets/remote-media.cjs` | 14 组真实 FFmpeg/文件故障/成片像素检查通过；其中 404/中断为明确标记的传输故障注入 |
| `node tests/assets/remote-review.cjs` | 双库真实 AI 审计/结构/来源/区间/绑定/12 份产物 SHA 与旧结果逐项断言通过 |

[SQLite 本轮浏览器](evidence/phase07/remote/sqlite/browser-review.json)、[PostgreSQL 本轮浏览器](evidence/phase07/remote/postgresql/browser-review.json)和各自 app.log 保存两次实际启动。启动独立 PostgreSQL17.6 使用 `pwsh -NoProfile -File scripts/postgres-local.ps1 start`；只连接已有 `studio_phase07_*` 合成测试库，不读取或公开密码。应用只发送 GET/HEAD，浏览器拦截其他业务请求。

**复核既有实际运行记录，不冒充本轮完整重跑：** SQLite19组、PostgreSQL21组均PASS，各含1条原实际渲染任务续跑来源说明；旧阶段 SQLite65组PASS（研究15、文稿9、配音12、导演16、真实04.5九组、Claim边界4组）。原真实模型调用、本地/外部搜索及渲染没有为整理材料再次执行。旧阶段不是本轮全量 PostgreSQL 回归。

迁移材料：[0007 增量/重复部署](evidence/phase07/postgresql/migrations.log)、[Prisma 零漂移](evidence/phase07/postgresql/schema-drift.log)。本轮没有新增或修改迁移。原类型/构建/回归日志仍保留；首次 ROI 检查选择纯色区域导致 Pearson 分母为零，失败日志见[diagnostics](evidence/phase07/remote/diagnostics/first-media-roi.log)，更换为有网格线的无覆盖区域后通过，未改变产品代码或降低统计门槛。

## 十二项重点复核

| 项目 | 实际结论 / 证据 |
|---|---|
| 1 固定导演/镜头/意图 | 两库真实 Job 的 inputRevisionIds、assetInput.directorRevisionId 和 shot.visualSearchIntent 与批准 Director/shot 一致，机器复核通过 |
| 2 真实外部检索 | 两库 NASA Images API 的 URL、实际时间、响应 SHA、6 条结果和下载来源可追溯；[SQLite 搜索/视觉 Job](evidence/phase07/sqlite/external-search-match.json)。另有[Commons 图片与 NASA 视频探测](evidence/phase07/providers/results.json)。Pexels/Pixabay 未配置 |
| 3 本地文件 | 自制源视频 SHA `a7ee5f61500c66dae48f4d33f185a1f3b647a383472d452f613738f5b88c53ce`；真实 H.264/640×360/30FPS/12秒；[索引](evidence/phase07/sqlite/local-index.json) |
| 4 抽帧/联系表/视觉 | 实际解码 PTS 0/2400/4767/7167/9533/11900ms，真实图片输入 Codex；[本地模型 Job](evidence/phase07/sqlite/local-visual-match.json)、[联系表](evidence/phase07/sqlite/local-contact-sheet.jpg) |
| 5 评分与审计 | 候选 method=real_visual，逐项分数、理由、帧ID/SHA与模型runId对应。本地SQLite总分0.7387255992、PG0.7260255992；模型审计是 gpt-6.1-sol、Codex CLI0.163.0。元数据初筛和 Provider 探测不冒充视觉判断；以原候选 JSON 的完整数值为准 |
| 6 同源两段 | [0,6000) 与 [6000,12000) 两个 CandidateClip 引用同一 SourceAsset 和 blob；原件仅一份、不修改 |
| 7 选择/调整/持久化 | 原双库 UI 操作保存区间/绑定、刷新和重启通过；本轮两库再次启动两次，比对整个 workspace 数据完全一致。当前导演因原故障测试批准了新配音而 stale，正确只读，未为补拍覆盖批准历史 |
| 8 准备与 FFprobe | 原闭环真实 FFmpeg 输出1080×1920/30FPS/H.264/300帧/10秒；[裁剪命令](evidence/phase07/sqlite/ffmpeg.log)、[源参数](evidence/phase07/sqlite/ffprobe-input.json)、[Prepared参数](evidence/phase07/sqlite/ffprobe-prepared.json)；短片段循环/定格需用户明确选择 |
| 9 缓存与失效 | 原两库同recipe命中；本轮真实3秒媒体测试验证区间变化、新源SHA变化均miss并重建。源损坏→ASSET_SOURCE_CHANGED、缓存清单损坏→ASSET_CACHE_INVALID、缓存媒体损坏→ASSET_BLOB_CHANGED；缺失缓存清单重建，不复用错误文件 |
| 10 逐镜版本 | 同一镜头追加绑定历史，另一镜头绑定和批准导演不变；固定Director/shot归属逐项校验。原409/单镜stale测试通过，本轮重启再核对全部绑定/历史 |
| 11 策略和访问边界 | unknown/non-commercial 夹具成功进入绑定/准备/MP4，限制随manifest保留。受限HTTPS域名/DNS/IP/重定向/大小/内容/超时/取消及Range鉴权测试通过；未绕过DRM/访问控制或下载限制。公开证据另做来源审查 |
| 12 实际成片 | [真实 MP4](evidence/phase07/sqlite/internal-poc.mp4) SHA `d49cc2e0d14b511e902f075666b793c301908fdfec83054473f718c9e9907a7a`。冻结背景Prepared SHA `90d790dcabba0fa3edd49a351ffd75ee7c2bad6b5fee0e776d19d99b96b5cfad`。原三帧重复渲染一致；本轮实际解码MP4的2/5/8秒，与该背景网格空间相关度约0.9970/0.9946/0.9940，确认并非只保存元数据 |

[本轮媒体与像素结果](evidence/phase07/remote/media-fault-review.json)及[2秒](evidence/phase07/remote/mp4-at-2s.jpg)、[5秒](evidence/phase07/remote/mp4-at-5s.jpg)、[8秒](evidence/phase07/remote/mp4-at-8s.jpg)。图形文字/SVG/字幕造成成片与背景不可能整图字节相同；比较使用明确无覆盖ROI和预设相关度>0.90。双库成片均按各自 renderResult 的6项产物核对实际字节，共12项通过。

## 版本、任务与失败路径

- AssetBinding 固定 DirectorRevision/shot，追加 previousBindingId/version；批准导演不可被后台素材任务覆盖。新导演决策仍需既有 Fork/审核。本轮没有绕过审批。
- 409与轮询编辑令牌、单镜下游失效、approved保护、幂等、迟到绑定结果拒绝和租约回收：本轮76项含相关单元；原双库实际超时100ms、重试、running取消、重启和配音版本失效记录保留。
- 源文件缺失：底层ENOENT，Worker统一映射处理失败并保持failed；源SHA改变、非法区间、FFmpeg不可用、缓存损坏均明确失败，不写可用产物。HTTP404、中断的本轮补充是下载器依赖注入故障测试，不声称公有平台发生了真实故障；原真实公网成功与之分开。
- 本轮 fault 注入在媒体函数层执行，未再为每种故障新增双库 Worker 集成任务；双库 Worker 生命周期沿用原实际结果。这是证据覆盖边界，不将函数故障注入标记成新双库闭环。
- Codex runtime/provider 文件相对批准基线无变化；原真实审计仍为data-only-v1，Shell/Patch禁用、MCP=0、用户配置忽略、独立临时数据工作区。未扩大权限。

## 风险与停止点

继续保留：稀疏帧不等于逐帧理解；Pexels/Pixabay未配置；Windows两次历史原生异常UNCONFIRMED；Whisper中文/词时间精度限制；云端神经TTS未配置；Codex账号额度/持续费用未知。公有Provider可能变更或限流；缺失/损坏的缓存以明确失败或可验证重建处理，尚无自动清理与全局多Worker限流。本轮没有删改历史失败记录。

远程验收材料已具备，等待正式审核。可信Remotion仍为10秒竖屏PoC，不代表Phase08自由AI动画或Phase09完整导出。最终Git状态、正常推送及GitHub回读检查见最终交付消息。
