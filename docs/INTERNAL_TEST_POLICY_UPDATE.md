# 内部开发测试素材策略 · 2026-10-23

已将用户本轮决策记录为 [D-17/D-18](DECISIONS.md)，替换 MVP 中“非 cleared 不得合成或导出”的规则。商业许可未知或不可商用素材不因标签被自动放弃，可进入内部测试候选、分镜、自动裁剪、Remotion 合成及 MP4 保存/播放/对比/下载。

排序优先语义相关性、内容质量、画幅、镜头构图、清晰度与片段时间匹配；不开发商业许可审批。来源 URL、平台、作者（如有）和已知限制持续保存，缺失信息标未知，不伪造可商用标签。内部视频不自动公开发布；商业发布的素材替换、授权核查与发布控制留后续。

用户第 6 项提出绕过 DRM、访问控制、付费墙或明确禁止下载机制：该项未作为实现授权，仍使用公开可访问、用户提供或有相应访问权限的资源，不破解/规避访问保护。软件依赖、字体和源码分发许可证也不被素材内部测试策略替代。

## 修改范围

- 指定文件：AGENTS.md、DECISIONS.md、PRD.md、ASSET_RESEARCH_SPEC.md、plans/07-asset-engine.md、plans/09-review-export.md。
- 关联规范：DATA_MODELS.md、API_SPEC.md、UI_SPEC.md、ARCHITECTURE.md、WORKFLOWS.md、MOTION_SCENE_SPEC.md、SECURITY_QUALITY.md、TRACEABILITY.md、REFERENCE_PROJECTS.md。
- 同步计划/记录：plans/06-director.md、tests/ACCEPTANCE.md、README.md、CHANGELOG_IMPLEMENTATION.md。
- 在素材规范与 Phase 07 明确 wallstreet-explainer 的 footage.py/sourcing.md 研究重点：找片、镜头索引、片段定位、联系表预览、自动裁剪、画面匹配；当前没有提前研究全部源码或实现素材引擎，不把计划当作完成。

本次只做上述文档同步，不改 Phase 00–01 代码/数据/已审核报告，不增加商业许可系统，不影响 Phase 02 使用自制几何视频的既定技术闭环。未来 A-018/A-025 仍为 NOT RUN；文档规则检索和 Git 差异检查通过，后续功能需要到对应阶段实际验证。
