# Phase06 自制120秒导演验收样例

`director-120s.wav`是自撰中文文稿经本机Windows SAPI Microsoft Huihui Desktop合成后，按4个30秒槽拼接的真实PCM音频。无个人录音、身份信息或第三方事实；不分发系统语音引擎。音频仅用于内部技术验收。

- FFprobe：120.000000秒、22050Hz、单声道、PCM s16le；参数见[ffprobe.json](ffprobe.json)。
- [sample.json](sample.json)：原始四段文本、音频SHA256、每段实测长度与拼接偏移。
- Cue标为`manual`：区间来自已知拼接位置和各段FFprobe时长，包含SAPI首尾静音。不是强制对齐、逐词金标准或均分估时。静音间隔真实存在。
- 真实AI六镜结果、审计和固定引用见[SQLite](../../docs/evidence/phase06/sqlite/real-director-job.json)、[PostgreSQL](../../docs/evidence/phase06/postgresql/real-director-job.json)。模型创意不承诺逐次字面一致；稳定ID及帧/引用约束由服务端验证。

在已安装Huihui、FFmpeg/FFprobe的Windows上运行`node scripts/director-fixtures.cjs`可重新合成；不同系统声线版本可能产生不同字节/时长。脚本检查每段不超过30秒，不缩放声音来冒充对齐；生成的SHA与sample同步。独立闭环：`node tests/director/run.cjs`和`node tests/director/run.cjs --postgres`。需要先生产构建、本机已登录固定Codex0.163.0，测试会显式启用数据分析Provider。无真实Provider会失败，不用Mock替代验收。

测试在独立`.cache/phase06/<runId>`及新建`studio_phase06_<runId>`数据库执行，不迁移已有用户数据。PG需先按README启动本地独立测试实例。真实调用消耗账号额度，未公开剩余额度，不保证免费。运行完成自动关闭应用/浏览器，保留测试数据以供复核；不会推送或公开发布。
