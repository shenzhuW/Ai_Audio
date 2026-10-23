# Phase 02 测试素材来源

## background.mp4

本项目用 FFmpeg color/drawgrid/drawbox/rotate 滤镜自行生成的 10 秒几何运动视频，没有引用第三方拍摄画面、人物或商标。来源平台：本地生成；来源配方：[render-fixtures.cjs](../../scripts/render-fixtures.cjs)。原文件及配方/散列记录在 [asset-manifest.json](public/asset-manifest.json)，不覆盖用户上传文件。本文件作为本项目内部测试的来源说明，不向其他未知素材授予许可。

## NotoSansSC-subset.woff2

- 来源：Google Fonts Noto Sans SC，按本预置组件实际字符集通过 Google Fonts 官方 CSS2 接口取得 WOFF2 变量字体子集；2026-10-23 下载，响应存于 [font-source.css](public/font-source.css)。不在运行时访问字体 CDN。
- 作者/版权：Adobe；具体版权及 Reserved Font Name 以随附 [OFL.txt](public/OFL.txt) 为准。
- 许可：SIL Open Font License 1.1，字体文件继续适用该许可和署名，不改变本仓库或 Remotion 的许可证。原许可来源：[google/fonts/ofl/notosanssc/OFL.txt](https://github.com/google/fonts/blob/main/ofl/notosanssc/OFL.txt)。
- 字体不是事实/数据来源，图表数值为明确标记的合成测试数据。

## 渲染软件

Remotion core / renderer / bundler 固定 4.0.538，许可证为其 Remotion License，不能称作 MIT。此阶段为非商业本地技术评估；商业上线/自动化适用条件由负责人另行核查，见 [官方 FAQ](https://www.remotion.dev/docs/license/faq)。本项目没有购买服务或修改许可证。系统 FFmpeg/FFprobe 与 Chromium 为现有开发工具，不作为本项目自有二进制再分发；运行版本见交付证据。

内部素材测试策略见 D-17/D-18；这一策略不修改第三方软件或字体许可证，也不允许破解访问保护。
