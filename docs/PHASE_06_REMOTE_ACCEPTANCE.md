# Phase06 最终远程验收复核

日期：2026-10-24。受检代码：[ad26a25e2bc01c9a22e95c4a4076b5ea09720f25](https://github.com/shenzhuW/Ai_Audio/commit/ad26a25e2bc01c9a22e95c4a4076b5ea09720f25)。已批准父基线：`0f2fa62bf4fd9ef6cde2ff21540fed71574b8258`。本轮仅准备远程验收与补证，未开发Phase07，未修改已验收业务源码、迁移或运行时权限。用户已授权安全核查后的正常快进推送；本报告在材料提交前形成，实际材料Hash与推送结果见最终交付回复和GitHub main。

## Git与公开提交检查

开始时工作区干净。`git fetch origin main`后远程仍为批准基线，`git rev-list --left-right --count origin/main...HEAD`为`0 1`，代码父提交与基线完全一致。提交前再次核对，正常快进推送原代码及独立材料提交，不force、不amend、不重写历史。

逐字节重新读取受检提交**全部284个文件的Git blob**，核对路径、大小、SHA256和blob SHA：[完整清单/安全扫描](evidence/phase06/remote/code-security-audit.json)。私有目录/数据库二进制/密钥/Token/JWT/认证JSON/签名会话/数据库凭据/超大文件规则无发现。原用户数据SHA与两库最初记录一致；没有读取Codex认证或交互会话目录。任务级CLI事件仅包含本轮自制测试的runId、最终JSON、状态及使用量，不含交互聊天历史、推理链或认证材料，不能把它与私有模型会话目录混为一谈。

- 最大文件：自制`fixtures/director/director-120s.wav`，**5,292,078 bytes**，FFprobe120.000000秒、22050Hz单声道PCM。四段中文文本由项目自撰，Windows Huihui系统声音生成，没有个人录音、身份信息或语音引擎分发；原文、合成脚本、拼接时间和SHA公开，适合作为本项目非敏感技术测试夹具。音频不冒充神经TTS，manual区间不冒充声学强制对齐。
- 284个文件合计47,200,882 bytes。没有超过10MiB的单文件。**13组相同内容**涉及两库同样的帧、MP4、零漂移/HTTP日志等，重复路径约5,743,875 bytes。Git对相同blob复用存储；保留各后端证据路径和原审核提交，不为清理重写历史。两个3.23MB MP4是可信自制Phase02回归产物，不是构建缓存。
- 新音频/图像/视频均为自制或既有可信自制回归产物，没有复制wallstreet样片、第三方新闻视频、用户上传原件或未确认素材。来源网页研究证据沿用既有公开技术文档/自制资料，不表示获得任意第三方商业许可。
- `.data/.cache/.tools`、数据库/会话/模型权重/构建缓存仍排除。规则有局限，结合夹具来源、截图及文件清单复核；不宣称能识别任意编码秘密。材料提交另经暂存检查。

## 十项重点复核

[机器核对报告](evidence/phase06/remote/review.json)包含两库固定ID、模型runId和逐项指标；[补拍/重启SQLite](evidence/phase06/remote/sqlite/browser-review.json)、[PostgreSQL](evidence/phase06/remote/postgresql/browser-review.json)为本轮实际执行。原157组结果逐文件核对，不冒称本轮再次完整运行157组或再次调用AI。

| # | 实际结论 | 证据 |
|---|---|---|
| 1 | 两库真实Codex0.163.0 / gpt-6.1-sol输出结构化DirectorShot；原始agent_message JSON与入库结果一致 | 原sqlite/postgresql目录的real-director-job.json、real-cli-events.jsonl；remote/review.json |
| 2 | 输入固定Script/Voice且在Job创建前已批准，配音已确认、绑定同文稿；目标版本变化后的结果TARGET_CHANGED，不覆盖编辑 | 固定inputRevisionIds、审批事件时间、原数据库快照；原主集成日志和本轮66单元 |
| 3 | 真实导入音频120秒，6镜30FPS，0到3600连续半开帧；每镜duration=end-start；总时长严格一致 | 原time-mapping.json、remote/ffprobe.json、原始输入/输出逐帧校验 |
| 4 | 一个段落可多镜，一个镜头可多段；批准历史实际保存这些映射，排序后ID稳定 | 两库database-snapshot.json及本轮browser-review.json |
| 5 | 编辑/新增/删除/重排/时长重算实际通过；未分配尾段明确显示且禁止提交；负数/非法空隙/重叠/越界拒绝 | 原主流程16/18组与UI专项4组；本轮66单元，补拍06-sorted-approved.png |
| 6 | 结构化结果包含叙事目标、观众收获、分层、转场/连续性、执行路线和检索意图；code格式none，pending有明确查询主题 | Zod校验真实结果；原始Job和remote-review.cjs |
| 7 | 段落、Claim、Source、Cue/anchor只来自固定允许集，时间段涵盖所有正在讲述段落；未知ID拒绝 | 真实结果引用核对、原边界HTTP日志、本轮单元；无锚点时明确按帧范围，不伪造Cue |
| 8 | code、bound、pending均实际保存；bound引用固定研究的真实图片元数据，pending没有media且保留assetRequirements | 原两库批准快照及本轮只读浏览器；未找到素材不等于已就绪 |
| 9 | 批准API/数据库不可覆盖，Fork稳定ID及前后差异、409/幂等、实际取消/租约释放/迟到保护通过；租约恢复与旧执行者fencing有测试 | 原主流程及UI专项、cancelled-director-job.json；本轮66单元。未把结构演示的Mock当真实生成 |
| 10 | 新批准文稿和配音使导演及全部6镜保守stale，两库重启后历史/Job/关系一致 | 本轮两库GET浏览器与两次应用启动；impact中scriptChanged/voiceChanged及6个affectedShotIds |

真实生成记录：SQLite run `01a16bd0-11e7-7a62-b621-3dd12a253c19`，93,545ms；PostgreSQL run `01a16bd0-3714-71a3-86a7-53fe4132a08c`，98,857ms。usage在原Job，账号剩余额度未知。本轮复核未产生新的模型调用，补拍显示的是原成功任务及其审计。

## 本轮实际运行与原始记录

| 本轮命令 | 结果 |
|---|---|
| `node tests/director/remote-audit.cjs` | 284个受检blob，0发现；大小/重复项清单保存 |
| `pnpm test` | 66/66，0失败/跳过，见remote/logs/unit.log |
| `pnpm typecheck` / `pnpm build` | PASS，见remote/logs；旧voice CSS autoprefixer兼容性警告仍保留 |
| `node tests/director/remote-browser.cjs`，另加`--postgres` | 各3组，共6组PASS；仅GET，两次应用启动，用户数据不变，pageErrors为空 |
| `node tests/director/remote-review.cjs` | PASS；实际模型JSON、批准时点、帧/引用/路线/分合镜、原157组结果逐项核对 |
| `git diff <code> -- apps/web/src apps/web/prisma ...` | 业务源码、迁移、Codex/Render运行时与受检代码一致 |

原始SQLite16/PG18导演、语音12/14、文稿9/11、研究15/16、真实AI SQLite9、Claim边界4/5、渲染11/13及UI专项4组均可读取：[原汇总](evidence/phase06/summary.json)、[原完整日志](evidence/phase06/logs/)、[迁移/重复执行](evidence/phase06/postgresql/migrations.log)、[零漂移](evidence/phase06/postgresql/schema-drift.log)。本轮没有对真实用户库做迁移。受检阶段已验证的迁移/回归记录保留，不篡改其执行日期。

## 截图与操作复核

[截图索引](evidence/phase06/remote/README.md)列出生成完成审计、编辑、排序、冲突、批准、Fork前后差异及移动端。排序补拍来自真实批准历史，对比原模型shotId顺序已确认首两镜交换；不是重建的静态原型。两库补拍只发GET，不改变历史。原冲突/增删排序/批准/Fork交互为已保存的实际浏览器自动化记录，并非用户已人工体验或听审。

复现：先`pnpm build`，启动独立本地PG测试实例，再运行remote-browser两库。脚本只打开原自制验收目录`.cache/phase06/<runId>`及`studio_phase06_<runId>`，缺失时明确失败，不用Mock补齐。浏览器代码阻止非GET/HEAD的API请求。复核完关闭测试服务并停止本轮启动的PG，不删除数据。

## 安全与风险边界

Codex数据运行时、服务桥及可信Render Worker与已验收版本字节一致。导演任务搜索关闭，禁Shell/补丁、MCP服务/插件/Hook；独立数据目录、白名单环境、超时、取消及租约fencing继续有效。导演数据不触发Git、源码修改或不相关文件读取。没有新增Phase07找片、下载、批量匹配或裁剪，也未开放自由TSX。

D-17/D-18继续适用：内部候选不因缺商业许可自动阻断，来源/限制保留，不绕过DRM、访问控制或明确下载限制，不自动公开发布作品。推送自制技术夹具不代表产品增加公开发布流程。

Windows历史两次原生异常继续**UNCONFIRMED**。原阶段PG研究批次及渲染Worker中断、独立重跑与过期测试租约恢复记录保持在attempts，不因本轮成功删除或声称根因修复。Whisper中文识别/停顿/词界误差和云端神经TTS未配置继续披露。120秒样例的manual拼接范围不是词级声学金标准。

本轮新增仅测试复核脚本、脱敏审计/日志/截图、正式报告与索引。原受检代码不变；独立材料提交后正常快进推送，完成后停止等待Phase06最终审核，**不进入Phase07**。
