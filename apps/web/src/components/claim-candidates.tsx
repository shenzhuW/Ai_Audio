'use client';
import { useState } from 'react';
import type { ClaimCandidate, ClaimCandidateDraft } from '@/domain/research';
import type { ResearchWorkspace } from '@/server/research/service';
import { AiRunDetails } from './ai-run-details';
import { Card, Badge, Notice, s } from './ui';
type Send = (url: string, body: unknown) => Promise<unknown>;
type Props = { data: ResearchWorkspace; editable: boolean; busy: boolean; send: Send };
const draft = (c: ClaimCandidate): ClaimCandidateDraft => ({
  claim: { ...c.claim },
  conflictNote: c.conflictNote,
  evidence: c.evidence.map(({ sourceId, indexId, role, quote }) => ({
    sourceId,
    indexId,
    role,
    quote,
  })),
});
function Candidate({
  candidate,
  jobId,
  state,
  data,
  editable,
  busy,
  send,
}: Props & {
  candidate: ClaimCandidate;
  jobId: string;
  state: 'pending' | 'accepted' | 'rejected';
}) {
  const [value, setValue] = useState(() => draft(candidate)),
    [dirty, setDirty] = useState(false),
    [baseVersion, setBaseVersion] = useState(data.revision!.version);
  const enabled = editable && state === 'pending' && !busy;
  function change(next: ClaimCandidateDraft) {
    if (!dirty) setBaseVersion(data.revision!.version);
    setValue(next);
    setDirty(true);
  }
  const updateClaim = (key: 'text' | 'scope' | 'unit' | 'caveats' | 'asOf', v: string | null) =>
    change({ ...value, claim: { ...value.claim, [key]: v } });
  async function review(decision: 'edit' | 'accept' | 'reject') {
    const result = await send(
      `/api/v1/projects/${data.projectId}/research-candidates/${candidate.id}`,
      {
        revisionId: data.revision!.id,
        expectedVersion: dirty ? baseVersion : data.revision!.version,
        jobId,
        decision,
        ...(decision === 'edit' ? { candidate: value } : {}),
      },
    );
    if (result) setDirty(false);
  }
  return (
    <article
      className={s.researchIndex}
      data-candidate-id={candidate.id}
      style={{ minWidth: 0, overflowWrap: 'anywhere' }}
    >
      <Badge tone={state === 'accepted' ? 'green' : 'amber'}>
        {
          { pending: '候选待审核 · 未核实', accepted: '已接受 · 未独立核实', rejected: '已拒绝' }[
            state
          ]
        }
      </Badge>
      <label className={s.field}>
        候选 Claim
        <textarea
          className={s.textarea}
          rows={3}
          maxLength={5000}
          value={value.claim.text}
          disabled={!enabled}
          onChange={(e) => updateClaim('text', e.target.value)}
        />
      </label>
      <div className={s.formGrid}>
        <label className={s.field}>
          事实日期
          <input
            type="date"
            value={value.claim.asOf || ''}
            disabled={!enabled}
            onChange={(e) => updateClaim('asOf', e.target.value || null)}
          />
        </label>
        <label className={s.field}>
          口径 / 范围
          <input
            value={value.claim.scope}
            maxLength={2000}
            disabled={!enabled}
            onChange={(e) => updateClaim('scope', e.target.value)}
          />
        </label>
        <label className={s.field}>
          单位
          <input
            value={value.claim.unit}
            maxLength={2000}
            disabled={!enabled}
            onChange={(e) => updateClaim('unit', e.target.value)}
          />
        </label>
        <label className={s.field}>
          限制与说明
          <input
            value={value.claim.caveats}
            maxLength={2000}
            disabled={!enabled}
            onChange={(e) => updateClaim('caveats', e.target.value)}
          />
        </label>
      </div>
      <label className={s.field}>
        冲突 / 证据不足提示
        <textarea
          className={s.textarea}
          rows={2}
          maxLength={2000}
          value={value.conflictNote}
          disabled={!enabled}
          onChange={(e) => change({ ...value, conflictNote: e.target.value })}
        />
      </label>
      {value.evidence.map((e, i) => {
        const source = data.sources.find((x) => x.id === e.sourceId),
          match = candidate.evidence[i]?.match;
        return (
          <blockquote className={s.researchQuote} key={i}>
            <b>{source?.title || '来源已不可用'}</b>
            {source?.sourceUrl && (
              <p>
                <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                  查看来源网页
                </a>
              </p>
            )}
            <label className={s.field}>
              候选引用 {i + 1}
              <textarea
                className={s.textarea}
                rows={3}
                maxLength={5000}
                value={e.quote}
                disabled={!enabled}
                onChange={(event) =>
                  change({
                    ...value,
                    evidence: value.evidence.map((v, n) =>
                      n === i ? { ...v, quote: event.target.value } : v,
                    ),
                  })
                }
              />
            </label>
            <label className={s.field}>
              证据角色
              <select
                value={e.role}
                disabled={!enabled}
                onChange={(event) =>
                  change({
                    ...value,
                    evidence: value.evidence.map((v, n) =>
                      n === i ? { ...v, role: event.target.value as typeof e.role } : v,
                    ),
                  })
                }
              >
                <option value="support">支持</option>
                <option value="refute">反驳 / 冲突</option>
                <option value="context">背景</option>
              </select>
            </label>
            <small>
              {match?.locator.kind === 'page' ? `PDF 第 ${match.locator.page} 页 · ` : ''}
              {dirty
                ? '编辑后须重新校验原文'
                : `原文精确定位 ${match?.startChar ?? '?'}–${match?.endChar ?? '?'}（UTF-16，末端不含）`}
            </small>
            <details>
              <summary>原文与来源映射</summary>
              <p>
                Source {e.sourceId} · Index {e.indexId}
              </p>
              <p>原件 SHA256：{match?.sourceSha256}</p>
              <p>提取文本 SHA256：{match?.indexTextSha256}</p>
              <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {data.indexes.find((x) => x.id === e.indexId)?.extractedText?.slice(0, 12000) ||
                  '原文不可用'}
              </pre>
            </details>
          </blockquote>
        );
      })}
      {dirty && baseVersion !== data.revision!.version && (
        <Notice>研究版本已变化。当前编辑已保留；保存会提示冲突，请核对后重新载入候选。</Notice>
      )}
      <div className={s.actions}>
        <button className={s.button} disabled={!enabled || !dirty} onClick={() => review('edit')}>
          保存候选编辑
        </button>
        <button className={s.primary} disabled={!enabled || dirty} onClick={() => review('accept')}>
          接受为未核实 Claim
        </button>
        <button className={s.button} disabled={!enabled || dirty} onClick={() => review('reject')}>
          拒绝候选
        </button>
        {dirty && (
          <button
            className={s.button}
            disabled={busy}
            onClick={() => {
              setValue(draft(candidate));
              setDirty(false);
              setBaseVersion(data.revision!.version);
            }}
          >
            放弃编辑并重新载入候选
          </button>
        )}
      </div>
    </article>
  );
}
export function ClaimCandidates(props: Props) {
  const { data, busy, editable, send } = props,
    revision = data.revision;
  if (!revision) return null;
  const jobs = data.jobs
    .filter((j) => j.researchInput?.kind === 'claims' && j.researchInput.revisionId === revision.id)
    .slice()
    .reverse();
  const running = jobs.some((j) => ['queued', 'running'].includes(j.state));
  return (
    <Card title="AI 候选 Claim 与原文引用" aside={<Badge>用户确认后写入</Badge>}>
      <p>仅依据当前已选中来源的真实提取原文。精确匹配只证明引用位置，接受候选不会自动核实事实。</p>
      <button
        className={s.primary}
        disabled={!editable || busy || running}
        onClick={() =>
          send(`/api/v1/projects/${data.projectId}/research-claim-runs`, {
            revisionId: revision.id,
            expectedVersion: revision.version,
          })
        }
      >
        从原文生成候选 Claim
      </button>
      {!editable && <p>批准或历史修订只读。请 Fork 后重新生成当前修订的候选。</p>}
      {!jobs.length && (
        <p className={s.caption}>
          尚未生成候选。没有原文时会报告证据不足；Provider 未配置时会明确失败。
        </p>
      )}
      {jobs.map((job) => (
        <section key={job.id} data-claim-job={job.id}>
          <h3>
            候选任务 ·{' '}
            {
              {
                queued: '排队中',
                running: '生成中',
                succeeded: '已完成',
                failed: '失败',
                cancelled: '已取消',
              }[job.state]
            }
          </h3>
          <p className={s.caption}>
            任务 {job.id}
            {job.errorCode ? ` · ${job.errorCode}` : ''}
          </p>
          <AiRunDetails runs={job.aiRuns} />
          {job.researchResult?.kind === 'claims' && (
            <>
              <Notice>
                {job.researchResult.status === 'insufficient' ? '证据不足：' : '候选生成说明：'}
                {job.researchResult.notes}
              </Notice>
              {job.researchResult.candidates.map((original) => {
                const review = job.claimCandidateReviews?.find(
                  (r) => r.candidateId === original.id,
                );
                return (
                  <Candidate
                    {...props}
                    key={`${original.id}-${review?.version ?? 0}`}
                    candidate={review?.candidate ?? original}
                    jobId={job.id}
                    state={review?.state ?? 'pending'}
                  />
                );
              })}
            </>
          )}
          <div className={s.actions}>
            {['queued', 'running'].includes(job.state) && (
              <button
                className={s.button}
                disabled={busy}
                onClick={() =>
                  send(`/api/v1/jobs/${job.id}/cancel`, { expectedVersion: job.version })
                }
              >
                取消候选任务
              </button>
            )}
            {['failed', 'cancelled'].includes(job.state) && job.attempt < job.maxAttempts && (
              <button
                className={s.button}
                disabled={busy || !editable}
                onClick={() =>
                  send(`/api/v1/jobs/${job.id}/retry`, { expectedVersion: job.version })
                }
              >
                重试候选任务
              </button>
            )}
          </div>
        </section>
      ))}
    </Card>
  );
}
