'use client';
import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Upload,
  Sparkles,
  FileText,
  Lightbulb,
  X,
  ShieldCheck,
  Clock3,
} from 'lucide-react';
import {
  CreateProjectSchema,
  ProjectSchema,
  parseDuration,
  formatDuration,
} from '@/domain/project';
import { Card, Badge, PageHead, Notice, s } from './ui';

export function ProjectForm({
  maxDurationMs,
  maxUploadBytes,
}: {
  maxDurationMs: number;
  maxUploadBytes: number;
}) {
  const [entry, setEntry] = useState<'topic' | 'script' | 'upload'>('topic');
  const [voice, setVoice] = useState<'tts' | 'import' | 'none'>('tts');
  const [files, setFiles] = useState<File[]>([]);
  const [duration, setDuration] = useState('2:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  let durationHint = '';
  try {
    durationHint = `${formatDuration(parseDuration(duration))} · ${parseDuration(duration) / 1000} 秒`;
  } catch {
    durationHint = '支持秒数或分:秒';
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setFieldErrors({});
    const f = new FormData(e.currentTarget);
    try {
      let ms: number;
      try {
        ms = parseDuration(duration);
      } catch (e) {
        setFieldErrors({ duration: (e as Error).message });
        return;
      }
      const vertical = f.get('aspect') === '9:16';
      const parsed = CreateProjectSchema.safeParse({
        title: f.get('title'),
        prompt: f.get('prompt'),
        targetDurationMs: ms,
        width: vertical ? 1080 : 1920,
        height: vertical ? 1920 : 1080,
        fps: 30,
        entryType: entry,
        voiceMode: voice,
        language: f.get('language'),
        style: f.get('style'),
        audience: f.get('audience'),
        budgetLimit: { currency: 'CNY', amount: Number(f.get('budget')) },
      });
      if (!parsed.success) {
        setFieldErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
        setError('请检查标注的输入项。');
        return;
      }
      if (ms > maxDurationMs) {
        setFieldErrors({ duration: `当前配置最多 ${maxDurationMs / 1000} 秒` });
        return;
      }
      if (files.length > 5 || files.reduce((n, f) => n + f.size, 0) > maxUploadBytes)
        throw new Error(`最多 5 个文件，总计不超过 ${maxUploadBytes / 1024 / 1024} MB`);
      if (entry === 'upload' && files.length === 0)
        throw new Error('从资料开始时，请至少选择一个文件。');
      const body = new FormData();
      body.set('brief', JSON.stringify(parsed.data));
      files.forEach((file) => body.append('files', file));
      setBusy(true);
      const response = await fetch('/api/v1/projects', { method: 'POST', body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || '保存失败，请重试');
      const project = ProjectSchema.parse(result.data);
      // A newly persisted project has no useful client cache. Navigate directly so
      // creation cannot be stranded by Next 15's client navigation/prefetch state.
      window.location.assign(`/projects/${project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请重试');
      setBusy(false);
    }
  }
  const fieldError = (name: string) =>
    fieldErrors[name] ? (
      <span className={s.fieldError} id={`${name}-error`}>
        {fieldErrors[name]}
      </span>
    ) : null;
  return (
    <form onSubmit={submit} noValidate>
      <PageHead
        number="01"
        title="创建视频"
        description="从主题、文稿或资料开始。把想法变成有依据、有表达的视频。"
      >
        <button type="submit" className={s.primary} disabled={busy}>
          {busy ? '正在保存…' : '创建并保存项目'}
          <ArrowRight size={16} />
        </button>
      </PageHead>
      {error && (
        <div role="alert" className={s.error}>
          {error}
        </div>
      )}
      <div className={s.split}>
        <div className={s.stack}>
          <Card title="描述你的创作需求" aside={<Badge>创作简报</Badge>}>
            <label className={s.label} htmlFor="prompt">
              {entry === 'script'
                ? '已有口播文稿'
                : entry === 'upload'
                  ? '希望如何使用这些资料'
                  : '想讲什么，讲给谁听'}
            </label>
            <textarea
              id="prompt"
              name="prompt"
              className={s.textarea}
              rows={5}
              maxLength={50000}
              placeholder={
                entry === 'script'
                  ? '粘贴已经写好的文稿，保留你自己的表达…'
                  : '例如：制作一条关于「为什么 AI 大模型需要大量 GPU」的科普视频。用通俗的语言解释并行计算，配合资料画面与代码动画，帮助非技术观众理解。'
              }
              aria-invalid={!!fieldErrors.prompt}
              aria-describedby={fieldErrors.prompt ? 'prompt-error' : undefined}
            />
            {fieldError('prompt')}
            <div className={s.formGrid}>
              <label className={s.field}>
                项目标题
                <input
                  name="title"
                  maxLength={120}
                  placeholder="为这次创作起一个名字"
                  aria-invalid={!!fieldErrors.title}
                />
                {fieldError('title')}
              </label>
              <label className={s.field}>
                视觉风格
                <select name="style">
                  <option>科技感 / 清晰克制</option>
                  <option>财经观察 / 数据叙事</option>
                  <option>知识科普 / 轻松易懂</option>
                </select>
              </label>
            </div>
            <div className={s.formGrid3}>
              <label className={s.field}>
                目标时长
                <input
                  name="duration"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  aria-invalid={!!fieldErrors.duration}
                  aria-describedby="duration-help"
                  placeholder="30 或 4:00"
                />
                <small id="duration-help">{durationHint}</small>
                {fieldError('duration')}
              </label>
              <label className={s.field}>
                视频比例
                <select name="aspect">
                  <option value="9:16">9:16 · 竖屏</option>
                  <option value="16:9">16:9 · 横屏</option>
                </select>
                <small>默认 1080p · 30 FPS</small>
              </label>
              <label className={s.field}>
                内容语言
                <select name="language">
                  <option value="zh-CN">简体中文</option>
                  <option value="en-US">English</option>
                </select>
                <small>语言偏好会随项目保存</small>
              </label>
            </div>
            <label className={s.field}>
              目标观众
              <input name="audience" defaultValue="对科技感兴趣的普通观众" maxLength={200} />
            </label>
          </Card>
          <Card title="选择创作起点">
            <fieldset>
              <legend className={s.srOnly}>创作起点</legend>
              <div className={s.options}>
                {(
                  [
                    ['topic', '从主题开始', '先研究，再组织内容', Lightbulb],
                    ['script', '已有口播文稿', '保留原稿，可跳过研究', FileText],
                    ['upload', '从资料开始', '围绕你的参考资料创作', Upload],
                  ] as const
                ).map(([value, label, desc, Icon]) => (
                  <label key={value} className={`${s.option} ${entry === value ? s.selected : ''}`}>
                    <input
                      type="radio"
                      name="entryType"
                      value={value}
                      checked={entry === value}
                      onChange={() => setEntry(value)}
                    />
                    <span>
                      <Icon size={17} />
                      <b>{label}</b>
                      <small>{desc}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className={s.divider} />
            <div className={s.cardHead}>
              <h3>
                参考资料{' '}
                <span className={s.muted}>/ {entry === 'upload' ? '至少 1 个文件' : '可选'}</span>
              </h3>
              <span className={s.caption}>TXT · MD · PDF · PNG · JPG</span>
            </div>
            <label className={s.uploadBox}>
              <Upload size={22} />
              <b>选择本地资料</b>
              <span>最多 5 个文件，总计 {maxUploadBytes / 1024 / 1024} MB</span>
              <input
                type="file"
                multiple
                accept=".txt,.md,.pdf,.png,.jpg,.jpeg"
                aria-label="上传参考资料"
                onChange={(e) => {
                  setFiles(Array.from(e.target.files || []));
                  setError('');
                }}
              />
            </label>
            {files.map((file, i) => (
              <div key={`${file.name}-${i}`} className={s.fileRow}>
                <FileText size={16} />
                <span>{file.name}</span>
                <small>{(file.size / 1024).toFixed(1)} KB</small>
                <button
                  type="button"
                  className={s.iconButton}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  aria-label={`移除 ${file.name}`}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <Notice>
              资料原件会随项目保存。本阶段尚不解析内容，也不会自动开始研究或生成视频。
            </Notice>
          </Card>
        </div>
        <div className={s.stack}>
          <Card title="视觉方向">
            <div className={s.referenceImages}>
              <img src="/references/server.jpg" alt="科技机房视觉参考" />
              <img src="/references/data_stream.jpg" alt="蓝色数据流视觉参考" />
            </div>
            <p className={s.caption}>仅作风格参考，未作为项目素材或成片。</p>
            <div className={s.tags}>
              <Badge>真实素材</Badge>
              <Badge>代码动画</Badge>
              <Badge>清晰字幕</Badge>
            </div>
          </Card>
          <Card title="配音与制作策略">
            <fieldset className={s.stackSmall}>
              <legend className={s.srOnly}>配音模式</legend>
              {(
                [
                  ['tts', 'AI 配音', '后续选择声音并确认时间轴'],
                  ['import', '导入已有配音', '后续上传音频并对齐字幕'],
                  ['none', '无口播视频', '用屏幕文字与视觉节奏表达'],
                ] as const
              ).map(([value, label, desc]) => (
                <label
                  key={value}
                  className={`${s.voiceOption} ${voice === value ? s.selected : ''}`}
                >
                  <input
                    type="radio"
                    name="voiceMode"
                    checked={voice === value}
                    onChange={() => setVoice(value)}
                  />
                  <span>
                    <b>{label}</b>
                    <small>{desc}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className={s.divider} />
            <div className={s.keyValue}>
              <span>代码动画策略</span>
              <Badge>组件优先</Badge>
            </div>
            <label className={s.field}>
              项目预算上限（元）
              <input
                name="budget"
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                defaultValue="50"
              />
              {fieldError('budgetLimit')}
            </label>
            <p className={s.caption}>预算仅保存为上限。尚未连接服务商，暂不提供报价或扣费。</p>
          </Card>
          <div className={s.softPanel}>
            <ShieldCheck size={20} />
            <div>
              <b>你掌握每一步创作</b>
              <p>先保存项目，再决定下一步。后续研究、文稿、配音和画面会分别供你审核。</p>
            </div>
          </div>
          <div className={s.limitNote}>
            <Clock3 size={14} /> 当前运行限额 {maxDurationMs / 60000} 分钟，可配置。
          </div>
        </div>
      </div>
    </form>
  );
}
