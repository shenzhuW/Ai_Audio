import Link from 'next/link';
import { FileText, ArrowRight, Film, Check, LockKeyhole } from 'lucide-react';
import { type Project, formatDuration } from '@/domain/project';
import { pages, stagePath } from '@/domain/navigation';
import { ProjectEditor } from './project-editor';
import { Card, Badge, PageHead, Empty, Notice, s } from './ui';
export function Overview({ project: p }: { project: Project }) {
  const workflow = pages.filter((x) => !['new', 'overview', 'assets'].includes(x.key));
  const start =
    p.input.entryType === 'topic'
      ? 'research'
      : p.input.entryType === 'script'
        ? 'script'
        : 'assets';
  return (
    <>
      <PageHead
        number="02"
        title="项目总览"
        description="项目已保存。先确认创作需求，再开始下一步。"
      >
        <Link prefetch={false} className={s.button} href="/projects">
          全部项目
        </Link>
        <Link prefetch={false} className={s.primary} href={stagePath(p.id, start)}>
          查看{start === 'script' ? '文稿' : start === 'assets' ? '资料' : '研究'}工作区{' '}
          <ArrowRight size={16} />
        </Link>
      </PageHead>
      <Card>
        <div className={s.projectSummary}>
          <span className={s.projectIcon}>
            <Film size={26} />
          </span>
          <div>
            <h2>{p.title}</h2>
            <div className={s.tags}>
              <Badge>需求草稿 · v{p.version}</Badge>
              <Badge tone="gray">{formatDuration(p.targetDurationMs)}</Badge>
              <Badge tone="gray">{p.width < p.height ? '9:16' : '16:9'} · 1080p</Badge>
              <Badge tone="gray">{p.language}</Badge>
            </div>
          </div>
          <span className={s.saved}>
            <Check size={15} /> 已持久保存
          </span>
        </div>
        <div className={s.divider} />
        <div className={s.cardHead}>
          <h3>完整创作流程</h3>
          <Badge tone="gray">当前阶段：创作需求</Badge>
        </div>
        <div className={s.steps}>
          {workflow.map((page, i) => (
            <Link
              prefetch={false}
              key={page.key}
              href={stagePath(p.id, page.key)}
              className={s.step}
            >
              <span>{String(i + 1).padStart(2, '0')}</span>
              <b>{page.label}</b>
              <small>尚未开始</small>
            </Link>
          ))}
        </div>
      </Card>
      <div className={s.metrics}>
        <Card>
          <span>研究来源</span>
          <strong>
            0 <small>项</small>
          </strong>
          <p>尚未启动研究</p>
        </Card>
        <Card>
          <span>文稿版本</span>
          <strong>{p.input.entryType === 'script' ? '已有原稿' : '暂无'}</strong>
          <p>
            {p.input.entryType === 'script' ? '已保存原文，尚未创建审核修订' : '等待创作下一阶段'}
          </p>
        </Card>
        <Card>
          <span>分镜规划</span>
          <strong>
            0 <small>个镜头</small>
          </strong>
          <p>目标时长 {formatDuration(p.targetDurationMs)} · 数量按内容规划</p>
        </Card>
      </div>
      <div className={s.split}>
        <div className={s.stack}>
          <Card title="创作需求与项目设置" aside={<Badge tone="green">已保存</Badge>}>
            <p className={s.briefText}>{p.input.prompt}</p>
            <div className={s.formGrid}>
              <div className={s.detailItem}>
                <small>创作起点</small>
                <b>
                  {
                    { topic: '从主题开始', script: '已有口播文稿', upload: '从资料开始' }[
                      p.input.entryType
                    ]
                  }
                </b>
              </div>
              <div className={s.detailItem}>
                <small>配音模式</small>
                <b>
                  {
                    { tts: 'AI 配音', import: '导入已有配音', none: '无口播视频' }[
                      p.input.voiceMode
                    ]
                  }
                </b>
              </div>
              <div className={s.detailItem}>
                <small>视觉风格</small>
                <b>{p.style}</b>
              </div>
              <div className={s.detailItem}>
                <small>目标观众</small>
                <b>{p.audience}</b>
              </div>
            </div>
            <ProjectEditor project={p} />
          </Card>
          <Card title="阶段产物与审核">
            {workflow.map((page) => (
              <Link
                prefetch={false}
                key={page.key}
                href={stagePath(p.id, page.key)}
                className={s.artifactRow}
              >
                <span className={s.navIcon}>
                  <FileText size={16} />
                </span>
                <div>
                  <b>{page.label}</b>
                  <small>暂无产物或已批准版本</small>
                </div>
                <Badge tone="gray">未接通</Badge>
                <ArrowRight size={14} />
              </Link>
            ))}
          </Card>
        </div>
        <div className={s.stack}>
          <Card title="视频预览">
            <div className={s.previewEmpty}>
              <Film size={34} strokeWidth={1.2} />
              <b>等待第一版画面</b>
              <span>尚未生成视频</span>
            </div>
            <p className={s.caption}>成片预览将在动画与渲染完成后出现。</p>
          </Card>
          <Card title="参考资料" aside={<Badge tone="gray">{p.input.attachments.length} 个</Badge>}>
            {p.input.attachments.length ? (
              p.input.attachments.map((f) => (
                <a
                  className={s.fileRow}
                  key={f.id}
                  href={`/api/v1/projects/${p.id}/uploads/${f.id}`}
                >
                  <FileText size={16} />
                  <span>{f.name}</span>
                  <small>下载原件 ↗</small>
                </a>
              ))
            ) : (
              <p className={s.caption}>没有上传参考资料。</p>
            )}
          </Card>
          <Card title="项目预算">
            <div className={s.budget}>
              ¥ {p.budgetLimit.amount.toFixed(2)}
              <small>预算上限</small>
            </div>
            <p className={s.caption}>尚未运行计费任务，暂无费用记录。</p>
          </Card>
          <Notice>
            <LockKeyhole size={15} />{' '}
            后续创作模块尚未接通。当前已保存的内容可随时查看，项目不会自动执行 AI 任务。
          </Notice>
        </div>
      </div>
    </>
  );
}
