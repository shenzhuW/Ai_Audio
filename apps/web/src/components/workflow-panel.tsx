'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  workflowLabels,
  statusLabels,
  type ArtifactType,
  type WorkflowJob,
} from '@/domain/workflow';
import type { WorkflowSnapshot } from '@/server/workflow/engine';
import { Card, Badge, Notice, s } from './ui';
function useWorkflow(projectId: string, initial?: WorkflowSnapshot) {
  const [snapshot, setSnapshot] = useState<WorkflowSnapshot | undefined>(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  async function reload() {
    const r = await fetch(`/api/v1/projects/${projectId}/workflow`, { cache: 'no-store' }),
      b = await r.json();
    if (!r.ok) throw new Error(b.error?.message || '工作流读取失败');
    setSnapshot(b.data);
    return b.data as WorkflowSnapshot;
  }
  useEffect(() => {
    let live = true;
    const refresh = () =>
      reload().catch((e) => {
        if (live) setError(e.message);
      });
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [projectId]); // state polling never changes the editable buffer
  async function send(url: string, method: string, body: unknown) {
    setBusy(true);
    setError('');
    const signature = JSON.stringify([url, method, body]);
    if (pending.current?.signature !== signature)
      pending.current = { signature, key: crypto.randomUUID() };
    try {
      const r = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.current.key },
          body: JSON.stringify(body),
        }),
        b = await r.json();
      if (r.status < 500) pending.current = null;
      if (!r.ok) throw new Error(b.error?.message || '工作流操作失败');
      await reload();
      return b.data;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { snapshot, error, busy, reload, send };
}
function Jobs({
  jobs,
  projectId,
  send,
  busy,
}: {
  jobs: WorkflowJob[];
  projectId: string;
  send: (url: string, method: string, body: unknown) => Promise<unknown>;
  busy: boolean;
}) {
  return (
    <Card title="后台任务" aside={<Badge tone="gray">{jobs.length} 项</Badge>}>
      {jobs.length === 0 ? (
        <p className={s.caption}>尚未创建任务。保存和审核本身不会调用外部模型。</p>
      ) : (
        jobs
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((j) => (
            <div key={j.id} className={s.workflowJob}>
              <div className={s.cardHead}>
                <b>{workflowLabels[j.kind]}</b>
                <Badge
                  tone={j.state === 'failed' ? 'amber' : j.state === 'succeeded' ? 'green' : 'gray'}
                >
                  {statusLabels[j.state]}
                </Badge>
              </div>
              <p className={s.caption}>
                {j.provider === 'mock'
                  ? 'Mock 文本任务'
                  : j.provider === 'remotion'
                    ? 'Remotion 真实渲染'
                    : j.provider === 'research'
                      ? `研究分析 · ${j.researchInput?.mode === 'real' ? '本地真实提取' : j.researchInput?.mode === 'mock' ? 'Mock' : 'Provider 未配置'}`
                      : '提供方尚未配置'}{' '}
                · 执行 {j.attempt}/{j.maxAttempts} 次
              </p>
              <code className={s.caption}>{j.id}</code>
              {j.errorCode && (
                <p className={s.fieldError}>
                  {j.errorCode === 'PROVIDER_NOT_CONFIGURED'
                    ? '该阶段的提供方尚未接通，未生成音频或视频。'
                    : j.errorCode}
                </p>
              )}
              {j.state === 'queued' && (
                <p className={s.caption}>任务已持久保存，等待后台工作进程领取。</p>
              )}
              <div className={s.actions}>
                {['queued', 'running'].includes(j.state) && (
                  <button
                    className={s.button}
                    disabled={busy}
                    onClick={() =>
                      send(`/api/v1/jobs/${j.id}/cancel`, 'POST', { expectedVersion: j.version })
                    }
                  >
                    取消任务
                  </button>
                )}
                {['failed', 'cancelled'].includes(j.state) && j.attempt < j.maxAttempts && (
                  <button
                    className={s.button}
                    disabled={busy}
                    onClick={() =>
                      send(`/api/v1/jobs/${j.id}/retry`, 'POST', { expectedVersion: j.version })
                    }
                  >
                    重试任务
                  </button>
                )}
                <Link
                  prefetch={false}
                  className={s.caption}
                  href={`/projects/${projectId}/${j.kind}`}
                >
                  查看工作区 →
                </Link>
              </div>
            </div>
          ))
      )}
    </Card>
  );
}
export function WorkflowDashboard({
  projectId,
  initial,
}: {
  projectId: string;
  initial: WorkflowSnapshot;
}) {
  const { snapshot, error, send, busy } = useWorkflow(projectId, initial);
  if (!snapshot) return null;
  return (
    <div className={s.split}>
      <div className={s.stack}>
        <Card title="审核与依赖" aside={<Badge>{workflowLabels[snapshot.currentStage]}</Badge>}>
          <p>
            待审核 {snapshot.pendingReviewIds.length} 项 · 依赖失效{' '}
            {snapshot.staleRevisionIds.length} 项
          </p>
          {snapshot.stages.map((stage) => (
            <Link
              prefetch={false}
              className={s.artifactRow}
              href={`/projects/${projectId}/${stage.type}`}
              key={stage.type}
            >
              <b>{workflowLabels[stage.type]}</b>
              <Badge
                tone={
                  stage.status === 'approved'
                    ? 'green'
                    : stage.status === 'stale'
                      ? 'amber'
                      : 'gray'
                }
              >
                {statusLabels[stage.status]}
              </Badge>
              {stage.mock && <Badge tone="amber">Mock</Badge>}
            </Link>
          ))}
          <p className={s.caption}>
            批准记录属于真实用户操作；Mock 内容不会因此变成已核实事实或获授权素材。
          </p>
        </Card>
        {error && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}
      </div>
      <Jobs jobs={snapshot.jobs} projectId={projectId} send={send} busy={busy} />
    </div>
  );
}
export function WorkflowPanel({
  projectId,
  type,
  originalText = '',
  onRevisionChange,
  integratedResearch = false,
  integratedScript = false,
  externalDirty = false,
  externalRevision,
}: {
  projectId: string;
  type: ArtifactType;
  originalText?: string;
  onRevisionChange?: (id: string) => void;
  integratedResearch?: boolean;
  integratedScript?: boolean;
  externalDirty?: boolean;
  externalRevision?: { id: string; version: number };
}) {
  const { snapshot, error, busy, reload, send } = useWorkflow(projectId);
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState(originalText),
    [editVersion, setEditVersion] = useState(1);
  const [dirty, setDirty] = useState(false),
    [comment, setComment] = useState(''),
    [message, setMessage] = useState('');
  const artifact = snapshot?.artifacts.find((a) => a.type === type);
  const revisions =
    snapshot?.revisions
      .filter((r) => r.artifactId === artifact?.id)
      .sort((a, b) => b.revisionNumber - a.revisionNumber) || [];
  const revision = revisions.find((r) => r.id === selected);
  const isCurrent = artifact?.currentRevisionId === revision?.id;
  const stale = revision && snapshot?.staleRevisionIds.includes(revision.id);
  const waitingForSavedRevision =
    integratedScript &&
    externalRevision?.id === revision?.id &&
    externalRevision?.version !== revision?.version;
  useEffect(() => {
    if (integratedScript && externalRevision) reload().catch(() => {});
  }, [integratedScript, externalRevision?.id, externalRevision?.version]);
  function select(r: typeof revision) {
    if (r) {
      setSelected(r.id);
      setText(r.text);
      setEditVersion(r.version);
      setDirty(false);
      onRevisionChange?.(r.id);
    }
  }
  useEffect(() => {
    if (!selected && artifact?.currentRevisionId)
      select(revisions.find((r) => r.id === artifact.currentRevisionId));
  }, [artifact?.currentRevisionId, selected]);
  useEffect(() => {
    if (
      (integratedResearch || integratedScript) &&
      !dirty &&
      revision &&
      revision.version !== editVersion
    ) {
      setText(revision.text);
      setEditVersion(revision.version);
    }
  }, [integratedResearch, integratedScript, dirty, revision?.version, editVersion]);
  const inputs = () => {
    if (revision)
      return (
        snapshot?.dependencies
          .filter((d) => d.downstreamRevisionId === revision.id)
          .map((d) => {
            const up = snapshot.revisions.find((r) => r.id === d.upstreamRevisionId)!;
            return (
              snapshot.artifacts.find((a) => a.id === up.artifactId)?.approvedRevisionId || up.id
            );
          }) || []
      );
    return type === 'script'
      ? [snapshot?.stages.find((s) => s.type === 'research')?.approvedRevisionId].filter(
          (id): id is string => !!id,
        )
      : [];
  };
  async function act(action: string) {
    setMessage('');
    let url = `/api/v1/projects/${projectId}/artifacts`,
      method = 'POST';
    let body: unknown = { type, text, inputRevisionIds: inputs() };
    if (action === 'mock') {
      url = `/api/v1/projects/${projectId}/${type}-runs`;
      body = { inputRevisionIds: inputs() };
    } else if (revision) {
      url = `/api/v1/artifacts/${artifact!.id}/revisions`;
      if (action === 'fork')
        body = {
          revisionId: revision.id,
          expectedVersion: revision.version,
          inputRevisionIds: inputs(),
        };
      else {
        url += `/${revision.id}`;
        body = { expectedVersion: editVersion };
        if (action === 'save') {
          method = 'PATCH';
          body = { expectedVersion: editVersion, text };
        } else {
          url += '/' + action;
          body = {
            expectedVersion: integratedScript ? revision.version : editVersion,
            ...(action === 'approve' || action === 'reject' ? { comment } : {}),
          };
        }
      }
    }
    const result = await send(url, method, body);
    if (result) {
      if (result.id && result.artifactId) select(result);
      setMessage(
        action === 'mock'
          ? '模拟任务已排队，尚未生成内容。'
          : action === 'save'
            ? '草稿已保存'
            : action === 'approve'
              ? '当前修订已批准，下游任务已排队'
              : action === 'reject'
                ? '修订已驳回，请创建新修订继续修改'
                : '操作已保存',
      );
    }
  }
  if (!snapshot)
    return (
      <Card>
        <p role="status">正在读取工作流…</p>
        {error && <p role="alert">{error}</p>}
      </Card>
    );
  return (
    <>
      <Notice>
        本页已接通真实保存、版本和审核。模拟生成仅提供带 Mock
        标记的文本，外部事实核验与配音仍未接通；可信组件渲染位于第 08 页。
      </Notice>
      {error && (
        <p role="alert" className={s.error}>
          {error}{' '}
          <button
            className={s.button}
            onClick={async () => {
              const current = await reload();
              select(current.revisions.find((r) => r.id === selected));
            }}
          >
            重新载入（放弃本地修改）
          </button>
        </p>
      )}
      {message && (
        <p role="status" className={s.workflowMessage}>
          {message}
        </p>
      )}
      <div className={s.split}>
        <div className={s.stack}>
          <Card
            title={`${workflowLabels[type]} · 修订`}
            aside={
              revision ? (
                <Badge tone={revision.mock ? 'amber' : 'gray'}>
                  {revision.mock ? 'Mock · 未核实' : '手动内容 · 未核实'}
                </Badge>
              ) : undefined
            }
          >
            {revision && (
              <div className={s.cardHead}>
                <b>
                  v{revision.revisionNumber} · {statusLabels[revision.status]}
                </b>
                <small>并发版本 {revision.version}</small>
              </div>
            )}
            {stale && (
              <Notice>上游批准版本已变化。请创建新修订并重新检查依据；历史批准记录保留。</Notice>
            )}
            {revision && !isCurrent && (
              <Notice>正在查看历史修订。当前候选已变化；请选取当前修订或显式创建新修订。</Notice>
            )}
            {integratedScript && revision?.scriptSchemaVersion ? (
              <p className={s.caption}>
                正文与引用在上方按段保存；此处审核同一修订，不会重新生成文稿。
              </p>
            ) : (
              <label className={s.field}>
                产物文本
                <textarea
                  aria-label="产物文本"
                  className={s.textarea}
                  rows={12}
                  maxLength={50000}
                  value={text}
                  readOnly={
                    integratedScript || (!!revision && (revision.status !== 'draft' || !isCurrent))
                  }
                  onChange={(e) => {
                    setText(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
            )}
            <p className={s.caption}>
              无来源核验标记；批准内容仅确认此次创作修订，不授予素材商业许可。
            </p>
            <div className={s.actions}>
              {!integratedScript && (!revision || (revision.status === 'draft' && isCurrent)) && (
                <button
                  className={s.primary}
                  disabled={busy || !text.trim()}
                  onClick={() => act('save')}
                >
                  {revision ? '保存草稿' : '创建草稿'}
                </button>
              )}
              {revision?.status === 'draft' && isCurrent && (
                <button
                  className={s.button}
                  disabled={busy || dirty || externalDirty || waitingForSavedRevision || stale}
                  onClick={() => act('submit')}
                >
                  提交审核
                </button>
              )}
              {revision && (
                <button
                  className={s.button}
                  disabled={busy || dirty || externalDirty}
                  onClick={() => act('fork')}
                >
                  创建新修订
                </button>
              )}
              {!integratedScript && (
                <button className={s.button} disabled={busy || dirty} onClick={() => act('mock')}>
                  生成模拟{type === 'research' ? '研究' : '文稿'}文本
                </button>
              )}
            </div>
            {dirty && <p className={s.caption}>有未保存修改，保存后再提交审核或切换版本。</p>}
            {revision?.status === 'in_review' && isCurrent && (
              <div className={s.workflowReview}>
                <label className={s.field}>
                  审核意见
                  <input
                    name="reviewComment"
                    maxLength={2000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="批准可留空；驳回须填写意见"
                  />
                </label>
                <div className={s.actions}>
                  <button
                    className={s.primary}
                    disabled={busy || externalDirty || stale}
                    onClick={() => act('approve')}
                  >
                    批准当前修订
                  </button>
                  <button
                    className={s.button}
                    disabled={busy || externalDirty || !comment.trim()}
                    onClick={() => act('reject')}
                  >
                    驳回修改
                  </button>
                </div>
              </div>
            )}
          </Card>
          <Card title="审核记录与依赖">
            {revision && (
              <>
                <details className={s.workflowMeta}>
                  <summary>修订追溯信息</summary>
                  <p className={s.caption}>内容 SHA256：{revision.contentHash}</p>
                  <p className={s.caption}>修订 ID：{revision.id}</p>
                </details>
              </>
            )}
            {snapshot.approvals
              .filter((e) => e.revisionId === selected)
              .sort((a, b) => a.at.localeCompare(b.at))
              .map((e) => (
                <p key={e.id}>
                  {{ submit: '提交审核', approve: '批准', reject: '驳回' }[e.action]} ·{' '}
                  {e.comment || '无备注'} <small className={s.caption}>{e.at}</small>
                </p>
              ))}
            {revision &&
              snapshot.dependencies
                .filter((d) => d.downstreamRevisionId === revision.id)
                .map((d) => (
                  <p className={`${s.caption} ${s.workflowMeta}`} key={d.id}>
                    固定上游修订：{d.upstreamRevisionId}
                  </p>
                ))}
            {!revision && <p className={s.caption}>创建产物后显示真实审核和依赖记录。</p>}
          </Card>
        </div>
        <div className={s.stack}>
          <Card title="版本历史" aside={<Badge tone="gray">{revisions.length} 版</Badge>}>
            {revisions.map((r) => (
              <button
                key={r.id}
                className={s.workflowVersion}
                disabled={dirty || externalDirty || busy}
                aria-pressed={selected === r.id}
                onClick={() => select(r)}
              >
                v{r.revisionNumber} · {statusLabels[r.status]} {r.mock ? '· Mock' : ''}
                {snapshot.staleRevisionIds.includes(r.id) ? ' · 依赖失效' : ''}
              </button>
            ))}
            {!revisions.length && (
              <p className={s.caption}>尚无修订，原始需求和上传资料保留在项目总览。</p>
            )}
          </Card>
          {!integratedResearch && !integratedScript && (
            <Jobs jobs={snapshot.jobs} projectId={projectId} send={send} busy={busy} />
          )}
        </div>
      </div>
    </>
  );
}
