import type { ReactNode } from 'react';
import { FolderOpen } from 'lucide-react';
import s from './studio.module.css';
export { s };
export function Card({
  title,
  children,
  aside,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${s.card} ${className}`}>
      {title && (
        <div className={s.cardHead}>
          <h2>{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
export function Badge({
  children,
  tone = 'blue',
}: {
  children: ReactNode;
  tone?: 'blue' | 'gray' | 'amber' | 'green';
}) {
  return <span className={`${s.badge} ${s[tone]}`}>{children}</span>;
}
export function PageHead({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className={s.pageHead}>
      <div>
        <div className={s.eyebrow}>{number} / 10 · AI CODE VIDEO STUDIO</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className={s.actions}>{children}</div>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={s.empty}>
      <FolderOpen size={30} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return <div className={s.notice}>{children}</div>;
}
