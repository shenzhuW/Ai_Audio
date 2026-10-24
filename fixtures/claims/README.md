# 候选 Claim 可复现样例

`source-a.txt` / `source-b.txt` 是本项目自制、可公开使用的虚构测试记录：同一虚构样品 Z 的标注分别为32和64单位。它们是实际上传并提取的文件，但绝不是现实世界测量或已核实事实。

主链路验收先通过 Codex live 搜索公开 FFmpeg 官方文档，由现有受约束获取器独立保存原始响应与提取文本，再生成候选。网页可能变化；各次实际 URL、原件/提取文本 SHA、字符位置、model/runId 见 `docs/evidence/phase045-claims/{sqlite,postgresql}/candidate-grounding.json`。完整网页原件留在隔离测试数据目录，不提交数据库、会话或私人输入。

```powershell
$env:STUDIO_CODEX_ENABLED='1'
node tests/real-ai/run.cjs --claims-supplement
node tests/real-ai/run.cjs --claims-supplement --postgres
node tests/real-ai/run.cjs --claims-boundaries
node tests/real-ai/run.cjs --claims-boundaries --postgres
```

需先完成 `pnpm build`，本机已登录且版本为已验证的 Codex CLI 0.163.0、Chrome、FFmpeg/FFprobe；PostgreSQL 使用 `pnpm db:local start` 的独立本地测试实例。程序创建唯一测试数据库/目录，不迁移或删除用户数据。真实调用消耗账户额度；剩余额度未知，不承诺免费。上述命令会写验收目录，重跑前保留已有失败和成功证据。

手动流程：研究草稿 → 上传两份文本 → 各自执行本地真实分析 → “从原文生成候选 Claim” → 核对双来源、引用位置及冲突提示 → 修改并保存候选/刷新 → 接受或拒绝。接受后正式 Claim 应仍未核实或冲突；批准研究后只读。可从该已批准研究创建文稿，在第04页选择新 Claim/Source，整体/局部写稿保持固定引用。
