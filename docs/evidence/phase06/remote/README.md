# Phase06 远程验收与截图索引

[正式复核报告](../../../PHASE_06_REMOTE_ACCEPTANCE.md) · [机器复核](review.json) · [284文件扫描/大小/重复清单](code-security-audit.json)。本轮重新运行66项单元、类型/构建，以及两库6组只读浏览器/重启检查。原157组记录只核对，未声称全部重跑或重新调用模型。

新增材料暂存字节清单及扫描：[material-security-audit.json](material-security-audit.json)。最终包含审计文件自身的扫描另存本地，避免自引用Hash。

| 页面证据 | SQLite | PostgreSQL/补充 |
|---|---|---|
| 真实AI生成完成、模型runId/耗时/状态 | [补拍](sqlite/06-real-generation-audit.png) | [补拍](postgresql/06-real-generation-audit.png) |
| 导演工作台和已保存镜头 | [原图](../sqlite/06-director-workbench.png) | [原图](../postgresql/06-director-workbench.png) |
| 编辑后保存刷新 | [原图](../sqlite/06-edited-persisted.png) | [原图](../postgresql/06-edited-persisted.png) |
| 排序后的批准历史与时间轴 | [补拍](sqlite/06-sorted-approved.png) | [补拍](postgresql/06-sorted-approved.png) |
| 409保留编辑内容 | [原交互](../ui-protections/sqlite/06-conflict-buffer.png) | [原测试结果](../ui-protections/sqlite/results.json) |
| 已批准只读 | [原图](../sqlite/06-approved-readonly.png) | [原图](../postgresql/06-approved-readonly.png) |
| Fork与逐镜修改前后内容 | [原图](../ui-protections/sqlite/06-before-after-diff.png) | [PG Fork](../postgresql/06-fork-diff.png) |
| 移动端 | [原图](../sqlite/06-mobile.png) | [原图](../postgresql/06-mobile.png) |
| 静默/显式Mock | [原图](../sqlite/06-silent-explicit-mock.png) | 仅结构演示，不替代真实AI结果 |

[本轮SQLite检查](sqlite/browser-review.json)、[PostgreSQL检查](postgresql/browser-review.json)、[重新FFprobe](ffprobe.json)、[原自制音频与文本](../../../../fixtures/director/README.md)。原CLI最终JSON与真实Job逐结构匹配；未知ID、非法时间、取消/迟到及不可变保护另见原主测试日志和本轮单元日志。

```powershell
pnpm test
pnpm typecheck
pnpm build
node tests/director/remote-audit.cjs
pwsh -NoProfile -File scripts/postgres-local.ps1 start
node tests/director/remote-browser.cjs
node tests/director/remote-browser.cjs --postgres
node tests/director/remote-review.cjs
```

仅使用仍保留的自制验收数据；缺失则失败，不创建假结果。API与浏览器仅GET/HEAD，截图是在真实页面选择历史或查看成功任务，不重新生成模型内容。原数据不覆盖。Windows异常UNCONFIRMED、Whisper时间精度及神经TTS未配置风险保留，详见正式报告。
