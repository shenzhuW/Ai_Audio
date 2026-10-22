'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { type Project, ProjectSchema } from '@/domain/project';
import { s } from './ui';
export function ProjectEditor({ project }: { project: Project }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMessage('');
    setConflict(false);
    try {
      const response = await fetch(`/api/v1/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: project.version,
          title: f.get('title'),
          style: f.get('style'),
          audience: f.get('audience'),
          budgetLimit: { currency: 'CNY', amount: Number(f.get('budget')) },
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setConflict(response.status === 409);
        throw new Error(result.error?.message || '保存失败');
      }
      ProjectSchema.parse(result.data);
      window.dispatchEvent(new Event('studio:project-saved'));
      setMessage('项目设置已保存');
      setOpen(false);
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {message && (
        <p role="status" className={conflict ? s.error : s.caption}>
          {message}
          {conflict && (
            <button
              className={s.button}
              onClick={() => {
                window.location.reload();
              }}
            >
              重新载入（放弃本地修改）
            </button>
          )}
        </p>
      )}
      <button className={s.button} onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '收起设置' : '编辑项目设置'}
      </button>
      {open && (
        <form onSubmit={save} className={s.editPanel}>
          <label className={s.field}>
            项目标题
            <input name="title" required maxLength={120} defaultValue={project.title} />
          </label>
          <div className={s.formGrid}>
            <label className={s.field}>
              视觉风格
              <input name="style" defaultValue={project.style} />
            </label>
            <label className={s.field}>
              目标观众
              <input name="audience" defaultValue={project.audience} />
            </label>
          </div>
          <label className={s.field}>
            项目预算上限（元）
            <input
              name="budget"
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              defaultValue={project.budgetLimit.amount}
            />
          </label>
          <button className={s.primary} disabled={busy || conflict}>
            {busy ? '保存中…' : '保存项目设置'}
          </button>
        </form>
      )}
    </div>
  );
}
