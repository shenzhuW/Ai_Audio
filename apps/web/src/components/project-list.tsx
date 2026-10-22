'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Search, ArrowUpRight, Plus, Film } from 'lucide-react';
import { formatDuration, type Project } from '@/domain/project';
import { stagePath, type Stage } from '@/domain/navigation';
import { Card, Badge, PageHead, Empty, s } from './ui';
export function ProjectList({ projects, next }: { projects: Project[]; next: Stage }) {
  const [query, setQuery] = useState('');
  const visible = projects.filter((p) => p.title.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <PageHead
        number="02"
        title="你的创作项目"
        description="每一个想法，都有独立的创作空间。随时回来，继续完善。"
      >
        <Link prefetch={false} href="/projects/new" className={s.primary}>
          <Plus size={17} /> 创建视频
        </Link>
      </PageHead>
      <div className={s.listToolbar}>
        <div className={s.searchInput}>
          <Search size={17} />
          <input
            aria-label="搜索项目"
            placeholder="搜索项目标题…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className={s.caption}>{projects.length} 个项目 · 按最近更新排序</span>
      </div>
      {visible.length === 0 ? (
        <Card>
          <Empty title={query ? '没有匹配的项目' : '从你的第一个想法开始'}>
            {query
              ? '换个关键词试试。'
              : '创建项目后，创作需求与资料会保存在本机，刷新或重启后可以继续。'}
          </Empty>
          <div className={s.center}>
            <Link prefetch={false} href="/projects/new" className={s.primary}>
              创建视频 <ArrowUpRight size={16} />
            </Link>
            <Link prefetch={false} href="/demo/overview" className={s.button}>
              查看模拟项目
            </Link>
          </div>
        </Card>
      ) : (
        <div className={s.projectGrid}>
          {visible.map((p) => (
            <Link
              prefetch={false}
              key={p.id}
              href={stagePath(p.id, next)}
              className={s.projectCard}
            >
              <div className={s.cardHead}>
                <span className={s.projectIcon}>
                  <Film size={23} />
                </span>
                <Badge tone="gray">需求草稿</Badge>
              </div>
              <h2>{p.title}</h2>
              <p>{p.input.prompt.slice(0, 95)}</p>
              <div className={s.tags}>
                <Badge>{formatDuration(p.targetDurationMs)}</Badge>
                <Badge tone="gray">{p.width < p.height ? '9:16' : '16:9'}</Badge>
                <Badge tone="gray">
                  {{ topic: '主题起点', script: '已有文稿', upload: '上传资料' }[p.input.entryType]}
                </Badge>
              </div>
              <div className={s.projectFoot}>
                <span>
                  {new Date(p.updatedAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}{' '}
                  · v{p.version}
                </span>
                <span>打开项目 ↗</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
