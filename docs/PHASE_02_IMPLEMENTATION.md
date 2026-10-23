# Phase 02 实施与安全边界

代码基线：Phase 01 `70d4ddf`，最终验收材料 `bdb1a56`；2026-10-23 获准 Phase 02。仅实现可信场景的 10 秒 / 1080×1920 / 30fps / H.264 技术闭环，不开发 Research、Director、智能选片、任意 TSX 或 Code Agent。

1. 先验证 SceneSpec/时间轴/媒体门禁、心跳租约、取消/迟到结果和兼容性。复用原 Workflow Job、Outbox、幂等/版本/审计，只追加可选的 renderInput/renderResult/progress/logs 字段及内部 Worker 动作；JSON/JSONB 存储无需新表或破坏性迁移。
2. Render 请求只接收可信预置 ID 与显式开放的字体大小，不接受代码、路径或 URL。冻结 SceneSpec、时间轴、素材/字体散列、组件目录/工具版本和 Props；PoC 测试图表标明合成数据，没有真实业务事实主张。
3. 自行通过 FFmpeg 生成几何运动 MP4 底图，记录配方、散列和许可依据；叠加 React 文字、SVG 动态图表和字幕。动画只依赖 frame/Props，不使用计时器或运行时随机数。
4. 独立可信控制 Worker 访问队列；渲染子进程只获白名单环境、冻结请求、只读可信代码/素材的约定路径和单独 attempt 输出目录，不传数据库、会话和 Provider 密钥。心跳续租、超时、并发限制、错误日志、取消及过期执行者隔离写回原 Job。文本 Worker 不领取 Remotion Job。
5. 预览直接播放同一真实 MP4，关键帧和视频共享 composition/inputProps/timeline/manifestHash；不把 Player 的浏览器实时效果当最终视频。研究 Player，但不在主站引入任意 TSX 执行入口。
6. 第 08 页接入真实任务、进度、日志、关键帧及受保护 Range 下载；调整已声明 title.fontSize 仅产生新渲染输入，不重做文稿。其他页面功能保持。
7. 实际渲染、FFprobe 检测、相同关键帧重复渲染散列比较、与 MP4 对应帧画面对照；隔离 SQLite/真实 PostgreSQL、旧工作流/API 回归、浏览器、类型检查和生产构建。保存真实视频/截图/日志及所有失败记录。

当前机器 Docker CLI 存在，但 `docker info` 无法连接 daemon。Phase 02 仅使用受信任、仓库内固定入口的本机子进程；不能声称实现 OS 级文件/网络沙箱。任意代码执行保持禁止。生产容器的非 root、只读挂载、资源与网络策略后续专门验证，不将配置文件等同已验证隔离。

Remotion 使用精确相同版本的 core/bundler/renderer。已授权本地技术评估；公开上线/商业自动化使用前按实际主体复核 Remotion License，不购买服务、不改变本仓库许可证。字体/视频来源单独记录。完成后独立提交本地 Phase 02，交付报告后停止，不自动推送或进入 Phase 03。
