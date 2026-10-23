# Phase 03 可复现的自制合成资料

这些是程序生成的验收夹具，不是现实研究事实，也不是第三方文章。

- `source-a.pdf`：真实一页 PDF，正文含 `SYNTHETIC TEST ONLY. Capacity is 32 units.`。
- `source-b.txt`：真实文本，含 `Capacity is 64 units.`，故意与 A 冲突。
- `diagram.png`：FFmpeg 生成的 640×360 单色测试图，无图像语义事实。
- `broken.pdf`：有 PDF 文件头但内容损坏，专门验证解析失败；不用于正常研究。
- 视频复用 [Phase 02 自制背景](../../apps/render/public/background.mp4)，10 秒 / 1080×1920 / H.264，不额外复制。

生成配方与 PDF 字节构造见 `tests/research/fixtures.cjs`；没有下载第三方新闻、照片或视频。Phase 02 视频来源/配方另见 `apps/render/ASSET_LICENSES.md`。

本机启动 Web + `pnpm research:worker` 后，打开项目第 03 页：

1. 建立研究草稿，分别上传 A、B、图片及上述视频。许可可标“未知”或“不可商用”，内部分析不会因此阻断。
2. 每个来源选择“本地真实提取”，点击“分析所选来源”。A 得到 1 页文本，图片得到 640×360，视频得到 0–3333 / 3333–6666 / 6666–10000 ms 三段及真实抽帧。
3. 新增“合成测试容量为 32 单位”Claim，填写日期和“仅自制夹具”口径；给 A 添加支持引用 `Capacity is 32 units.`、locator 第 1 页，给 B 添加反驳引用 `Capacity is 64 units.`、locator 文本第 1 段。状态变为“存在冲突”，两条引用保留；不是已核实事实。
4. 保存摘要、提交并批准；资料表单只读。创建新修订后再次修改，历史批准快照保持原样。
5. 如需验证 Mock，另上传一份图像选择“Mock 内容说明”。若选择未配置 Provider 或上传 broken.pdf 分析，应看到明确失败任务，不应出现真实文章或识别结论。

自动验收：`pnpm build` 后执行 `pnpm test:research`；真实 PostgreSQL 验收按 `docs/POSTGRESQL_LOCAL.md` 启动专用测试集群，再执行 `node tests/research/run.cjs --postgres`。自动脚本使用独立数据目录，不清空或迁移用户数据。
