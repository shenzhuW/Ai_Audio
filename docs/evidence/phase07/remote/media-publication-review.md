# 媒体公开提交审查

审查对象为代码提交 `0240d6ef8a5e674598ff46758c4bca0f1e8fa9e3` 全部236个文件和本轮新增证据；逐文件大小/SHA见[代码扫描](code-security-audit.json)、[媒体清单](media-inventory.json)。以下是这批具体素材的公开验收用途判断，不是项目内商业授权审批。

| 文件/类别 | 来源与提交适用性 |
|---|---|
| fixtures/assets/gpu-two-scenes.mp4；两库local-contact-sheet.jpg；internal-poc.mp4及全部remotion-frame/keyframe；本轮mp4-at-*s.jpg | 自制蓝/绿GPU几何示意，生成程序scripts/asset-fixtures.cjs、参数/SHA见fixtures/assets。自制视频按CC0-1.0提供；无人物/私人音频/第三方片段。成片沿用可信预置React/SVG及现有已验收字体，不引入新字体文件。适合公开技术验收 |
| 两库external-contact-sheet.jpg（每份46,212字节）；页面内同图 | NASA PIA00342“The Earth & Moon”，NASA/JPL/USGS；来源[NASA条目](https://science.nasa.gov/photojournal/the-earth-and-moon/)。提交480宽解码衍生图；122,699字节下载原图不提交。标注来源，用于检索/分析技术说明，不暗示NASA背书；不将系统unknown标签改写为商业授权 |
| providers/commons-image-contact.jpg（53,022字节） | [Blue Marble Eastern Hemisphere](https://commons.wikimedia.org/wiki/File:Blue_Marble_Eastern_Hemisphere.jpg)，NASA images by Reto Stöckli, based on data from NASA and NOAA；文件页标为美国公有领域，保留署名/来源。是合成东半球图，不能误称Apollo17原片。409,242字节下载原图不提交 |
| providers/nasa-video-contact.jpg（25,737字节） | [How Sunlight Pushes Asteroids，SVS11964](https://svs.gsfc.nasa.gov/11964/)，NASA's Goddard Space Flight Center，动画/旁白/写作Chris Smith，制作Chris Smith、Dan Gallagher；仅6帧低分辨率联系表，不含旁白/音乐，作为实际解码/时间码技术证据。来源页有公开下载和署名。原24,938,123字节MP4不提交 |
| 第06/07/08页、final-ui和本轮remote/*/07-source-playback.png | 本项目真实页面，仅合成测试项目/自制媒体与上述NASA图片缩略图。没有私人会话Cookie、用户资料、认证页面或个人音频；适合公开验收 |
| regression/各阶段页面、研究帧及self-authored-chart.png | 重跑已有非敏感夹具生成的本项目截图、自制图表和自制测试视频帧。没有新增私人素材或模型认证输入。保留公开研究来源标题/URL与合成测试内容；实际模型输出仅针对自制/公开测试输入 |

NASA说明允许符合条件的资料性使用，要求注明来源，并提醒其站点可能包含第三方版权内容、人物和标识限制；参见[官方使用指南](https://www.nasa.gov/nasa-brand-center/images-and-media/)。上述两个NASA条目已逐项核对来源/署名；此仓库仅保留必要低分辨率审查图，不宣称站内所有媒体均可自由再分发。Commons条目的公有领域标签仅陈述来源页现状。

第三方下载原件、数据库、Codex认证、原始会话/私有模型输入输出仍在忽略目录；没有为验收复制进Git。原始受检SHA及实际技术参数已在providers/results.json和各库external-source.json、FFprobe中保留，可追溯原文件。本轮没有自动发布创作视频到外部平台；用户授权的GitHub验收MP4只有自制背景。

重复媒体仅保留两库各自产物路径及关键帧别名，12组相同字节由Git对象去重；不改写已受检提交。最大文件约1.66MB，无大型第三方原片、模型权重或缓存。
