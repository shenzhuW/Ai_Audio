# Phase 07 素材运行说明

先使用既有 PostgreSQL 迁移流程（`pnpm db:generate` / `pnpm db:migrate`）或独立 SQLite 开发目录，保留原件与旧迁移。0007 只新增四张表及历史保护触发器，不搬迁真实用户数据。

```powershell
pnpm dev
# 另一个终端，继承相同 STUDIO_DATA_DIR / DATABASE_URL：
$env:STUDIO_CODEX_ENABLED='1'
pnpm asset:worker
# 使用第07页的可信10秒PoC合成入口时，另启既有Worker：
$env:STUDIO_TRUSTED_LOCAL_RENDER='1'
$env:STUDIO_CHROMIUM_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
pnpm render:worker
```

第07页上传 MP4/WebM/PNG/JPEG；或搜索时导入当前项目研究/上传引用与同一所有者的已索引库，不复制原件。批准导演的纯代码镜头不能在后台改成素材路线，须显式Fork/审核。待匹配/绑定镜头选择候选、调整毫秒入出点、确认素材使用方案后自动排队准备。第06页有同一入口。素材绑定是独立、不可变、逐镜递增版本，不增加裁剪审批。

公开来源使用 NASA Images 和 Commons API；不需要额外 Key。查询由主体、动作、构图、类型、画幅构造，可人工修改。NASA视频解析公开manifest选小尺寸HTTPS MP4；Commons按图片/WebM类型筛选。HTTP引用只对同一NASA公开主机提升到HTTPS，不降级或绕过受阻链接。Pexels/Pixabay Adapter 未配置；不会因为环境中有同名Key就宣称接通。

先按标题/检索关键词和技术条件做廉价筛选，再仅Top-K（1–3，默认2）对真实已解码帧做Codex分析。候选记录语义、主体、动作、构图、画幅、分辨率、首帧边缘强度（清晰度代理量）和时长分数及理由。元数据模式不能冒充视觉，Mock不提供伪素材，真实Provider未配置时明确失败。许可未知不参与排除或评分门禁。

视频时长优先视频流duration，容器/音频尾部可能更长；原始FFprobe保留在验收证据。每视频最多6帧，记录实际解码PTS、帧SHA及源SHA，联系表标记这些时间。稀疏帧不等于完整动作识别，VFR或异常时间戳无法抽帧时明确失败，不捏造画面时间。检测到的切点是FFmpeg scene阈值0.3的提示，未检测到不代表视频没有切换。

入出点为源视频毫秒半开范围，图片固定0/0；单次播放需覆盖镜头，短片段必须明确选loop或freeze。loop先物化所选区间再循环；freeze先trim/setpts再末帧补齐，不能用平均分配或误用输出-t。输出静音H.264/yuv420p/MP4、项目尺寸、30FPS，精确目标帧数，时长误差≤34ms。原始音轨留在原件，Phase07不混音。recipe v1包括SHA、入出点、尺寸/FPS/帧数、fit/crop、播放策略与静音；算法变化需升级recipe版本，缓存命中也复核SHA/FFprobe。

资源配置：

| 变量 | 默认 / 上限 | 含义 |
|---|---|---|
| STUDIO_ASSET_MAX_MB | 64 / 100 | 每次导入或下载字节限制，准备产物100MB |
| STUDIO_ASSET_MAX_SECONDS | 180 / 600 | 可解码/准备视频秒数上限 |
| STUDIO_ASSET_JOB_TIMEOUT_MS | 600000 / 600000，最小100 | 独立任务总超时；短值用于超时测试 |
| STUDIO_FFMPEG_PATH / STUDIO_FFPROBE_PATH | PATH中的程序 | 服务器管理员配置，非用户参数 |
| STUDIO_CODEX_ENABLED | 0 | 主应用/素材Worker启用实际Codex视觉 |

下载固定HTTPS主机白名单，逐跳DNS解析全部IPv4须公网并固定实际连接IP；拒绝私网、凭据、端口、压缩响应、HTML、超额流；3次重定向、30秒总限时、每Worker每秒至多1次请求，429/503至多2次退避。每Worker串行，未实现跨多实例全局限流。无浏览器抓取、Cookie、认证头、DRM、付费墙或禁止下载机制的绕过。

协调进程持有数据库；媒体子进程只接收冻结的最小业务输入和数据目录定位，FFmpeg/FFprobe自身使用过滤环境。真实视觉调用继续使用已验收Codex数据运行时：固定CLI、独立临时目录、仅复制最多6张帧图、禁模型Shell/补丁/MCP/插件/Hook、搜索关闭；认证只由CLI自行读取，不复制到日志/API。子进程模式不是OS容器，不能宣称任意代码沙箱；不接受自由代码或任意文件路径。

每2秒心跳、30秒租约、最多3次尝试；取消先IPC，再5秒后终止本协调器创建的子进程树。结果检查当前有效批准导演版和最新逐镜绑定；迟到结果不写正式实体。失败/取消的私有临时文件及无引用内容寻址blob保留用于诊断，本轮不做全局垃圾回收，不影响原件。

PreparedAsset可通过既有可信PoC合成入口成为10秒1080×1920背景（仅足够长的竖屏产物），保留原PoC的可信文字/SVG/字幕；它不是完整导演成片或Phase08自由动画生成。输入/manifest固定绑定、recipeHash、SHA、来源URL、平台、作者、限制、许可标签和区间。替换该镜绑定使对应旧成片stale，历史仍可查看。
