# Phase 07 验收证据

全部为实际运行记录。测试工程/语音/视频为自制，外部图片/视频保留公开来源及已知限制；不提交用户原件、测试数据库、认证文件或构建缓存。没有用Mock替代真实外部检索、视觉、裁剪或Remotion验收。总体见[交付报告](../../PHASE_07_DELIVERY.md)。

## 入口

- [测试汇总](test-summary.json)；[76项单元](unit-tests.log)、[Web类型](typecheck.log)、[Render类型](render-typecheck.log)、[生产构建](build.log)。
- [SQLite闭环19组](sqlite/results.json)、[PostgreSQL闭环21组](postgresql/results.json)，每库含1条原真实渲染任务续跑来源说明；[PG增量/重复迁移](postgresql/migrations.log)、[PG零漂移](postgresql/schema-drift.log)。
- [真实FFmpeg像素/时长/缓存回归](media-regression.json)：单次、循环、末帧定格；音频/容器比视频流更长的情况。
- [公开Provider探测](providers/results.json)：Commons图片、NASA视频的真实检索/下载/FFprobe/PTS索引，**此独立探测没有语义模型结论**；[实际运行输出](providers/run.log)。
- [最终构建浏览器检查](final-ui/results.json)：任务历史展开/折叠、历史导演版固定资产查询及只读。
- [工作区扫描](security-worktree.json)、[补充人工/凭据/体积审查](security-review.json)、[精确暂存区扫描](security-staged.json)、[修改文件清单](changed-files.txt)。

## 真实模型、来源与匹配

两库目录均包含 `local-visual-match.json`、`external-search-match.json`、`external-source.json`、`local-index.json`、`asset-snapshot.json`。其中保存冻结Director/shot/intent、实际搜索URL/响应SHA、SourceAsset来源/作者/限制、原件及帧SHA、PTS、候选区间、分项评分/理由、模型/runId/usage。模型搜索模式为disabled，图片/帧来自已下载文件；公开Provider API负责素材发现，未将Codex建议冒充搜索结果。Claim/商用许可不被自动核实。

外部图片主闭环来源为NASA Images，具体详情URL以各库external-source为准；Commons图与NASA视频的单独探测见providers记录。NASA视频容器123.843秒、视频流123.5秒；索引使用实际视频流范围。源视频/图片原件留在忽略的隔离测试目录，不把第三方原视频复制进Git。公开视频只做内部测试，没有自动公开发布。

## 视频与画面

- [真实内部MP4（SQLite）](sqlite/internal-poc.mp4)、[PG独立实际渲染MP4](postgresql/internal-poc.mp4)。背景为[自制GPU夹具](../../../fixtures/assets/README.md)的B段末帧延长；10秒/1080×1920/30FPS/H.264，可信文字/SVG/字幕叠加。两个文件相同SHA也保留独立数据库闭环的产物关联，Git自动复用同一blob。
- [Remotion FFprobe](sqlite/ffprobe-remotion.json)、[输入FFprobe](sqlite/ffprobe-input.json)、[Prepared FFprobe](sqlite/ffprobe-prepared.json)、[真实FFmpeg参数](sqlite/ffmpeg.log)。
- [冻结manifest及来源限制](sqlite/remotion-manifest.json)、[任务/清单hash/3关键帧确定性](sqlite/remotion-result.json)、[渲染日志](sqlite/remotion-worker.log)。
- [关键帧](sqlite/remotion-keyframe.png)、[自制视频联系表](sqlite/local-contact-sheet.jpg)、[真实NASA图片](sqlite/external-contact-sheet.jpg)、[Commons联系表](providers/commons-image-contact.jpg)、[NASA视频联系表](providers/nasa-video-contact.jpg)。
- [60帧](sqlite/remotion-frame-060.png)、[150帧](sqlite/remotion-frame-150.png)、[240帧](sqlite/remotion-frame-240.png)及[两库12份实际产物逐字节SHA校验](artifact-integrity.json)。渲染MP4、三帧、manifest、FFprobe保留原始产物字节；FFprobe的filename仅是隔离测试目录，其余日志的工作目录作了脱敏。

## 页面操作与截图

1. 批准文稿/时间轴/导演后进入07，选择镜头，改查询和来源；本地优先，Top-K真实分析会创建可追溯候选。[素材库](sqlite/07-library.png)。
2. 点候选/原件，播放原视频、点时间码、改入出点；同源两区间共用原件。[区间与联系表](sqlite/07-range-preview.png)。
3. 选择once/loop/freeze，确认素材使用方案，后台自动准备；重复准备可见缓存命中。另一个窗口更新后，当前旧编辑保持原版本并收到409。[实际冲突](sqlite/07-concurrent-409.png)。
4. 06页的独立素材面板与07共用后端；批准导演不被覆盖。[06素材入口](sqlite/06-asset-binding.png)、[最终构建历史版本只读](final-ui/06-history-binding.png)。
5. 对合适的竖屏PreparedAsset点击可信PoC合成，08页等待真实Worker完成并实际播放。[08播放](sqlite/08-prepared-remotion.png)、[移动端](sqlite/07-mobile.png)、[最终07视口](final-ui/07-workspace-viewport.png)。

原双库截图在完整操作链中拍摄，可能显示为故障测试主动制造的失败/取消任务；不隐藏这些状态。最终视口来自相同自制库的安全副本，已通过依赖失效，因此显示只读提示不是生产错误。

## 回归与失败记录

[研究/00–01](regression/phase03/sqlite/results.json)、[文稿](regression/phase04/sqlite/results.json)、[语音/真实ASR与对齐](regression/phase05/sqlite/results.json)、[真实导演](regression/phase06/sqlite/results.json)、[真实04.5搜索/视觉/写稿](regression/phase045/sqlite/results.json)、[候选Claim边界](regression/claim-boundaries/sqlite/results.json)。各自run.log及截图/模型输出在同目录。上述旧阶段本次跑SQLite相关回归；Phase07新增路径实际跑了SQLite和PostgreSQL，不冒充旧阶段所有PG测试本轮也重跑。

diagnostics保留模块路径、AI审计归并、freeze、超时归因、测试器HTTP连接/续跑辅助函数/字幕夹具与缺H.264浏览器等失败记录。实际渲染先成功，测试器随后连接失败，修正后在同一隔离库续跑；未将早期失败删除或宣称首轮全绿。历史两次Windows原生异常仍UNCONFIRMED，见既有04.5记录，本阶段没有宣称修复其根因。

安全边界、资源上限、额外Provider未配置和后续Phase08依赖见[配置说明](../../ASSET_ENGINE_SETUP.md)。提交仅本地，不自动推送或发布。
