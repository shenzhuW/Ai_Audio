# Phase 04.5 — Codex 优先的真实搜索、视觉与口播生成

状态：2026-10-23 用户批准，已完成本地交付，正在按另行授权整理最终远程验收材料。基线 Phase 04 最终材料 `881e1022ea27638bf7a3c7364c55871802c56fe5`；Phase 05 暂停。此前本文件不存在，本次根据用户已确认范围新建，不能宣称旧计划已执行。

## 路线与实施顺序

1. **先 Codex CLI PoC**：检查本机版本、ChatGPT 登录状态及帮助；不读取/打印 auth.json、Token 或账户标识。核对官方非交互、结构化输出、搜索/图片、安全和计划额度说明。开工查到CLI0.163.0、ChatGPT已登录，随后能力实际验证见下方完成项和交付。
2. **先通过安全门禁再发送真实任务**：每任务独立目录、冻结输入；read-only、approval never、禁用 Shell/修改工具、MCP/插件/浏览器/Hook/外部技能/记忆；只开放按任务需要的服务端 live 搜索或直接图片附件。通过固定版本源码和对抗 PoC 检查实际可用工具；不能仅依赖提示词或只读沙箱宣称阻止凭据读取。若不能满足，禁止把用户/网页不可信内容接到运行时，明确阻碍并评估安全替代。
3. 分别实际验证 `codex exec --json --output-schema` 的 live 搜索、结构化文稿、图片和 FFmpeg 关键帧理解。所有验证使用自制非敏感输入；设置时间/输出/图片限额，取消终止完整进程树。保存模型、运行 ID、搜索模式、事件摘要、真实输出、时长、token 使用/可获得的额度信息与失败原因。未暴露额度时写 unknown，不推算免费或无限。
4. CLI 成功后评估 `@openai/codex-sdk` 版本、许可证、底层执行/事件/取消/配置控制；优先能保留已验证安全边界的集成。不需要持久对话则不引入 app-server；只有确有会话/审批/流式权限需求才进一步评估。禁止使用会话内开发工具当服务接口，禁止直接复用/导出登录 Token 自造私有 API。
5. 实现可替换 Research/Script Provider，复用原 Worker/Job/Outbox、心跳/租约/fencing/幂等/取消和审核。保留 real/mock/unconfigured 三态，兼容既有 API 与用户数据。只有真实成功结果可写 real。
6. 搜索标题、URL、模型摘要和来源追踪持久化；受约束获取器独立获取网页原文，验证 DNS/IP、重定向、类型、大小/超时并保留散列和引用位置。明确区分搜索摘要、模型分析与真实原文；未提取成功的页面不能产生 matched 证据，Claim 不自动核实。
7. 图片实际视觉描述作为模型分析索引；视频继续用原 FFmpeg 抽帧，逐帧分析绑定源 Blob SHA256 和原始毫秒时间。不是视频音轨理解，不正式裁剪，不冒充完整 OCR/ASR。
8. 真实文稿结果通过现有 ScriptSegment Zod、稳定 ID 与 Claim/Source 允许集验证；整体/局部写作、固定研究修订、晚到结果、批准只读、409 与下游依赖规则不变。不得生成新来源或无证据 verified。

## 验收与证据

- [x] CLI 实时搜索实际事件 + 真实标题/URL/摘要；独立原文获取/失败状态可复现。
- [x] CLI Schema JSON、真实写稿、图片输入均实际执行，不用 Mock 代替。
- [x] 真实视觉描述绑定图片/FFmpeg 视频帧、源时间码；技术元数据与理解结果分开。
- [x] Codex SDK 集成取舍记录；如不满足隔离要求明确拒绝开放该入口，不降级成不安全执行。
- [x] 原 Worker 上搜索/视觉/文稿持久化，Provider/模型/运行与使用审计可查询。
- [x] 超时、取消、错误/额度、恶意提示和不允许工具的边界测试；真实私有文件不作为攻击测试内容。
- [x] SQLite / PostgreSQL 集成、类型检查、单元、生产构建、真实浏览器与原阶段相关回归；不迁移真实用户库。
- [x] `docs/PHASE_04_5_DELIVERY.md`、真实日志/截图/可复现样例；列全部通过、失败、阻碍和未实现能力。

实际实现：固定CLI0.163.0、真实gpt-6.1-sol；只使用已授权ChatGPT登录。独立V8 Code Mode Host是本版本live搜索所需的数据计算环境，实际拒绝Node文件导入；Shell/补丁/MCP服务等禁用，三个无服务器的原生MCP资源辅助入口仍可见，未声称全OS沙箱。SDK0.164.0只做源码评估，缺少本次隔离开关故暂留CLI；无剩余额度接口，记录unknown而非猜测。36项单元、真实SQLite9组/PG10组、浏览器和相关双库回归通过；完整失败/修正记录见[交付](../docs/PHASE_04_5_DELIVERY.md)。

## 明确不做

不购买额外 API/服务、不承诺永久免费，不使用 --yolo/绕过审批沙箱；不执行输入生成的 Shell/源码/Git 操作，不开放自由 TSX，不改变审批流程、不开发 Phase 05。本阶段提交/推送遵守 AGENTS.md；本轮用户已单独授权安全核查后的本地提交与正常快进推送，阶段正式验收仍待审核。

## 官方依据（2026-10-23 实读）

- [非交互执行](https://learn.chatgpt.com/docs/non-interactive-mode)：CLI 复用已保存登录、JSON 事件及 Schema 输出。
- [SDK](https://learn.chatgpt.com/docs/codex-sdk)：服务端 TypeScript SDK 与 app-server 的边界。
- [配置](https://learn.chatgpt.com/docs/config-file/config-reference)：shell_tool、搜索模式和权限配置；实际以固定本机版本和 PoC 为准。
- [用量与额度](https://learn.chatgpt.com/docs/pricing)：受套餐、模型、任务和额度约束，实时剩余以用户 usage dashboard 或 /status 为准；不得把 ChatGPT 登录说成外部 API 余额或永久免费。
