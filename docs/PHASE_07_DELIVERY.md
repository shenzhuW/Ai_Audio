# Phase 07 本地交付报告

批准基线：`34d88410a1f1b1e0a92a4bae548871fcc9c7288f`，开工时与GitHub main一致、工作区干净。本轮仅Phase07；不推送、不进入Phase08。所有测试在新增独立目录/数据库上运行，原用户数据库、上传和会话SHA前后一致。

## 实现与版本边界

- 新增 SourceAsset / CandidateClip / AssetBinding / PreparedAsset 四类持久化；SQLite schema version7、PostgreSQL增量0007，旧迁移不改、不搬迁真实用户数据。两库有原件SHA/URL保护、历史追加/禁止删除约束。
- 从当前有效批准 DirectorRevision + shotId/VisualSearchIntent 检索；优先项目/研究原件和同所有者已索引库，再查NASA/Commons。实际API元数据、已下载原件、FFprobe索引、真实视觉/仅元数据/Mock/未配置分别标记。
- Top-K最多3项，用真实解码图片/帧调用既有Codex数据运行时，保存模型、runId、usage、帧ID/SHA、评分和理由。不由Codex编造素材URL，不把视觉判断提升为事实核验或授权结论。
- 原件内容寻址保存，研究/项目原件可直接引用；同源候选只存区间。用户确认素材使用方案即追加逐镜绑定版本并排队准备，没有额外裁剪批准；批准导演版不被素材任务修改。改变纯代码路线须显式Fork/审核。
- FFmpeg实际裁剪/循环/定格、画幅适配、静音H.264转码；recipeHash缓存命中仍核对SHA/FFprobe。保持源视频不变。替换一镜只影响本镜绑定及引用它的成片依赖，其他镜头、研究和文稿不重做。
- 第07页真实搜索、上传、候选/原件库、筛选、联系表、区间、播放定位、绑定历史与任务进度；第06页嵌入独立素材方案入口。编辑令牌固定于选择候选时，轮询不会吞掉另一窗口的并发修改。
- 既有可信Remotion PoC可接收已准备的10秒竖屏背景。视频、文字、SVG和字幕实际合成；固定输入/预览清单hash相同、3关键帧重复渲染一致。来源URL、平台、作者、许可标签、限制、原区间及用途随冻结manifest保留。没有自由TSX或Phase08动画生成。

## 实际验证

详见[证据索引](evidence/phase07/README.md)、[运行配置/限制](ASSET_ENGINE_SETUP.md)。

| 验证 | 实际结果 |
|---|---|
| 单元测试 | 76/76，含旧阶段安全/版本/审批和新增素材边界；见unit-tests.log |
| Web / Render TypeScript | 均通过，见typecheck.log / render-typecheck.log |
| 生产构建 / 最终浏览器 | 最终代码构建通过；最终版本库/历史面板2项真实浏览器检查通过 |
| 双库素材闭环 | SQLite19组、PostgreSQL21组PASS；各含1条保留原库/真实已完成渲染任务的续跑说明 |
| PostgreSQL | 0001–0006基线升级0007、重复部署、旧项目JSON保留、非超级应用用户、Prisma零漂移 |
| 真实媒体回归 | 单次/循环/定格均300帧10秒；RGB采样证明循环只在A段、定格在B段且尾帧保持；音频尾部长于视频时仍按视频流索引 |
| 真实公开来源 | 双库NASA图片搜索/下载/视觉；另外Commons图片、NASA视频搜索/下载/FFprobe/联系表实际通过。后一个探测不宣称做过语义模型匹配 |
| 真实浏览器 | 原件/PreparedAsset/最终MP4播放，定位、区间保存、刷新、轮询后409、06/07/08页、移动端无横向溢出 |
| 00–06相关回归 | 研究15组（含原HTTP15项、Workflow8项）、文稿9、配音12、导演16组，真实04.5九组、候选边界4组PASS，共65组顶层检查；旧阶段本轮跑SQLite相关回归，Phase07跑双库 |

主要执行命令：

```powershell
node scripts/asset-fixtures.cjs
pnpm db:generate
pnpm test
pnpm typecheck
pnpm render:typecheck
pnpm build
node tests/assets/media.cjs
node tests/assets/providers.cjs
node tests/assets/run.cjs
node tests/assets/run.cjs --postgres
# 本次测试器中途修正后，在相同独立测试库/已有真实产物上续跑：
$env:STUDIO_ASSET_RESUME_RUN='mvm2m8pu'; node tests/assets/run.cjs
$env:STUDIO_ASSET_RESUME_RUN='mvm2mm47'; node tests/assets/run.cjs --postgres
# 旧阶段回归使用独立STUDIO_TEST_PHASE_EVIDENCE_ROOT；浏览器显式选本机Chrome：
node tests/research/run.cjs
node tests/script/run.cjs
node tests/voice/run.cjs
node tests/director/run.cjs
node tests/real-ai/run.cjs
node tests/real-ai/run.cjs --claims-boundaries
node scripts/audit-staged.cjs --worktree
pnpm audit:staged
```

新环境重复闭环应运行两条不带RESUME的命令；RESUME只供已有checkpoint的本次隔离库使用，不是Mock/跳过模型或渲染的替代。两库实际模型和视频在前半轮已成功，后续失败记录与续跑链保留在diagnostics。测试日志中主动制造的超时/取消/损坏输入是预期失败路径，不能视作已生产出可用素材。

## 发现并修复的问题

1. Worker导入路径单复数错误、素材AI审计未归并到Job顶层，均通过实际失败定位修正。
2. freeze保留输出-t会截断补帧；改为滤镜trim/setpts后tpad，真实像素/时长/缓存回归通过。
3. 页面轮询曾可能刷新旧编辑的版本令牌；改为会话固定，实际浏览器并发确认409。
4. 初版Remotion清单只含ID/SHA；增加服务端核对的来源、限制与区间快照，并实际验证导出manifest。
5. 超时原因可能被晚到IPC进度覆盖；独立timedOut标志后两库100ms真实超时/重试/取消通过。
6. NASA视频的音频/容器尾部超过视频流末尾，导致最后抽帧失败；优先视频流时长，不伪造PTS；实际123.5秒视频及自制尾部延长回归通过。
7. 测试器长时间同步等待渲染后HTTP连接失败，改异步等待和独立连接后在原库续跑；续跑辅助函数作用域和字幕夹具漏Cue也修正。旧研究浏览器首次未显式选支持H.264的Chrome，换成既有系统Chrome后完整重跑通过。这些测试器失败没有当作功能通过或删除记录。
8. 最终历史入口复核发现06页素材面板需随所查看的DirectorRevision固定；已显式传递修订ID，真实浏览器验证历史查询不落到当前版本、旧绑定保持只读。任务默认展示最近6项，可展开完整历史。

独立只读代码审查发现的三项Important（freeze、轮询冲突、清单来源）已修正并复审无新增Critical/Important。安全边界未放宽；未引入新模型、付费API、第三方下载器或渲染架构。

## 修改范围

新增domain/assets、server/assets、asset-* Worker/Provider/媒体/下载脚本、三类素材API、第07页面板、0007迁移、fixtures/assets、tests/assets与素材单元测试。增量扩展Workflow状态/Job/仓储及逐镜stale、DirectorPanel素材入口、可信RenderInput/worker/child；原CRUD/审批/语音/研究模块保持兼容。同步README、环境示例、架构/数据/API/UI/参考/进度规范。完整提交文件清单见证据中的changed-files记录。

## 已知限制与后续接口

- 稀疏帧只能证明看过的画面，不能保证精确动作起止；元数据初筛使用关键词，不是全库向量搜索。评分为可解释建议，仍需人工观看候选。
- NASA视频manifest逐项请求；单项失败目前会使该Provider本轮失败，但all模式仍可继续其他Provider。公开API可能变化、限流、无结果；不绕过访问限制。Pexels/Pixabay未配置。
- 每Worker串行/每秒1请求，无跨多实例全局限流；源/产物资源上限及可信本机进程的OS隔离限制见配置文档。VFR/异常时间戳可能明确失败，不能保证所有第三方媒体均兼容。私有临时/无引用blob暂不自动清理，原件不删除。
- Remotion验证仍是固定10秒竖屏可信PoC；完整分镜合成/自由动画留后续阶段，不将此PoC冒充完整项目成片。外部来源的视觉分析与许可标签不构成事实/法律核验。
- 历史两次Windows原生异常继续UNCONFIRMED，本阶段未据重跑成功宣称根因修复。Whisper时间准确性/中文分词限制、云端神经TTS未配置、Codex剩余额度/持续费用未知继续保留。

Phase08可消费固定AssetBinding版本、PreparedAsset及recipeHash/来源清单；不需要重新研究或重写文稿。本阶段结束后等待用户正式审核。
