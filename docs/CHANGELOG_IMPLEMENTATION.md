# 实施日志（Codex 维护）

当前状态：**Phase 00 已建立 Git 基线；Phase 00.5 真实 PostgreSQL 集成验证完成，等待用户审核，未进入 Phase 01。**

每次 Codex 完成阶段后，在此按日期追加：阶段、主要变更、数据迁移、执行的命令与真实结果、Mock/Real 界线、技术取舍、阻塞问题。

## 2026-10-22 · Phase 00 / v1.3 同步

- 保留已有文档和原型，建立 pnpm workspace、Next.js App Router、TypeScript strict、Zod、CSS Modules 设计系统；十页工作区、项目列表与独立 Demo 路由。
- 实现真实项目创建/读取/设置保存，三种创作起点、自定义时长/画幅/配音偏好/预算；上传原件及鉴权下载；原子版本校验、401/403/409 错误和本机会话。
- ORM 选 Prisma；部署 schema 为 PostgreSQL。当前本地真实持久化采用 SQLite 适配器，建表 migration 1；没有执行 PostgreSQL 迁移、没有迁移或清除用户既有数据。
- 预留模型、研究、素材、声音、媒体和渲染接口；未产生 AI 事实、审核结果、音频、视频或正式授权素材。GPU 六镜头 fixture 明确标记 Mock。
- 重新读取 v1.3 规范，完成当前阶段参考研究和冲突分级，详见 [参考记录](REFERENCE_REVIEW_LOG.md)。不引入 Hypit/Remotion 依赖，不复制其源码。
- 实际通过：冻结锁文件安装、类型检查、7 项单元测试、15 项 HTTP 检查、浏览器三入口与导航/响应式验收、生产构建、Prisma generate/validate；14 张真实页面截图已落盘。
- 浏览器测试最初与 Next 路由播报元素及项目卡片可访问名称发生定位冲突，已修正定位器并成功重跑；最初网络/进程权限限制在获准执行后解除。PostgreSQL 服务缺失仍是集成限制。
- 末轮发现 multipart 额外额度可使多文件总量略超上限；回归测试先得到错误的 201，再补充写入前总量检查，最终超限 1 字节返回 413 且不创建项目。
- 生产环境首个导航间歇超时，等待客户端标题不能解决；记录到点击已送达、RSC 200 但页面未切换。工作台 Link 统一显式关闭自动预取后，最终构建连续三轮浏览器验收通过。保留正常客户端导航和失败诊断；相关 Next.js 问题与适配依据见交付记录。
- 工作目录没有 `.git`，未初始化 Git、提交、推送或部署。
- 命令、文件清单、证据和剩余问题见 [Phase 00 交付记录](PHASE_00_DELIVERY.md)。下一阶段必须等待用户批准。

## 2026-10-22 · Phase 00.5 / Git 与 PostgreSQL

- 按用户授权核实项目及上级无 Git，建立 main 分支和基线 `e53ab169d590cb1c7d6f334ae962121cc33d29cb`（131 文件）；完善忽略规则、扫描敏感内容，没有远程配置或推送。
- Docker daemon 未运行，改用 EDB PostgreSQL 17.6 二进制，在忽略的缓存目录初始化独立 SCRAM 测试 cluster，仅监听 loopback:55432；未安装系统服务。
- `0001_project` 和 Prisma Schema 保持不变，实际验证首次/重复迁移、第二空库初始化及零 schema 漂移。适配器使用 Prisma 生成类型，去除临时结构类型和动态加载。
- 真实 PostgreSQL 验证九种起点/配音组合、30/240/90.5 秒、并发版本冲突、受保护上传下载、应用和数据库重启持久化；HTTP 返回数据与 PostgreSQL 行完整比对。
- PostgreSQL 与 SQLite 对相同九份项目 JSON 往返一致；原 SQLite/附件/会话文件前后散列相同。只提供安全过渡方案，没有自动搬迁真实用户数据。
- 重跑 7 项单元测试、15 项真实 PostgreSQL HTTP 检查、类型检查和生产构建；测试 Windows 子进程管道问题修复后完成重跑。证据位于 `docs/evidence/phase00-5/`。
- 新增本地数据库辅助脚本、可重跑集成测试、PostgreSQL 环境示例和 [交付报告](PHASE_00_5_DELIVERY.md)。Phase 00.5 后续变更留在工作区供审核，没有新增 Phase 01 功能。
