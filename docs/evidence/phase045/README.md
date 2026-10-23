# Phase 04.5 验收证据索引

- [实施计划](../../../plans/04-5-real-ai.md)、[本地交付](../../PHASE_04_5_DELIVERY.md)、[最终12项复核与Windows专项](../../PHASE_04_5_FINAL_ACCEPTANCE.md)。
- 代码提交 [`a6aee3746e704645e84a8870aaaeff8c4cd3278b`](https://github.com/shenzhuW/Ai_Audio/commit/a6aee3746e704645e84a8870aaaeff8c4cd3278b)；[代码完整文件/对象安全审计](remote/code-commit-audit.json)、[全阶段文件SHA清单](manifest.json)、[工作副本扫描](security-audit.json)。扫描记录为其标注时刻，最终远程Hash与干净状态由交付消息提供。

## 实际测试记录

| 内容 | 记录 |
|---|---|
| 原36项单元及本轮重跑36项 | [原日志](unit-tests.log)、[新日志](remote/unit-tests.log) |
| 本轮Web/Render类型检查和生产构建 | [Web](remote/typecheck.log)、[Render](remote/render-typecheck.log)、[构建](remote/build.log) |
| SQLite9组真实AI | [结果](sqlite/results.json)、[首轮输出](sqlite-initial-run.log)、[最后两步续验](sqlite-finalize.log)、[Worker](sqlite/workers.log) |
| PostgreSQL10组真实AI | [结果](postgresql/results.json)、[控制台](postgresql-run.log)、[Worker](postgresql/workers.log)、[初始化/重复迁移](postgresql/migrations.log) |
| Phase04回归（含00/01HTTP与Workflow） | [SQLite9组](regression/phase04/sqlite/results.json)、[PostgreSQL11组](regression/phase04/postgresql/results.json) |
| Phase03回归 | [SQLite15组](regression/phase03/sqlite/results.json)、[PostgreSQL16组](regression/phase03/postgresql/results.json)；各目录含HTTP/Workflow与迁移日志 |
| 本轮完整工作区重启、批准保护重放、独立任务截图 | [SQLite4组](remote/sqlite-restart-fences.json)、[PostgreSQL4组](remote/postgresql-restart-fences.json) |
| PostgreSQL服务正常停启前后完整结果一致 | [摘要对比](remote/postgresql-server-restart.json)、[实际独立命令输出](remote/postgresql-server-restart-independent.log)；[首个采证Shell挂起的短输出](remote/postgresql-server-restart.log)保留 |
| 实际CLI进程终止、同Job真实重试、重启 | [新SQLite3组](remote/failure-retry.json)、[Worker日志](remote/failure-retry-worker.log)、[首次测试400失败记录](remote/failure-retry-initial.json) |
| 真实CLI恶意文本/外部自制哨兵/实际启动参数 | [实测与脱敏CommandLine](remote/injection-canary.json)、[V8有限环境](cli/safety.json)、[实际超时](cli/timeout.json)、[本机Provider](codex-environment.json) |
| 19次实际运行的脱敏事件、附件SHA、Provider/使用量 | [事件投影](remote/cli-event-projection.json)。范围为两库16次+新哨兵1次+故障/重试2次，不是全部PoC调用总数。原始正文/推理/认证不公开 |
| 保存证据的自动交叉核验（不再调用模型） | [原始核对](verification.json)、[新增引用/段落/实际附件/截图字节SHA核对](remote/verification.json) |

## 页面和自制输入

| 页面/输入 | PostgreSQL | SQLite |
|---|---|---|
| 实时搜索、模型摘要和独立网页原文 | [实际页面](postgresql/03-real-search.png) | [实际页面](sqlite/03-real-search.png) |
| 三柱图真实视觉分析 | [实际页面](postgresql/03-real-vision.png) | [实际页面](sqlite/03-real-vision.png) |
| 视频帧、时间码和索引 | [实际页面](postgresql/03-real-video.png) | [实际页面](sqlite/03-real-video.png) |
| 研究真实任务/审计 | [实际页面](postgresql/03-real-audit.png) | [实际页面](sqlite/03-real-audit.png) |
| 文稿编辑/整体结果及任务 | [完整页面](postgresql/04-real-script.png) | [完整页面](sqlite/04-real-script.png) |
| 整体写稿任务独立截图 | [实际任务卡](remote/postgresql-04-real-whole.png) | [实际任务卡](remote/sqlite-04-real-whole.png) |
| 局部改写任务独立截图 | [实际任务卡](remote/postgresql-04-real-partial.png) | [实际任务卡](remote/sqlite-04-real-partial.png) |
| 390px移动端 | [页面](postgresql/04-mobile.png) | [页面](sqlite/04-mobile.png) |
| 原图及视频帧 | [自制图](postgresql/self-authored-chart.png)、[0ms](postgresql/frame-0.jpg)、[3333ms](postgresql/frame-3333.jpg)、[6666ms](postgresql/frame-6666.jpg) | [自制图](sqlite/self-authored-chart.png)、[0ms](sqlite/frame-0.jpg)、[3333ms](sqlite/frame-3333.jpg)、[6666ms](sqlite/frame-6666.jpg) |
| 持久化结果投影 | [研究](postgresql/research-snapshot.json)、[文稿](postgresql/script-snapshot.json) | [研究](sqlite/research-snapshot.json)、[文稿](sqlite/script-snapshot.json) |

任务卡截图来自实际Chrome的元素截图，没有重新排版/替换内容；当前完整编辑器是后续整体结果，局部结果原文保存在job.scriptResult，不把当前页面说成旧快照。每库captures.json包含原6张页面散列，remote/*-restart-fences.json包含新增两张任务卡的字节散列。

操作与复现：[自制样例说明](../../../fixtures/real-ai/README.md)。启用本机固定版本CLI与ChatGPT登录后，按交付命令运行真实验收；测试需消耗用户套餐额度，不能宣称无限免费。仅截图/重启复核命令不启动AI Worker；`--failure-retry`与`remote-cli --canary`会真实调用模型。独立临时库/数据目录不会导入或迁移用户库。

## 失败记录与边界

- [两次Windows原生退出专项](remote/windows-native-incidents.json)、[回归初次短输出](remote/windows-regression-initial.log)、[SQLite独立重跑输出](remote/windows-regression-sqlite-retry.log)、[PG独立重跑输出](remote/windows-regression-postgresql-retry.log)、[复拍原批次短输出](browser-native-exit.log)、[PG独立复拍](browser-postgresql-retry.log)。根因UNCONFIRMED，未捕获dump/栈，不因重跑成功忽略失败。
- [早期门禁/取消/断言等诊断](diagnostics.json)、[初次安全门禁FAIL](cli/safety-initial.json)保留。早期[boundary模型自述](cli/boundary.json)明确INCONCLUSIVE，不能作为真实工具清单证据。
- 图像/视频帧视觉为模型分析，非原文、完整OCR、ASR或视频运动理解。尚无AI自动抽取Claim，现有AI结果不自动核实事实。SDK仅源码评估未运行；真实模型为codex-cli0.163.0/gpt-6.1-sol，额度未知。没有开放自由源码执行、没有推进Phase05。
