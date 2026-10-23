# Phase 02 远程验收材料 · 2026-10-23

本轮只整理和推送验收材料，未修改已通过的功能，未进入 Phase 03。

## 提交与推送

代码及本地交付材料：[530792c4d482287cb6abf76697d9b248a6fce1af](https://github.com/shenzhuW/Ai_Audio/commit/530792c4d482287cb6abf76697d9b248a6fce1af)。

推送前 `git fetch origin main` 确认远程为 `bdb1a56254e9903f557ce4017c0039951d73d57c`，是本地提交的祖先，差异为远程独有 0 / 本地独有 1。实际执行 `git push origin main` 正常快进成功；随后 `git ls-remote --heads origin refs/heads/main` 返回完整 `530792c4…`。没有强推、重写历史或功能变更。本说明及详细日志另作验收材料提交。

## 提交内容核查

- 对目标提交完整 Git 对象树逐文件扫描，共 286 个文件、24,629,060 字节；已知密钥/Provider Token/带密码数据库 URL 规则零发现，未发现本地数据库、原件目录、会话密钥或构建缓存。详情：[提交扫描](evidence/phase02/remote/commit-audit.json)。
- 最大文件为 PostgreSQL 验收视频 3,233,246 字节；SQLite 视频 3,207,003 字节、自制背景视频 1,026,392 字节，其余大文件为已有原型/验收截图。均有交付用途，没有无关大型缓存。
- 核对现有自动化测试及证据生成来源，新增项目/镜头/媒体来自隔离测试运行，未上传真实用户数据库、上传原件或会话。额外核验曾误将上传 API 的源码目录判成上传数据，修正规则后重新扫描；没有删除源码或数据。
- 原有 `cross-run.json` 的重验脚本只更新了时间戳，已恢复为原提交内容；未新增或改写先前测试结果。本轮详细日志从已通过运行的独立 SQLite 测试库只读导出，不重新运行或修改业务。

## GitHub 可查看的材料

- [本地交付报告](PHASE_02_DELIVERY.md)。
- [FFprobe 输出](evidence/phase02/sqlite/ffprobe-independent.json)、[Worker 输出](evidence/phase02/sqlite/worker.log)、[实际任务详细日志](evidence/phase02/sqlite/render-job-log.json)。
- [关键帧 60](evidence/phase02/sqlite/frame-060.png)、[150](evidence/phase02/sqlite/frame-150.png)、[240](evidence/phase02/sqlite/frame-240.png)。
- 第 08 页：[成功播放](evidence/phase02/sqlite/08-success.png)、[运行](evidence/phase02/sqlite/08-running.png)、[失败](evidence/phase02/sqlite/08-failed.png)、[移动端](evidence/phase02/sqlite/08-mobile.png)。
- [视频下载](https://raw.githubusercontent.com/shenzhuW/Ai_Audio/530792c4d482287cb6abf76697d9b248a6fce1af/docs/evidence/phase02/sqlite/video.mp4)。

已实际下载上述原提交中的报告、FFprobe、Worker 输出、三张关键帧、成功截图和 MP4，8 个固定提交 URL 全部 HTTP 200，并逐字节比对 Git blob，全部一致；见 [远程核验](evidence/phase02/remote/github-verification.json)。本轮新材料将在正常推送后另行核查，不把旧核验记录冒充新文件验证。

## 独立 MP4

除仓库视频外，另存上传审核副本：仓库内忽略目录 `.cache/phase02-remote-acceptance/AI-Code-Video-Studio-Phase02-10s-1080x1920.mp4`，配套 `artifact.json` 和 `ffprobe.json`。该副本不额外入库，不覆盖任何原视频，与代码提交中的视频字节完全相同。

- 大小：3,207,003 字节。
- SHA256：`56ebebe91856c23f6e7c3a591b90c6e99502e423d48daa4c48713e225322123e`。
- 本轮重新实际执行 FFprobe：10 秒、1080×1920、30/1 FPS、300 帧、H.264；无口播视频，无音轨。

## 策略与限制

D-17/D-18 已同步到 DECISIONS、PRD、AGENTS、素材规范、Phase 07/09 计划及关联协议：商业许可未知/不可商用不自动阻断内部开发测试，保留来源与已知限制，不建设商业许可审批、不自动公开发布。这里的 MP4 为自制几何素材和可信组件的技术验收产物，按用户本轮明确授权随仓库提供。

可信组件限制保持：固定 `poc-v1` 及声明参数，Worker 默认关闭且需显式 opt-in，不接收自由 TSX/任意执行入口；OS 级文件/网络沙箱仍未验证。此轮不放宽访问保护，不改变第三方软件/字体许可证，也不开展后续素材搜索或 Code Agent。
