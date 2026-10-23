'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Plus,
  LayoutDashboard,
  Search,
  FileText,
  AudioLines,
  Clapperboard,
  FolderOpen,
  CodeXml,
  CirclePlay,
  Download,
  PanelsTopLeft,
  ArrowUpRight,
} from 'lucide-react';
import { pages, stagePath } from '@/domain/navigation';
import { s } from './ui';
const icons = [
  Plus,
  LayoutDashboard,
  Search,
  FileText,
  AudioLines,
  Clapperboard,
  FolderOpen,
  CodeXml,
  CirclePlay,
  Download,
];
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const parts = pathname.split('/');
  const demo = parts[1] === 'demo';
  const projectId = /^[0-9a-f-]{36}$/.test(parts[2] || '') ? parts[2] : undefined;
  const stage = demo
    ? parts[2] || 'overview'
    : projectId
      ? parts[3] || 'overview'
      : parts[2] === 'new'
        ? 'new'
        : '';
  const [title, setTitle] = useState('');
  useEffect(() => {
    setTitle('');
    if (!projectId) return;
    const c = new AbortController();
    const refreshTitle = () => {
      fetch(`/api/v1/projects/${projectId}`, { signal: c.signal })
        .then((r) => r.json())
        .then((r) => setTitle(r.data?.title || ''))
        .catch(() => {});
    };
    refreshTitle();
    window.addEventListener('studio:project-saved', refreshTitle);
    return () => {
      c.abort();
      window.removeEventListener('studio:project-saved', refreshTitle);
    };
  }, [projectId, pathname]);
  return (
    <div className={s.app}>
      <a className={s.skip} href="#main-content">
        跳到页面内容
      </a>
      <aside className={s.sidebar}>
        <Link prefetch={false} href="/projects" className={s.logo}>
          <span className={s.logoMark}>▶</span>
          <span>
            AI 视频创作工作台<small>CODE VIDEO STUDIO</small>
          </span>
        </Link>
        <div className={s.sectionCap}>
          创作空间 <span>个人版</span>
        </div>
        <nav aria-label="创作流程" className={s.nav}>
          {pages.map((p, i) => {
            const Icon = icons[i];
            const href =
              p.key === 'new'
                ? '/projects/new'
                : demo
                  ? `/demo/${p.key}`
                  : projectId
                    ? stagePath(projectId, p.key)
                    : `/projects?next=${p.key}`;
            return (
              <Link
                prefetch={false}
                href={href}
                key={p.key}
                aria-current={stage === p.key ? 'page' : undefined}
                className={stage === p.key ? s.active : ''}
              >
                <span className={s.navIcon}>
                  <Icon size={16} />
                </span>
                <span>
                  {String(i + 1).padStart(2, '0')} · {p.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className={s.sidebarBottom}>
          <Link prefetch={false} href="/projects" className={s.libraryLink}>
            <FolderOpen size={17} /> 全部项目
          </Link>
          <div className={s.minihelp}>
            <b>从一个想法，到一条视频</b>
            <p>
              项目自动持久保存。
              <br />
              创作过程，由你决定。
            </p>
            <Link prefetch={false} href="/demo/overview">
              查看模拟项目 <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className={s.localStatus}>
            <i /> 本地单用户工作台
          </div>
        </div>
      </aside>
      <div className={s.main}>
        <header className={s.topbar}>
          <div className={s.breadcrumb}>
            <Link prefetch={false} href="/projects">
              工作空间
            </Link>
            <span>›</span>
            {(title || demo) && (
              <>
                <span className={s.crumbTitle}>{demo ? 'GPU 科普 · 模拟项目' : title}</span>
                <span>›</span>
              </>
            )}
            <b>{pages.find((p) => p.key === stage)?.label || '全部项目'}</b>
          </div>
          <div className={s.topActions}>
            <Link prefetch={false} href="/projects" className={s.projectButton}>
              <PanelsTopLeft size={15} /> 项目库
            </Link>
            <span className={s.avatar}>创</span>
            <span className={s.personal}>个人工作台</span>
          </div>
        </header>
        <main id="main-content" className={s.content}>
          {children}
          <footer className={s.footer}>
            AI Code Video Studio <span>·</span> Phase 01 工作流与审核 <span>·</span>{' '}
            支持模拟文本，真实 AI 与视频制作尚未接通
          </footer>
        </main>
      </div>
    </div>
  );
}
