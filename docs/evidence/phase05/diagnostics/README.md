# 失败与边界记录

- 本机既有Conda Python3.8导入旧Whisper时，numba报`initialization of _internal failed without raising an exception`，并有重复numpy DLL警告。没有修改全局环境；新建无system-site-packages的项目内venv，固定依赖后实际ASR/align均成功。安装日志留在忽略目录`.cache/phase05/speech-clean-install.log`，不公开机器pip配置。
- 第一版测试脚本把每次请求的requestId纳入幂等比较、使用同步worker阻塞HTTP客户端、未等audio readyState就断言进度、错用控件定位/按钮文案/viewport方法，以及保存报告函数和请求变量重名。这些是已修正的测试程序缺陷；不能用先前部分成功代替完整验收。最后`voice-*.log`及results来自修正后的全流程实际重跑。
- 资源时长限制曾有单元红测（缺少错误抛出），已在voice-save应用现有可配置上限；第一次模型映射也是先红后绿。红测日志留在`.cache/phase05/*red.log`。
- 真实ASR测试故意先禁用引擎，再设1000ms超时，最后正常重试；每库三次尝试的失败原因/运行时间/模型结果均保存在real-asr.json。无部分字幕写入，超时/取消后模型PID退出，任务租约清空；这些预期错误属于通过的边界断言。
- [第一次PG真实Codex回归](real-ai-postgres-first.json)在并行生产构建期间，真实搜索/视觉/候选生成已经成功，但浏览器停留SSR“正在读取研究资料”，等候选编辑框超时；pageErrors为空，未获取到足以独立确定根因的网络跟踪。共享`.next`被构建替换是测试组织上的干扰因素，不能把此次运行记为通过。固定构建后独立从头重跑，最终结论见regression-real-ai/postgresql/results.json及对应日志。未修改旧研究/文稿业务代码或放宽CLI门禁。
- 旧Phase04.5两次Windows原生退出`0xC0000409`继续保持**UNCONFIRMED**，原证据保留。此次Python依赖问题、超时杀进程和浏览器加载超时不能认定是旧异常根因，也不以成功重跑删除旧风险。
- Phase02渲染回归首轮仅设置了UI浏览器，Worker缺少STUDIO_CHROMIUM_PATH，实际报CHROMIUM_NOT_CONFIGURED/RENDER_PROCESS_FAILED，见[首轮记录](render-sqlite-first.json)。按原渲染文档显式设置渲染及UI两个浏览器变量后独立重跑；不更改已验收渲染源码，不将未运行的视频验证写为通过。
- Whisper base真实中文识别有繁简体/同音错误；给定文稿align也出现一个零时长词，保留raw记录，不平均插值补造词时间。模型精度需要用户听校；没有人工金标准误差评测，不能宣称毫秒准确。
