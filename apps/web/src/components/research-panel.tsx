'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Card, Badge, Notice, s } from './ui';
import { WorkflowPanel } from './workflow-panel';
import { claimLabels, type Claim } from '@/domain/research';
import type { ResearchWorkspace } from '@/server/research/service';
import { statusLabels } from '@/domain/workflow';
export function ResearchPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ResearchWorkspace>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [view, setView] = useState(''),
    [selected, setSelected] = useState(''),
    [filter, setFilter] = useState('all');
  const [file, setFile] = useState<File>(),
    [title, setTitle] = useState(''),
    [mode, setMode] = useState('real'),
    [query, setQuery] = useState('');
  const [claimText, setClaimText] = useState(''),
    [claimId, setClaimId] = useState(''),
    [asOf, setAsOf] = useState(''),
    [scope, setScope] = useState(''),
    [unit, setUnit] = useState(''),
    [caveats, setCaveats] = useState(''),
    [claimStatus, setClaimStatus] = useState('unverified');
  const [quote, setQuote] = useState(''),
    [evidenceClaim, setEvidenceClaim] = useState(''),
    [role, setRole] = useState('support'),
    [locatorKind, setLocatorKind] = useState('text'),
    [label, setLabel] = useState(''),
    [page, setPage] = useState(1),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(1000);
  const video = useRef<HTMLVideoElement>(null),
    pending = useRef<{ signature: string; key: string } | undefined>(undefined);
  const base = `/api/v1/projects/${projectId}`;
  async function reload() {
    const r = await fetch(base + '/research' + (view ? '?revisionId=' + view : ''), {
        cache: 'no-store',
      }),
      body = await r.json();
    if (!r.ok) throw Error(body.error?.message || '研究读取失败');
    setData(body.data);
    return body.data as ResearchWorkspace;
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
  }, [projectId, view]);
  async function send(url: string, body: unknown, method = 'POST') {
    setBusy(true);
    setError('');
    const signature = JSON.stringify([url, body, method]);
    if (pending.current?.signature !== signature)
      pending.current = { signature, key: crypto.randomUUID() };
    try {
      const r = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.current.key },
          body: JSON.stringify(body),
        }),
        b = await r.json();
      if (r.status < 500) pending.current = undefined;
      if (!r.ok) throw Error(b.error?.message || '操作失败');
      await reload();
      return b.data;
    } catch (e) {
      setError((e as Error).message);
      await reload().catch(() => {});
      return null;
    } finally {
      setBusy(false);
    }
  }
  const revision = data?.revision,
    editable = revision?.status === 'draft' && data?.currentRevisionId === revision.id;
  useEffect(() => {
    // Forks remap entity IDs. Never submit a selection from a different snapshot.
    setSelected('');
    setClaimId('');
    setClaimText('');
    setAsOf('');
    setScope('');
    setUnit('');
    setCaveats('');
    setClaimStatus('unverified');
    setEvidenceClaim('');
    setQuote('');
    setRole('support');
    setLocatorKind('text');
    setLabel('');
    setPage(1);
    setStart(0);
    setEnd(1000);
    pending.current = undefined;
  }, [revision?.id]);
  const edit = () => ({ revisionId: revision!.id, expectedVersion: revision!.version });
  const source = data?.sources.find((x) => x.id === selected) || data?.sources[0];
  const entries = data?.indexes.filter((x) => x.sourceId === source?.id) || [];
  const fileUrl = (id: string) => `/api/v1/sources/${source!.id}/files/${id}`;
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || !revision) return;
    setBusy(true);
    setError('');
    const formElement = e.currentTarget,
      fields = new FormData(formElement),
      form = new FormData();
    const metadata = {
      ...edit(),
      title: title.trim() || file.name,
      knownRestrictions: String(fields.get('restrictions') || '未知'),
      licenseStatus: String(fields.get('licenseStatus') || 'unknown'),
      ...(fields.get('sourceUrl') ? { sourceUrl: String(fields.get('sourceUrl')) } : {}),
      publisher: String(fields.get('publisher') || ''),
      creator: String(fields.get('creator') || ''),
      publishedAt: fields.get('publishedAt') || null,
    };
    const signature = JSON.stringify([metadata, file.name, file.size, file.lastModified]);
    if (pending.current?.signature !== signature)
      pending.current = { signature, key: crypto.randomUUID() };
    form.set('metadata', JSON.stringify(metadata));
    form.set('file', file);
    try {
      const r = await fetch(base + '/research-sources', {
          method: 'POST',
          headers: { 'Idempotency-Key': pending.current.key },
          body: form,
        }),
        b = await r.json();
      if (r.status < 500) pending.current = undefined;
      if (!r.ok) throw Error(b.error?.message || '上传失败');
      setSelected(b.data.id);
      setFile(undefined);
      setTitle('');
      formElement.reset();
      await reload();
    } catch (e) {
      setError((e as Error).message);
      await reload().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  function selectClaim(c: Claim) {
    setClaimId(c.id);
    setClaimText(c.text);
    setAsOf(c.asOf || '');
    setScope(c.scope);
    setUnit(c.unit);
    setCaveats(c.caveats);
    setClaimStatus(c.verificationStatus);
  }
  async function saveClaim(e: FormEvent) {
    e.preventDefault();
    const result = await send(
      base + '/claims' + (claimId ? '/' + claimId : ''),
      {
        ...edit(),
        claim: {
          text: claimText,
          asOf: asOf || null,
          scope,
          unit,
          caveats,
          verificationStatus: claimStatus,
        },
      },
      claimId ? 'PATCH' : 'POST',
    );
    if (result) {
      setEvidenceClaim(result.id);
      setClaimId('');
      setClaimText('');
      setClaimStatus('unverified');
    }
  }
  async function addEvidence(e: FormEvent) {
    e.preventDefault();
    if (!source) return;
    const locator =
      locatorKind === 'page'
        ? { kind: 'page', page, label }
        : locatorKind === 'time'
          ? { kind: 'time', startMs: start, endMs: end, label }
          : { kind: locatorKind, label: label || '用户引用位置' };
    const result = await send(base + '/research-evidence', {
      ...edit(),
      claimId: evidenceClaim || data!.claims[0]?.id,
      sourceId: source.id,
      role,
      quote,
      locator,
    });
    if (result) setQuote('');
  }
  return (
    <>
      <Notice>
        真实原件与本地提取可追溯；文本匹配仅证明引用位置，不等于事实核验。网络搜索、视觉/OCR/ASR
        尚未配置，Mock 必须显式选择。未知或不可商用限制不阻断内部测试。
      </Notice>
      {error && (
        <p role="alert" className={s.error}>
          {error}{' '}
          <button
            className={s.button}
            onClick={() =>
              reload()
                .then(() => setError(''))
                .catch((e) => setError(e.message))
            }
          >
            重新读取研究
          </button>
        </p>
      )}
      {!data && <p role="status">正在读取研究资料…</p>}
      {data && !revision && (
        <Card title="建立研究草稿">
          <p>先建立可审核的研究修订，再添加真实原件与证据。</p>
          <button
            className={s.primary}
            disabled={busy}
            onClick={async () => {
              const r = await send(base + '/artifacts', {
                type: 'research',
                text: '研究摘要待补充。当前没有已核实事实。',
                inputRevisionIds: [],
              });
              if (r) setView(r.id);
            }}
          >
            建立研究草稿
          </button>
        </Card>
      )}
      {revision && (
        <>
          <div className={s.cardHead}>
            <p>
              资料快照 v{revision.revisionNumber} · {statusLabels[revision.status]} · 并发版本{' '}
              {revision.version}
            </p>
            <a href="#research-review">研究摘要与修订审核 ↓</a>
          </div>
          {!editable && (
            <Notice>当前资料快照只读。修改已提交或已批准内容时，请在下方创建新修订。</Notice>
          )}
          <div className={s.researchGrid}>
            <div className={s.stack}>
              <Card title="研究来源" aside={<Badge>{data!.sources.length} 项</Badge>}>
                <label className={s.field}>
                  来源类型
                  <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="all">全部来源</option>
                    <option value="pdf">PDF</option>
                    <option value="image">图片</option>
                    <option value="video">短视频</option>
                    <option value="text">文本</option>
                  </select>
                </label>
                {data!.sources
                  .filter((x) => filter === 'all' || x.sourceType === filter)
                  .map((x) => (
                    <button
                      key={x.id}
                      className={s.workflowVersion}
                      aria-pressed={source?.id === x.id}
                      onClick={() => setSelected(x.id)}
                    >
                      <b>{x.title}</b>
                      <span>
                        {x.sourceType.toUpperCase()} · {x.selected ? '采用' : '未采用'} · 真实原件
                      </span>
                    </button>
                  ))}
                {!data!.sources.length && (
                  <p className={s.caption}>尚无来源。没有生成或检索任何真实文章。</p>
                )}
              </Card>
              <Card title="新增上传资料">
                <form onSubmit={upload} className={s.stack}>
                  <label className={s.field}>
                    PDF / 图片 / 短视频 / 文本
                    <input
                      aria-label="研究文件"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.mp4,.txt,.md"
                      disabled={!editable || busy}
                      onChange={(e) => setFile(e.target.files?.[0])}
                    />
                  </label>
                  <label className={s.field}>
                    来源标题
                    <input
                      value={title}
                      maxLength={250}
                      disabled={!editable}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="默认使用文件名"
                    />
                  </label>
                  <label className={s.field}>
                    已知使用限制
                    <input
                      name="restrictions"
                      defaultValue="未知"
                      maxLength={2000}
                      disabled={!editable}
                    />
                  </label>
                  <label className={s.field}>
                    来源许可备注
                    <select name="licenseStatus" disabled={!editable}>
                      <option value="unknown">商业许可未知</option>
                      <option value="blocked">不可商用 / 已知限制</option>
                      <option value="research_only">原标记：研究用途</option>
                      <option value="pending">待核查</option>
                    </select>
                  </label>
                  <details>
                    <summary>来源 URL、作者与日期（可选）</summary>
                    <div className={s.stack}>
                      <label className={s.field}>
                        来源 URL（仅记录，未访问确认）
                        <input name="sourceUrl" type="url" disabled={!editable} />
                      </label>
                      <label className={s.field}>
                        来源平台 / 发布者
                        <input name="publisher" maxLength={2000} disabled={!editable} />
                      </label>
                      <label className={s.field}>
                        作者
                        <input name="creator" maxLength={2000} disabled={!editable} />
                      </label>
                      <label className={s.field}>
                        发布日期
                        <input name="publishedAt" type="date" disabled={!editable} />
                      </label>
                    </div>
                  </details>
                  <p className={s.caption}>
                    原件大小上限由 STUDIO_MAX_UPLOAD_MB 配置；短视频默认分析上限 120
                    秒，可配置。此限制不改变项目目标时长。
                  </p>
                  <button className={s.primary} disabled={!editable || busy || !file}>
                    上传到当前研究
                  </button>
                </form>
              </Card>
              {!!data!.initialAttachments.length && (
                <Card title="项目初始资料">
                  {data!.initialAttachments.map((a) => (
                    <div key={a.id} className={s.workflowJob}>
                      <p>{a.name}</p>
                      <button
                        className={s.button}
                        disabled={!editable || busy}
                        onClick={() =>
                          send(base + '/research-import-source', { ...edit(), attachmentId: a.id })
                        }
                      >
                        加入当前研究
                      </button>
                    </div>
                  ))}
                </Card>
              )}
              <Card title="研究检索接口">
                <label className={s.field}>
                  检索词
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    maxLength={2000}
                    disabled={!editable}
                  />
                </label>
                <p className={s.caption}>真实搜索 Provider 未配置；不会伪造检索结果或文章链接。</p>
                <div className={s.actions}>
                  <button
                    className={s.button}
                    disabled={!editable || busy || !query.trim()}
                    onClick={() =>
                      send(base + '/research-search-runs', { ...edit(), query, mode: 'mock' })
                    }
                  >
                    Mock 检索演示
                  </button>
                  <button
                    className={s.button}
                    disabled={!editable || busy || !query.trim()}
                    onClick={() =>
                      send(base + '/research-search-runs', {
                        ...edit(),
                        query,
                        mode: 'unconfigured',
                      })
                    }
                  >
                    尝试未配置搜索
                  </button>
                </div>
              </Card>
            </div>
            <div className={s.stack}>
              <Card title={source?.title || '来源详情'} aside={<Badge tone="gray">真实原件</Badge>}>
                {source ? (
                  <>
                    <p className={s.caption}>
                      {source.publisher || '发布者未知'} · {source.creator || '作者未知'} · 发布{' '}
                      {source.publishedAt || '日期未知'}
                    </p>
                    <p className={s.caption}>
                      获取于 {source.retrievedAt} · {source.blob.sizeBytes.toLocaleString()} bytes
                    </p>
                    <p>
                      已知限制：{source.knownRestrictions}（{source.licenseStatus}）
                    </p>
                    {source.sourceUrl && (
                      <p className={s.workflowMeta}>用户提供 URL，未访问验证：{source.sourceUrl}</p>
                    )}
                    <div className={s.actions}>
                      <a className={s.button} href={fileUrl(source.blob.id)} download>
                        下载受保护原件
                      </a>
                      <button
                        className={s.button}
                        disabled={!editable || busy}
                        onClick={() =>
                          send(
                            base + '/research-sources/' + source.id,
                            { ...edit(), selected: !source.selected },
                            'PATCH',
                          )
                        }
                      >
                        {source.selected ? '标记不采用' : '标记采用'}
                      </button>
                    </div>
                    {source.blob.mime.startsWith('image/') && (
                      <img
                        className={s.researchImage}
                        src={fileUrl(source.blob.id)}
                        alt={source.title}
                      />
                    )}
                    {source.sourceType === 'video' && (
                      <video
                        ref={video}
                        className={s.researchVideo}
                        controls
                        muted
                        preload="metadata"
                        src={fileUrl(source.blob.id)}
                        aria-label="研究原视频"
                        onError={() =>
                          setError('浏览器无法解码原视频，请使用支持 H.264 的浏览器或下载原件。')
                        }
                      />
                    )}
                    {source.metadata && (
                      <p className={s.caption}>
                        {source.metadata.width
                          ? `${source.metadata.width} × ${source.metadata.height} · `
                          : ''}
                        {source.metadata.pages ? `${source.metadata.pages} 页 · ` : ''}
                        {source.metadata.durationMs
                          ? `${source.metadata.durationMs / 1000}s · ${source.metadata.fps || '未知'} FPS`
                          : ''}
                        {source.metadata.truncated ? ' · 已截断' : ''}
                      </p>
                    )}
                    <details>
                      <summary>原件 SHA256</summary>
                      <p className={s.workflowMeta}>{source.blob.sha256}</p>
                    </details>
                    <label className={s.field}>
                      分析模式
                      <select
                        value={mode}
                        disabled={!editable}
                        onChange={(e) => setMode(e.target.value)}
                      >
                        <option value="real">本地真实提取（不核实事实）</option>
                        <option value="mock">Mock 内容说明</option>
                        <option value="unconfigured">未配置 Provider</option>
                      </select>
                    </label>
                    <button
                      className={s.primary}
                      disabled={
                        !editable ||
                        busy ||
                        entries.length > 0 ||
                        data!.jobs.some(
                          (j) =>
                            j.researchInput?.kind === 'analyze' &&
                            j.researchInput.sourceId === source.id &&
                            ['queued', 'running'].includes(j.state),
                        )
                      }
                      onClick={() =>
                        send(base + '/research-analysis-runs', {
                          ...edit(),
                          sourceId: source.id,
                          mode,
                        })
                      }
                    >
                      分析所选来源
                    </button>
                    <p className={s.caption}>
                      仅提取元数据、文字和稀疏预览帧，不生成正式裁剪片段。已有索引保持可追溯。
                    </p>
                  </>
                ) : (
                  <p className={s.caption}>上传真实文件后显示来源、元数据和可定位索引。</p>
                )}
              </Card>
              <Card title="内容索引与引用位置" aside={<Badge>{entries.length} 条</Badge>}>
                {entries.map((entry) => (
                  <article key={entry.id} className={s.researchIndex}>
                    <div className={s.cardHead}>
                      <b>
                        {entry.page
                          ? `第 ${entry.page} 页`
                          : entry.startMs !== undefined
                            ? `${(entry.startMs / 1000).toFixed(3)}–${(entry.endMs! / 1000).toFixed(3)}s`
                            : entry.contentType}
                      </b>
                      <Badge tone={entry.provenance === 'mock' ? 'amber' : 'gray'}>
                        {entry.provenance === 'mock' ? 'Mock · 未识别' : '真实提取 · 未核实'}
                      </Badge>
                    </div>
                    <p>{entry.summary}</p>
                    {entry.frameRefs?.map((frame) => (
                      <button
                        className={s.researchFrame}
                        key={frame.blob.id}
                        onClick={() => {
                          if (video.current) video.current.currentTime = frame.timeMs / 1000;
                        }}
                      >
                        <img
                          src={fileUrl(frame.blob.id)}
                          alt={`时间码 ${frame.timeMs} ms 的真实抽帧`}
                        />
                        <span>跳转 {frame.timeMs} ms</span>
                      </button>
                    ))}
                    {entry.extractedText && (
                      <pre className={s.researchText}>{entry.extractedText}</pre>
                    )}
                  </article>
                ))}
                {!entries.length && (
                  <p className={s.caption}>
                    尚无分析索引。未配置的图表/OCR/ASR 不会自动填写数字或文本。
                  </p>
                )}
              </Card>
              <Card title="分析任务与日志">
                <p className={s.caption}>
                  共 {data!.jobs.length} 项 · 等待/运行{' '}
                  {data!.jobs.filter((j) => ['queued', 'running'].includes(j.state)).length} · 失败{' '}
                  {data!.jobs.filter((j) => j.state === 'failed').length}
                </p>
                <details>
                  <summary>查看研究任务和日志</summary>
                  {data!.jobs
                    .slice()
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((job) => (
                      <article key={job.id} className={s.workflowJob}>
                        <div className={s.cardHead}>
                          <b>
                            {!job.researchInput
                              ? '文本研究任务'
                              : job.researchInput.kind === 'search'
                                ? '来源检索'
                                : '内容分析'}
                          </b>
                          <Badge
                            tone={
                              job.provider === 'mock' || job.researchInput?.mode === 'mock'
                                ? 'amber'
                                : 'gray'
                            }
                          >
                            {job.researchInput?.mode === 'real'
                              ? '本地真实'
                              : job.provider === 'mock' || job.researchInput?.mode === 'mock'
                                ? 'Mock'
                                : '未配置'}
                          </Badge>
                        </div>
                        {!job.researchInput && (
                          <p className={s.caption}>
                            兼容原 Mock 文本接口；由文本 Worker 执行，不生成真实文章。
                          </p>
                        )}
                        <p>
                          {statusLabels[job.state]} · 尝试 {job.attempt}/{job.maxAttempts}
                        </p>
                        <progress max={1} value={job.progress || 0} className={s.motionProgress} />
                        {job.errorCode && (
                          <p role="alert" className={s.fieldError}>
                            {job.errorCode}
                          </p>
                        )}
                        {job.researchResult?.kind === 'search' && <p>{job.researchResult.notes}</p>}
                        {job.researchResult?.kind === 'analyze' &&
                          job.researchResult.warnings.map((w, i) => (
                            <p key={i} className={s.caption}>
                              {w}
                            </p>
                          ))}
                        <details>
                          <summary>执行日志 · {job.id.slice(0, 8)}</summary>
                          <pre className={s.motionLogs}>
                            {job.logs?.map((l) => `${l.at} ${l.message}`).join('\n') || '尚未执行'}
                          </pre>
                        </details>
                        <div className={s.actions}>
                          {['queued', 'running'].includes(job.state) && (
                            <button
                              className={s.button}
                              disabled={busy}
                              onClick={() =>
                                send(`/api/v1/jobs/${job.id}/cancel`, {
                                  expectedVersion: job.version,
                                })
                              }
                            >
                              取消分析任务
                            </button>
                          )}
                          {['failed', 'cancelled'].includes(job.state) &&
                            job.attempt < job.maxAttempts && (
                              <button
                                className={s.button}
                                disabled={busy}
                                onClick={() =>
                                  send(`/api/v1/jobs/${job.id}/retry`, {
                                    expectedVersion: job.version,
                                  })
                                }
                              >
                                重试分析任务
                              </button>
                            )}
                        </div>
                      </article>
                    ))}
                </details>
              </Card>
            </div>
            <div className={s.stack}>
              <Card title="Claim 与冲突证据" aside={<Badge>{data!.claims.length} 项</Badge>}>
                {data!.claims.map((c) => (
                  <article className={s.researchIndex} key={c.id}>
                    <Badge tone={c.verificationStatus === 'conflicting' ? 'amber' : 'gray'}>
                      {claimLabels[c.verificationStatus]}
                    </Badge>
                    <h3>{c.text}</h3>
                    <p className={s.caption}>
                      截至 {c.asOf || '日期未填'} · 口径 {c.scope || '未填'} · 单位{' '}
                      {c.unit || '未填'}
                    </p>
                    <p className={s.caption}>{c.caveats}</p>
                    {data!.evidence
                      .filter((e) => e.claimId === c.id)
                      .map((e) => (
                        <blockquote key={e.id} className={s.researchQuote}>
                          <b>
                            {{ support: '支持', refute: '反驳 / 冲突', context: '背景' }[e.role]} ·{' '}
                            {data!.sources.find((a) => a.id === e.sourceId)?.title}
                          </b>
                          <p>“{e.quote}”</p>
                          <small>
                            {e.locator.kind === 'page'
                              ? `第 ${e.locator.page} 页`
                              : e.locator.kind === 'time'
                                ? `${e.locator.startMs}–${e.locator.endMs} ms`
                                : e.locator.label}{' '}
                            ·{' '}
                            {e.validation === 'matched'
                              ? '引用已定位，事实未核实'
                              : e.validation === 'mock'
                                ? 'Mock，不能核实'
                                : '用户引用，待核对'}
                          </small>
                          {editable && e.role !== 'context' && (
                            <button
                              className={s.button}
                              disabled={busy}
                              onClick={() =>
                                send(
                                  base + '/research-evidence/' + e.id,
                                  {
                                    ...edit(),
                                    claimId: e.claimId,
                                    sourceId: e.sourceId,
                                    role: 'context',
                                    quote: e.quote,
                                    locator: e.locator,
                                  },
                                  'PATCH',
                                )
                              }
                            >
                              改为背景引用
                            </button>
                          )}
                        </blockquote>
                      ))}
                    <button
                      className={s.button}
                      disabled={!editable || busy}
                      onClick={() => selectClaim(c)}
                    >
                      编辑 Claim
                    </button>
                  </article>
                ))}
                {!data!.claims.length && (
                  <p className={s.caption}>尚无事实声明；不会从文件名或 Mock 自动推断事实。</p>
                )}
              </Card>
              <Card title={claimId ? '编辑 Claim' : '新增 Claim'}>
                <form onSubmit={saveClaim} className={s.stack}>
                  <label className={s.field}>
                    Claim 内容
                    <textarea
                      rows={3}
                      maxLength={5000}
                      value={claimText}
                      disabled={!editable}
                      onChange={(e) => setClaimText(e.target.value)}
                    />
                  </label>
                  <label className={s.field}>
                    事实日期
                    <input
                      type="date"
                      value={asOf}
                      disabled={!editable}
                      onChange={(e) => setAsOf(e.target.value)}
                    />
                  </label>
                  <label className={s.field}>
                    统计口径 / 范围
                    <input
                      value={scope}
                      maxLength={2000}
                      disabled={!editable}
                      onChange={(e) => setScope(e.target.value)}
                    />
                  </label>
                  <label className={s.field}>
                    单位
                    <input
                      value={unit}
                      maxLength={2000}
                      disabled={!editable}
                      onChange={(e) => setUnit(e.target.value)}
                    />
                  </label>
                  <label className={s.field}>
                    限制与说明
                    <input
                      value={caveats}
                      maxLength={2000}
                      disabled={!editable}
                      onChange={(e) => setCaveats(e.target.value)}
                    />
                  </label>
                  <label className={s.field}>
                    事实状态
                    <select
                      value={claimStatus}
                      disabled={!editable}
                      onChange={(e) => setClaimStatus(e.target.value)}
                    >
                      {Object.entries(claimLabels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className={s.primary} disabled={!editable || busy || !claimText.trim()}>
                    保存 Claim
                  </button>
                  {claimId && (
                    <button
                      type="button"
                      className={s.button}
                      onClick={() => {
                        setClaimId('');
                        setClaimText('');
                        setClaimStatus('unverified');
                      }}
                    >
                      返回新增
                    </button>
                  )}
                </form>
              </Card>
              <Card title="关联引用证据">
                <form onSubmit={addEvidence} className={s.stack}>
                  <label className={s.field}>
                    引用的 Claim
                    <select
                      value={evidenceClaim || data!.claims[0]?.id || ''}
                      disabled={!editable}
                      onChange={(e) => setEvidenceClaim(e.target.value)}
                    >
                      <option value="" disabled>
                        选择 Claim
                      </option>
                      {data!.claims.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.text}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className={s.caption}>来源：{source?.title || '请在左侧选择来源'}</p>
                  <label className={s.field}>
                    证据角色
                    <select
                      value={role}
                      disabled={!editable}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      <option value="support">支持</option>
                      <option value="refute">反驳 / 冲突</option>
                      <option value="context">背景</option>
                    </select>
                  </label>
                  <label className={s.field}>
                    原文引用
                    <textarea
                      rows={3}
                      value={quote}
                      maxLength={5000}
                      disabled={!editable}
                      onChange={(e) => setQuote(e.target.value)}
                    />
                  </label>
                  <label className={s.field}>
                    引用位置类型
                    <select
                      value={locatorKind}
                      disabled={!editable}
                      onChange={(e) => setLocatorKind(e.target.value)}
                    >
                      <option value="text">段落 / 文本</option>
                      <option value="page">PDF 页码</option>
                      <option value="time">视频时间码</option>
                      <option value="image">图片区域说明</option>
                    </select>
                  </label>
                  {locatorKind === 'page' && (
                    <label className={s.field}>
                      PDF 页码
                      <input
                        type="number"
                        min={1}
                        value={page}
                        onChange={(e) => setPage(Number(e.target.value))}
                        disabled={!editable}
                      />
                    </label>
                  )}
                  {locatorKind === 'time' && (
                    <>
                      <label className={s.field}>
                        开始毫秒
                        <input
                          type="number"
                          min={0}
                          value={start}
                          onChange={(e) => setStart(Number(e.target.value))}
                          disabled={!editable}
                        />
                      </label>
                      <label className={s.field}>
                        结束毫秒
                        <input
                          type="number"
                          min={1}
                          value={end}
                          onChange={(e) => setEnd(Number(e.target.value))}
                          disabled={!editable}
                        />
                      </label>
                    </>
                  )}
                  <label className={s.field}>
                    位置说明
                    <input
                      value={label}
                      maxLength={2000}
                      disabled={!editable}
                      onChange={(e) => setLabel(e.target.value)}
                    />
                  </label>
                  <button
                    className={s.primary}
                    disabled={!editable || busy || !source || !data!.claims.length || !quote.trim()}
                  >
                    保存引用证据
                  </button>
                </form>
              </Card>
            </div>
          </div>
        </>
      )}
      <div id="research-review" className={s.researchReview}>
        <WorkflowPanel
          projectId={projectId}
          type="research"
          integratedResearch
          onRevisionChange={setView}
        />
      </div>
    </>
  );
}
