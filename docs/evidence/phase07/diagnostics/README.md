# 失败与修正记录

| 记录 | 结论 / 修正 |
|---|---|
| first-worker-start-failure / initial-workers | domain/asset.ts单复数错误；修正为assets.ts，实际Worker重新通过 |
| first-audit-aggregation-failure | AI实际运行保存在assetResult.aiRuns，但Job顶层未归并；补充归并与严格真实证据回归 |
| freeze-before-fix | 输出-t截断末帧补齐；trim/setpts→tpad；真实RGB/FFprobe/缓存回归 |
| *http-idle-harness-failure | Remotion真实任务已成功；测试器长时间spawnSync后API连接失败，改异步等待/独立连接后原库续跑 |
| *timeout-classification-before-fix | 超时后晚到IPC覆盖latest导致显示INTERRUPTED；单独timedOut，不再以日志文本判断原因 |
| *resume-helper-before-fix | 测试器提取续跑函数后漏bind作用域；补回，非业务数据丢失 |
| *voice-regression-fixture-before-fix | 测试Fork后传空Cue但保留旧字幕，正确被422拒绝；夹具传入真实Cue后通过 |
| regression-browser-without-h264 | 默认Playwright Chromium未载入视频，显式使用既有系统Chrome后完整重跑通过 |

另：公开视频首次探测最后一帧失败，实际FFprobe显示视频流123.5秒，容器123.843秒；改用视频流末尾后成功，providers/results与media-regression保留真实参数。未保留任何凭据、用户原件或登录日志。单元测试开始时尝试tsx失败（仓库无该依赖），随后使用既有register-typescript加载器执行，不引入新依赖。

历史Windows原生异常不是这些确定性代码/测试器问题；仍为UNCONFIRMED。
