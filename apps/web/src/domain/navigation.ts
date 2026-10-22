export const pages = [
  { key: 'new', label: '创建视频', description: '从主题、已有文稿或资料开始，定义这一次创作。' },
  { key: 'overview', label: '项目总览', description: '项目需求、阶段产物与制作进度，一处掌握。' },
  { key: 'research', label: '研究资料', description: '保留来源与证据，让每一个观点有据可查。' },
  { key: 'script', label: '口播文稿', description: '以清晰叙事串联研究，让复杂的知识容易理解。' },
  { key: 'voice', label: '配音时间轴', description: '声音、字幕与画面，共用一条明确的时间基准。' },
  { key: 'storyboard', label: '分镜与素材', description: '围绕观众理解目标，为每个镜头安排画面。' },
  { key: 'assets', label: '资产管理', description: '统一管理原始资料、候选片段和制作引用。' },
  { key: 'motion', label: 'AI 动画制作', description: '让真实素材与可编辑的代码动画共同表达。' },
  {
    key: 'review',
    label: '成片预览与审核',
    description: '在具体时间点审阅画面，记录需要改进的细节。',
  },
  { key: 'export', label: '导出成片', description: '检查最终版本，交付视频、字幕与来源清单。' },
] as const;
export type Stage = (typeof pages)[number]['key'];
export const stagePath = (id: string, stage: Stage) =>
  stage === 'new' ? '/projects/new' : `/projects/${id}${stage === 'overview' ? '' : '/' + stage}`;
