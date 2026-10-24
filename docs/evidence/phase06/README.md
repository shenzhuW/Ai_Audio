# Phase06 验收证据索引

最终远程复核补充：[正式报告](../../PHASE_06_REMOTE_ACCEPTANCE.md)、[截图索引](remote/README.md)、[284文件扫描](remote/code-security-audit.json)。本轮重新运行66单元/类型/构建与两库6组只读浏览器/重启检查；以下157组为原阶段实际记录，已逐文件核对，未冒称全部重跑。

[交付报告](../../PHASE_06_DELIVERY.md) · [机器核对汇总](summary.json) · [自制120秒样例](../../../fixtures/director/README.md)。全部为真实运行记录；Mock只出现在明确标记的静默/边界测试中。

| 材料 | SQLite | PostgreSQL |
|---|---|---|
| 16/18组主闭环 | [结果](sqlite/results.json) | [结果](postgresql/results.json) |
| 真实固定输入、6镜结果、模型调用 | [Job](sqlite/real-director-job.json) | [Job](postgresql/real-director-job.json) |
| 模型原始最终JSON/事件 | [事件](sqlite/real-cli-events.jsonl) | [事件](postgresql/real-cli-events.jsonl) |
| 初始完整导演工作区快照 | [快照](sqlite/real-director-snapshot.json) | [快照](postgresql/real-director-snapshot.json) |
| 帧/口播范围映射 | [映射](sqlite/time-mapping.json) | [映射](postgresql/time-mapping.json) |
| 真实取消与审计 | [Job](sqlite/cancelled-director-job.json) | [Job](postgresql/cancelled-director-job.json) |
| 仅自制项目数据库JSON行 | [数据](sqlite/database-snapshot.json) | [数据](postgresql/database-snapshot.json) |
| 工作台/编辑/只读/Fork/静默/移动端 | [截图目录](sqlite/) | [截图目录](postgresql/) |
| 增量迁移/重复执行/零漂移 | SQLite幂等初始化、重启在主结果 | [迁移](postgresql/migrations.log)、[零漂移](postgresql/schema-drift.log) |

[UI专项](ui-protections/sqlite/results.json)：编辑缓冲下取消/重试、409、增删排序稳定ID、修改前后差异。截图：[工作台视口](ui-protections/sqlite/06-workbench-viewport.png)、[409提示](ui-protections/sqlite/06-conflict-buffer.png)、[逐镜差异](ui-protections/sqlite/06-before-after-diff.png)。

[CLI证据映射](cli-evidence.json)：仅匹配本轮自制导演Job的runId；没有读取认证/会话文件。真实结果与agent_message JSON逐结构一致，使用量见各Job，剩余额度未知。[安全扫描](security-audit.json)。完整原始测试日志在[logs](logs/)，早期失败在[attempts](attempts/)；TDD预期失败不是最终验收失败。

## 复现

在仓库根目录使用Node>=22.13及pnpm；确保FFmpeg/FFprobe、Chrome、已登录Codex0.163.0可用。不要对真实用户库运行测试迁移。

```powershell
$env:Path=(Join-Path $PWD '.tools/bin')+';'+$env:Path
pnpm db:generate
pnpm test
pnpm typecheck
pnpm build
# 只用独立测试PG实例；不打印connection.json中的本地凭据
pwsh -NoProfile -File scripts/postgres-local.ps1 start
node tests/director/run.cjs
node tests/director/run.cjs --postgres
node tests/director/ui-protections.cjs
node scripts/director-evidence.cjs
node tests/director/verify-evidence.cjs
```

正常操作：创建项目→研究（需要时）批准→文稿批准→第05页真实导入/配音或静默时间轴确认并批准→第06页建立草稿→选择真实Codex和镜头数/导演要求→生成→查看Job审计和逐镜时间/引用→编辑并保存→刷新→提交/批准；修改批准版用Fork，历史版本可切换，差异展开查看前后内容。素材pending是需求，不能当作已找到；纯代码路线不需要媒体。新增镜头暂时超出总帧时应调整时长，负数/越界拒绝，剩余尾段归零后才可提交。

重跑相关回归时设置以下独立证据目录，避免覆盖既往阶段材料。`tests/render`必须使用**绝对**证据根路径，同时配置真实Chrome；研究/写稿/语音测试接受仓库相对路径：

```powershell
$env:STUDIO_UI_BROWSER_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:STUDIO_CHROMIUM_PATH=$env:STUDIO_UI_BROWSER_PATH
$env:STUDIO_TEST_PHASE_EVIDENCE_ROOT='docs/evidence/phase06/regression-voice'
node tests/voice/run.cjs
node tests/voice/run.cjs --postgres
# 对应script、research测试分别换为regression-script、regression-research后运行两库
$env:STUDIO_TEST_PHASE_EVIDENCE_ROOT=Join-Path $PWD 'docs/evidence/phase06/regression-render'
node tests/render/run.cjs
node tests/render/run.cjs --postgres
$env:STUDIO_TEST_REAL_AI_EVIDENCE_ROOT='docs/evidence/phase06/regression-real-ai'
node tests/real-ai/run.cjs
$env:STUDIO_TEST_REAL_AI_EVIDENCE_ROOT='docs/evidence/phase06/regression-claim-boundaries'
node tests/real-ai/run.cjs --claims-boundaries
node tests/real-ai/run.cjs --claims-boundaries --postgres
```

真实调用消耗现有账号额度；不要以Mock替代失败的真实调用。重跑生成会改变随机任务ID/模型创意，验收比较协议、稳定关系与帧约束，不要求文字逐字复现。音频已知拼接时间是manual，不是精确词级强制对齐；模型时间戳的历史精度限制、云神经TTS未配置和Windows异常UNCONFIRMED均继续保留。

本轮全部最终程序PASS；分组总数157，单位测试66。内嵌HTTP/workflow未重复计数。数据库二进制、会话、认证、模型权重及临时目录均未公开。运行完成停止应用/浏览器；测试库和数据留在忽略目录供私下复核，未删除已有数据。
