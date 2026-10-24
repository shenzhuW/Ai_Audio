# Phase04.5 候选 Claim 补充证据

[交付报告](../../PHASE_04_5_CLAIM_SUPPLEMENT.md) · [核对](verification.json) · [文件SHA](manifest.json) · [自制原件](../../../fixtures/claims/README.md)

| 证据 | SQLite | PostgreSQL |
|---|---|---|
| 真实闭环及旧AI回归 | [13组](sqlite/results.json) | [14组](postgresql/results.json) |
| 实际候选/逐字quote/来源/字符位置/双SHA | [定位](sqlite/candidate-grounding.json) | [定位](postgresql/candidate-grounding.json) |
| 无原文/Provider/冲突/重试/Fork | [4组](boundaries/sqlite/results.json) | [5组](boundaries/postgresql/results.json) |
| 双来源冲突真实模型结果及失败尝试 | [调用](boundaries/sqlite/real-conflict-candidates.json) | [调用](boundaries/postgresql/real-conflict-candidates.json) |
| 来源/审核/正式映射快照 | [研究](sqlite/research-snapshot.json) | [研究](postgresql/research-snapshot.json) |
| 固定引用和稳定段落 | [文稿](sqlite/script-snapshot.json) | [文稿](postgresql/script-snapshot.json) |
| 候选生成 | [截图](sqlite/03-candidates-generated.png) | [截图](postgresql/03-candidates-generated.png) |
| 实际编辑/刷新后接受 | [截图](sqlite/03-candidate-accepted.png) | [截图](postgresql/03-candidate-accepted.png) |
| 最终批准只读 | [截图](sqlite/03-candidate-approved-final.png) | [截图](postgresql/03-candidate-approved-final.png) |
| 最终移动端 | [截图](sqlite/03-candidate-mobile-final.png) | [截图](postgresql/03-candidate-mobile-final.png) |
| 真实整体/局部写稿 | [截图](sqlite/04-real-script.png) | [截图](postgresql/04-real-script.png) |
| 最终截图校验 | [captures](sqlite/captures.json) | [captures](postgresql/captures.json) |

- [45项单元](logs/unit.log)、[类型](logs/typecheck.log)、[构建](logs/build.log)、[全部日志](logs/)。
- [21次CLI事件投影](remote/cli-event-projection.json)、[真实注入与脱敏argv/环境](remote/injection-canary.json)。只公开允许字段；原始提示、推理、全文事件和认证不提交。公开候选/文稿基于公开文档或自制非敏感测试资料，已人工复核。
- [Phase03回归](regression-phase03/)、[Phase04回归](regression-phase04/)，含既有HTTP/Workflow和PG迁移/零漂移验证。
- [首次浏览器失败及诊断](failures/)。原两次Windows异常保持UNCONFIRMED，见原报告，与本次H.264兼容问题分别记录。

操作：研究草稿添加/采用来源 → 真实提取 → 从原文生成候选 → 核对来源/引文/限制/冲突 → 编辑并保存 → 刷新核对 → 接受或拒绝 → 批准研究 → 创建研究起点文稿 → 绑定新Claim/Source → 整体或局部真实写稿。批准/历史只读，Fork后须重新生成新修订候选。

完整原件、数据库、会话、CLI临时输入/输出及原始事件留在本机忽略目录。公开快照以SHA/长度替代原文全文；逐字比较在实际HTTP测试中执行。日志归档统一LF并去行末空白，原输出保存在本机.cache，测试内容和失败信息不变。verification仅交叉核对已执行证据，不代表新模型调用或Mock验收。
