# Phase 04.5 自制真实 AI 验收输入

`chart.svg` 为自行编写的三柱测试图：白底，红/绿/蓝柱，高度递增，A/B/C和10/20/30。这些数字只画在测试图上，不是商业数据或研究事实。实际浏览器截图PNG保存在对应两库证据目录；Codex必须看到图片才能描述，不能由文件名或尺寸推断内容。

视频使用已有自行生成的 `apps/render/public/background.mp4`（10秒深蓝网格背景），沿用Phase02合法测试素材；FFmpeg在0/3333/6666ms抽取关键帧，真实模型描述单帧，不能因此声称识别音轨或运动。自制既有蓝色图片 `fixtures/research/diagram.png` 用于最小CLI图片PoC。

联网查询为FFmpeg官方ffprobe文档。标题/URL/搜索片段来自真实live搜索事件，摘要由模型生成；抓取器独立获取原始响应/提取文本，保存SHA和受保护下载，不从摘要生成matched原文。公共证据只保留短原文预览/长度/SHA，完整原件及HTML保持在本地隔离库/Blob目录。

复现：按`docs/LOCAL_DEVELOPMENT.md`启用本机Codex运行时，生产构建后运行 `node tests/real-ai/run.cjs`；启动独立测试PostgreSQL后加`--postgres`。测试用实际账号额度，不是Mock，不保证每次模型措辞相同；请先检查账号可用额度。隔离测试数据保留，不清空用户数据库。
