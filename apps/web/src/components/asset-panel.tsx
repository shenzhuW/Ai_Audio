'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, Badge, Empty, Notice, s } from './ui';
import type { AssetWorkspace } from '@/server/assets/service';
import type { CandidateClip } from '@/domain/assets';
import a from './assets.module.css';
export function AssetPanel({
  projectId,
  shotId: initialShot,
  directorRevisionId,
  compact = false,
}: {
  projectId: string;
  shotId?: string;
  directorRevisionId?: string;
  compact?: boolean;
}) {
  const [data, setData] = useState<AssetWorkspace | null>(null),
    [shotId, setShotId] = useState(initialShot ?? ''),
    [scope, setScope] = useState('all'),
    [analysis, setAnalysis] = useState('real'),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState(''),
    [editingBindingVersion, setEditingBindingVersion] = useState<number | null>(null),
    [sourceId, setSourceId] = useState(''),
    [inMs, setIn] = useState(0),
    [outMs, setOut] = useState(0),
    [playback, setPlayback] = useState('once'),
    [fit, setFit] = useState('cover'),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [showJobHistory, setShowJobHistory] = useState(false),
    [filter, setFilter] = useState({
      type: 'all',
      provider: 'all',
      status: 'all',
      restriction: '',
    });
  const video = useRef<HTMLVideoElement>(null),
    pending = useRef<{ sig: string; key: string } | null>(null);
  async function load() {
    const r = await fetch(
        `/api/v1/projects/${projectId}/assets${directorRevisionId ? '?directorRevisionId=' + directorRevisionId : ''}`,
        { cache: 'no-store' },
      ),
      b = await r.json();
    if (!r.ok) throw Error(b.error?.message || '读取素材失败');
    const d = b.data as AssetWorkspace;
    setData(d);
    setShotId((old) =>
      d.shots.some((x) => x.shotId === old)
        ? old
        : (d.shots.find((x) => x.route !== 'code')?.shotId ?? d.shots[0]?.shotId ?? ''),
    );
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
    const timer = setInterval(() => load().catch((e) => setError(e.message)), 2000);
    return () => clearInterval(timer);
  }, [projectId, directorRevisionId]);
  useEffect(() => {
    if (initialShot) setShotId(initialShot);
  }, [initialShot]);
  const shot = data?.shots.find((x) => x.shotId === shotId),
    binding = data?.bindings
      .filter((b) => b.shotId === shotId)
      .sort((a, b) => b.version - a.version)[0],
    candidates = data?.candidates.filter((c) => c.shotId === shotId) ?? [],
    candidate = candidates.find((c) => c.id === selected),
    source = data?.sources.find((x) => x.id === (sourceId || candidate?.sourceAssetId)),
    prepared = data?.prepared.find((p) => p.recipeHash === binding?.recipeHash);
  const file = (key: string) => `/api/v1/projects/${projectId}/asset-files/${key}`;
  async function send(body: unknown) {
    setBusy(true);
    setError('');
    setMessage('');
    const sig = JSON.stringify(body);
    if (pending.current?.sig !== sig) pending.current = { sig, key: crypto.randomUUID() };
    try {
      const r = await fetch(`/api/v1/projects/${projectId}/assets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.current.key },
          body: JSON.stringify(body),
        }),
        b = await r.json();
      if (r.status < 500) pending.current = null;
      if (!r.ok) throw Error(`${r.status} · ${b.error?.code} · ${b.error?.message}`);
      await load();
      setMessage(
        body && typeof body === 'object' && 'action' in body && body.action === 'asset-bind'
          ? '素材使用方案已确认，自动准备任务已排队。'
          : '已保存或排队；任务日志显示真实结果。',
      );
      return b.data;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function select(c: CandidateClip) {
    setEditingBindingVersion(
      data?.bindings
        .filter((b) => b.shotId === c.shotId)
        .reduce((v, b) => Math.max(v, b.version), 0) ?? 0,
    );
    setSelected(c.id);
    setSourceId(c.sourceAssetId);
    setIn(c.sourceInMs);
    setOut(c.sourceOutMs);
    setPlayback('once');
  }
  const readonly =
    !data?.director ||
    data.director.status !== 'approved' ||
    data.stale ||
    data.director.id !== data.approvedDirectorId;
  if (!data) return <Notice>正在读取真实素材库…</Notice>;
  const controls = (
    <>
      <label className={s.field}>
        镜头
        <select
          aria-label="素材镜头"
          value={shotId}
          onChange={(e) => {
            setShotId(e.target.value);
            setSelected('');
          }}
        >
          {data.shots.map((x, i) => (
            <option key={x.shotId} value={x.shotId}>
              {i + 1}. {x.title} · {x.route}
            </option>
          ))}
        </select>
      </label>
      {shot && (
        <p>
          {shot.narrativeGoal} · 需要 {shot.visualSearchIntent.subject || '纯代码画面'} /{' '}
          {shot.visualSearchIntent.action} · {(shot.durationFrames / 30).toFixed(2)} 秒
        </p>
      )}
      {readonly && <Notice>素材搜索与绑定需要当前有效的批准导演版。历史素材保留。</Notice>}
      {shot?.route === 'code' ? (
        <Notice>此镜头为纯代码动画。改变视觉路线请先在第 06 页显式 Fork 并审核。</Notice>
      ) : (
        <div className={a.toolbar}>
          <label>
            来源
            <select aria-label="检索来源" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">本地优先 + NASA / Commons</option>
              <option value="local">已有项目 / 本地素材库</option>
              <option value="nasa">NASA Images · 真实公开 API</option>
              <option value="commons">Wikimedia Commons · 真实 API</option>
              <option value="mock">Mock · 无真实素材</option>
              <option value="unconfigured">未配置 Provider</option>
            </select>
          </label>
          <label>
            分析
            <select
              aria-label="素材分析模式"
              value={analysis}
              onChange={(e) => setAnalysis(e.target.value)}
            >
              <option value="real">Codex 真实视觉 · Top-2</option>
              <option value="metadata">仅元数据 · 未理解画面</option>
              <option value="mock">Mock 视觉</option>
            </select>
          </label>
          <label>
            检索条件
            <input
              aria-label="素材检索条件"
              placeholder="默认由主体、动作、构图和画幅生成"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            className={s.primary}
            disabled={busy || readonly || !shot}
            onClick={() =>
              send({
                action: 'asset-search',
                directorRevisionId: data.director!.id,
                shotId,
                scope,
                analysis,
                topK: 2,
                ...(query.trim() ? { query: query.trim() } : {}),
              })
            }
          >
            搜索并匹配素材
          </button>
        </div>
      )}
    </>
  );
  return (
    <div className={`${s.stack} ${a.panel}`}>
      {error && (
        <div role="alert" className={s.error}>
          {error}{' '}
          <button className={s.button} onClick={() => load().catch((e) => setError(e.message))}>
            重新载入
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {candidate &&
        editingBindingVersion !== null &&
        editingBindingVersion !== (binding?.version ?? 0) && (
          <Notice>
            本镜头已被另一窗口修改。当前编辑基于 v{editingBindingVersion}
            ；确认会返回409，请重新选择候选再核对。
          </Notice>
        )}
      <Notice>
        内部测试素材：许可未知 /
        不可商用不自动排除。保留来源及限制；不自动公开发布。视觉仅分析实际抽取的稀疏帧，候选区间需观看核对。Codex：
        {data.vision}；Pexels / Pixabay 未配置。
      </Notice>
      <Card title={compact ? '本镜头素材使用方案 · 独立版本' : '按批准镜头检索'}>{controls}</Card>
      {!compact && (
        <Card title="导入真实素材">
          <form
            className={a.toolbar}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                const form = new FormData(e.currentTarget),
                  r = await fetch(`/api/v1/projects/${projectId}/asset-upload`, {
                    method: 'POST',
                    headers: { 'Idempotency-Key': crypto.randomUUID() },
                    body: form,
                  }),
                  b = await r.json();
                if (!r.ok) throw Error(b.error?.message);
                await load();
                setMessage('原件已保存，FFprobe / 抽帧任务排队。');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              图片或视频
              <input
                type="file"
                name="file"
                aria-label="上传素材"
                accept=".png,.jpg,.jpeg,.mp4,.webm"
                required
              />
            </label>
            <label>
              标题 / 检索关键词
              <input name="title" aria-label="素材标题" placeholder="描述真实主体和动作" />
            </label>
            <label>
              作者
              <input name="author" />
            </label>
            <label>
              已知限制
              <input name="restrictions" placeholder="未知；仅内部测试" />
            </label>
            <button className={s.button} disabled={busy}>
              上传并建立索引
            </button>
          </form>
        </Card>
      )}
      <div className={a.workspace}>
        <div className={s.stack}>
          <Card title={`镜头候选 · ${candidates.length}`}>
            {!candidates.length && (
              <Empty title="尚无匹配候选">
                先检索；真实无结果不会生成假素材。可修改条件，或显式 Fork 导演选择纯代码动画。
              </Empty>
            )}
            <div className={a.grid}>
              {candidates.map((c) => {
                const x = data.sources.find((x) => x.id === c.sourceAssetId)!;
                return (
                  <button
                    className={`${a.candidate} ${selected === c.id ? a.selected : ''}`}
                    key={c.id}
                    onClick={() => select(c)}
                  >
                    {x.index && <img src={file(x.index.frames[0].blob.key)} alt={x.title} />}
                    <b>{x.title}</b>
                    <Badge tone={c.method === 'real_visual' ? 'green' : 'amber'}>
                      {c.method} · {(c.score * 100).toFixed(0)}分
                    </Badge>
                    <small>
                      {c.sourceInMs / 1000}–{c.sourceOutMs / 1000}s · {x.provider}
                    </small>
                    <p>{c.reasons.join('；')}</p>
                  </button>
                );
              })}
            </div>
          </Card>
          {!compact && (
            <Card title="原始素材库">
              <div className={a.toolbar}>
                <label>
                  媒体
                  <select
                    aria-label="媒体筛选"
                    value={filter.type}
                    onChange={(e) => setFilter({ ...filter, type: e.target.value })}
                  >
                    <option value="all">全部</option>
                    <option value="image">图片</option>
                    <option value="video">视频</option>
                  </select>
                </label>
                <label>
                  来源
                  <select
                    aria-label="来源筛选"
                    value={filter.provider}
                    onChange={(e) => setFilter({ ...filter, provider: e.target.value })}
                  >
                    {['all', 'project', 'library', 'nasa', 'commons'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  状态
                  <select
                    aria-label="状态筛选"
                    value={filter.status}
                    onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                  >
                    {['all', 'discovered', 'indexed', 'prepared'].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  已知限制
                  <input
                    aria-label="限制筛选"
                    value={filter.restriction}
                    onChange={(e) => setFilter({ ...filter, restriction: e.target.value })}
                  />
                </label>
              </div>
              <div className={a.grid}>
                {data.sources
                  .filter(
                    (x) =>
                      (filter.type === 'all' || x.kind === filter.type) &&
                      (filter.provider === 'all' || x.provider === filter.provider) &&
                      (filter.status === 'all' ||
                        x.status === filter.status ||
                        (filter.status === 'prepared' &&
                          data.prepared.some((p) => p.sourceSha256 === x.blob?.sha256))) &&
                      (x.restrictions + ' ' + x.license).includes(filter.restriction),
                  )
                  .map((x) => (
                    <button
                      className={a.candidate}
                      key={x.id}
                      onClick={() => {
                        setSourceId(x.id);
                        setSelected('');
                        setIn(0);
                        setOut(x.metadata?.durationMs ?? 0);
                      }}
                    >
                      {x.index ? (
                        <img src={file(x.index.frames[0].blob.key)} alt={x.title} />
                      ) : (
                        <div className={a.unloaded}>尚未下载 / 查看</div>
                      )}
                      <b>{x.title}</b>
                      <small>
                        {x.provider} · {x.status} · {x.license}
                      </small>
                    </button>
                  ))}
              </div>
            </Card>
          )}
        </div>
        <aside className={s.stack}>
          <Card title="真实预览与区间">
            {source ? (
              <div className={s.stack}>
                <b>{source.title}</b>
                {source.blob ? (
                  source.kind === 'video' ? (
                    <video
                      ref={video}
                      src={file(source.blob.key)}
                      controls
                      preload="metadata"
                      className={a.preview}
                    />
                  ) : (
                    <img className={a.preview} src={file(source.blob.key)} alt={source.title} />
                  )
                ) : (
                  <Notice>仅检索到元数据，尚未下载或验证画面。</Notice>
                )}
                <p>
                  {source.metadata &&
                    `${source.metadata.width} × ${source.metadata.height} · ${source.metadata.fps} FPS · ${(source.metadata.durationMs ?? 0) / 1000}s · ${source.metadata.codec}`}
                </p>
                <small className={a.hash}>源 SHA256：{source.blob?.sha256 ?? '尚未下载'}</small>
                <p>
                  {source.provider} · {source.author || '作者未提供'}
                </p>
                {source.sourceUrl && (
                  <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                    查看原始来源
                  </a>
                )}
                <p>
                  {source.license} · {source.restrictions}
                </p>
                {source.index && (
                  <>
                    <img
                      className={a.preview}
                      src={file(source.index.contactSheet.key)}
                      alt="带实际时间码的联系表"
                    />
                    <div className={a.frames}>
                      {source.index.frames.map((f) => (
                        <button
                          className={s.button}
                          key={f.id}
                          onClick={() => {
                            if (video.current) video.current.currentTime = f.atMs / 1000;
                          }}
                        >
                          {(f.atMs / 1000).toFixed(3)}s
                        </button>
                      ))}
                    </div>
                    <small>
                      实际解码 PTS；切点{' '}
                      {source.index.sceneCutsMs.map((t) => t / 1000 + 's').join('、') || '未检测到'}
                    </small>
                  </>
                )}
                {candidate && (
                  <>
                    <p>{candidate.reasons.join('；')}</p>
                    <small>{candidate.limitations.join('；')}</small>
                    <details>
                      <summary>可解释匹配分数</summary>
                      <pre className={a.hash}>{JSON.stringify(candidate.scores, null, 2)}</pre>
                    </details>
                  </>
                )}
                {source.metadata && shot?.route !== 'code' && (
                  <>
                    <div className={a.toolbar}>
                      <label>
                        入点（毫秒）
                        <input
                          type="number"
                          aria-label="素材入点"
                          value={inMs}
                          onChange={(e) => setIn(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        出点（毫秒）
                        <input
                          type="number"
                          aria-label="素材出点"
                          value={outMs}
                          onChange={(e) => setOut(Number(e.target.value))}
                        />
                      </label>
                    </div>
                    <button
                      className={s.button}
                      onClick={() => {
                        if (video.current) {
                          video.current.currentTime = inMs / 1000;
                          video.current.play().catch((e) => setError(e.message));
                        }
                      }}
                    >
                      从入点播放
                    </button>
                    <button
                      className={s.button}
                      disabled={busy || readonly}
                      onClick={async () => {
                        const c = await send({
                          action: 'asset-candidate',
                          directorRevisionId: data.director!.id,
                          shotId,
                          sourceAssetId: source.id,
                          sourceInMs: inMs,
                          sourceOutMs: outMs,
                        });
                        if (c) select(c);
                      }}
                    >
                      保存为独立区间候选
                    </button>
                    <label>
                      短片段策略
                      <select
                        aria-label="短片段策略"
                        value={playback}
                        onChange={(e) => setPlayback(e.target.value)}
                      >
                        <option value="once">单次 · 时长不足则拒绝</option>
                        <option value="loop">循环所选区间</option>
                        <option value="freeze">末帧定格</option>
                      </select>
                    </label>
                    <label>
                      画幅适配
                      <select
                        aria-label="素材画幅"
                        value={fit}
                        onChange={(e) => setFit(e.target.value)}
                      >
                        <option value="cover">居中裁满</option>
                        <option value="contain">完整保留并留黑边</option>
                      </select>
                    </label>
                    <button
                      className={s.primary}
                      disabled={busy || readonly || !candidate || candidate.method === 'mock'}
                      onClick={() =>
                        send({
                          action: 'asset-bind',
                          directorRevisionId: data.director!.id,
                          shotId,
                          candidateId: candidate!.id,
                          expectedBindingVersion: editingBindingVersion ?? 0,
                          sourceInMs: inMs,
                          sourceOutMs: outMs,
                          playback,
                          fit,
                          x: 0.5,
                          y: 0.5,
                          purpose: 'illustrative',
                        })
                      }
                    >
                      确认镜头素材并自动准备
                    </button>
                  </>
                )}
              </div>
            ) : (
              <Empty title="选择候选或原始素材">查看来源、真实画面与推荐区间。</Empty>
            )}
          </Card>
          <Card title="本镜头绑定与准备">
            {binding ? (
              <>
                <Badge tone={prepared ? 'green' : 'amber'}>
                  {prepared ? 'PreparedAsset 已就绪' : '等待 / 准备中'} · v{binding.version}
                </Badge>
                <p>
                  {binding.recipe.sourceInMs / 1000}–{binding.recipe.sourceOutMs / 1000}s ·{' '}
                  {binding.recipe.playback} · 静音
                </p>
                <small className={a.hash}>recipeHash {binding.recipeHash}</small>
                {prepared && <video className={a.preview} controls src={file(prepared.blob.key)} />}
                <button
                  className={s.button}
                  disabled={busy || readonly}
                  onClick={() => send({ action: 'asset-prepare', bindingId: binding.id })}
                >
                  重新准备 / 验证缓存
                </button>
                {prepared &&
                  prepared.metadata.width === 1080 &&
                  prepared.metadata.height === 1920 &&
                  (prepared.metadata.frames ?? 0) >= 300 && (
                    <button
                      className={s.button}
                      disabled={busy || readonly}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const r = await fetch(`/api/v1/projects/${projectId}/render-runs`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Idempotency-Key': crypto.randomUUID(),
                              },
                              body: JSON.stringify({
                                presetId: 'poc-v1',
                                titleFontSize: 72,
                                preparedBindingId: binding.id,
                              }),
                            }),
                            b = await r.json();
                          if (!r.ok) throw Error(b.error?.message);
                          setMessage('可信 Remotion 10秒合成已排队，请到第08页查看与播放。');
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      用此素材合成可信 Remotion PoC
                    </button>
                  )}
                <details>
                  <summary>逐镜历史（追加保存）</summary>
                  {data.bindings
                    .filter((b) => b.shotId === shotId)
                    .map((b) => (
                      <p className={a.hash} key={b.id}>
                        v{b.version} · {b.recipe.sourceInMs}–{b.recipe.sourceOutMs}ms · {b.id}
                      </p>
                    ))}
                </details>
              </>
            ) : (
              <p>尚未确认；纯代码或待匹配状态不会冒充已准备。</p>
            )}
            <Link href={`/projects/${projectId}/${compact ? 'assets' : 'storyboard'}`}>
              {compact ? '打开第 07 页完整素材库' : '返回第 06 页导演审核'}
            </Link>
          </Card>
        </aside>
      </div>
      {!compact && (
        <Card title="处理任务 · 心跳 / 租约 / 重试">
          <button className={s.button} onClick={() => setShowJobHistory(!showJobHistory)}>
            {showJobHistory ? '仅看最近6项' : `完整任务历史（${data.jobs.length}）`}
          </button>
          {data.jobs
            .slice()
            .reverse()
            .slice(0, showJobHistory ? data.jobs.length : 6)
            .map((j) => (
              <div className={a.job} key={j.id}>
                <b>
                  {j.assetInput?.operation} · {j.state}
                  {j.errorCode ? ' · ' + j.errorCode : ''}
                </b>
                <progress max="1" value={j.progress ?? 0} />
                <small>
                  {j.id} · attempt {j.attempt} · {j.assetResult?.cacheHit ? '缓存命中' : ''}
                </small>
                <p>{j.assetResult?.notes}</p>
                <details>
                  <summary>检索记录、模型与日志</summary>
                  <pre className={a.hash}>
                    {JSON.stringify(
                      { searches: j.assetResult?.searches, aiRuns: j.aiRuns, logs: j.logs },
                      null,
                      2,
                    )}
                  </pre>
                </details>
                {['queued', 'running', 'failed', 'cancelled'].includes(j.state) && (
                  <button
                    className={s.button}
                    disabled={busy}
                    onClick={async () => {
                      const action = ['queued', 'running'].includes(j.state) ? 'cancel' : 'retry',
                        r = await fetch(`/api/v1/jobs/${j.id}/${action}`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Idempotency-Key': crypto.randomUUID(),
                          },
                          body: JSON.stringify({ expectedVersion: j.version }),
                        });
                      if (!r.ok) {
                        const b = await r.json();
                        setError(b.error?.message);
                      }
                      await load();
                    }}
                  >
                    {['queued', 'running'].includes(j.state) ? '取消任务' : '重试失败任务'}
                  </button>
                )}
              </div>
            ))}
        </Card>
      )}
    </div>
  );
}
