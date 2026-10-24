'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Card, Badge, Notice, s } from './ui';
import { WorkflowPanel } from './workflow-panel';
import { blankShot, reflowShots, shotTime, type DirectorShot } from '@/domain/director';
import type { DirectorWorkspace } from '@/server/director/service';
export function DirectorPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<DirectorWorkspace | null>(null),
    [shots, setShots] = useState<DirectorShot[]>([]),
    [selected, setSelected] = useState(''),
    [revisionId, setRevisionId] = useState<string>(),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [count, setCount] = useState(6),
    [instruction, setInstruction] = useState(
      '围绕问题、解释、证据与总结组织镜头；保持主对象连续，素材未匹配时明确保留需求。',
    ),
    [mode, setMode] = useState('real');
  const dirtyRef = useRef(false),
    pending = useRef<{ sig: string; key: string } | null>(null);
  function edit(xs: DirectorShot[]) {
    dirtyRef.current = true;
    setDirty(true);
    setShots(xs);
  }
  async function load(id = revisionId, force = false) {
    const r = await fetch(
        `/api/v1/projects/${projectId}/director${id ? '?revisionId=' + id : ''}`,
        { cache: 'no-store' },
      ),
      b = await r.json();
    if (!r.ok) throw Error(b.error?.message || '读取失败');
    if (dirtyRef.current && !force) {
      setData((previous) =>
        previous ? { ...previous, jobs: b.data.jobs, impact: b.data.impact } : previous,
      );
      return;
    }
    const d = b.data as DirectorWorkspace;
    setData(d);
    setShots(d.shots);
    setSelected((old) => (d.shots.some((x) => x.shotId === old) ? old : d.shots[0]?.shotId || ''));
    if (force) {
      dirtyRef.current = false;
      setDirty(false);
    }
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
    const timer = setInterval(() => load().catch((e) => setError(e.message)), 2000);
    return () => clearInterval(timer);
  }, [projectId, revisionId]);
  async function send(path: string, method: string, body: unknown) {
    setBusy(true);
    setError('');
    const sig = JSON.stringify([path, method, body]);
    if (pending.current?.sig !== sig) pending.current = { sig, key: crypto.randomUUID() };
    try {
      const r = await fetch('/api/v1' + path, {
          method,
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.current.key },
          body: JSON.stringify(body),
        }),
        b = await r.json();
      if (r.status < 500) pending.current = null;
      if (!r.ok)
        throw Error(`${r.status} · ${b.error?.code || ''} · ${b.error?.message || '操作失败'}`);
      await load(revisionId, path.endsWith('/director') && ['POST', 'PATCH'].includes(method));
      return b.data;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <Card>
        <p>正在读取导演工作台…</p>
        {error && <p role="alert">{error}</p>}
      </Card>
    );
  const r = data.revision,
    doc = data.document,
    readonly = busy || !r || r.status !== 'draft' || r.id !== data.currentRevisionId;
  const shot = shots.find((x) => x.shotId === selected),
    index = shots.findIndex((x) => x.shotId === selected),
    remaining = (doc?.totalFrames ?? 0) - (shots.at(-1)?.endFrame ?? 0);
  const update = (patch: Partial<DirectorShot>) =>
    edit(shots.map((x) => (x.shotId === selected ? { ...x, ...patch } : x)));
  const toggle = (
    key: 'scriptSegmentIds' | 'voiceCueAnchorIds' | 'claimIds' | 'sourceIds',
    id: string,
  ) => {
    if (shot)
      update({
        [key]: shot[key].includes(id) ? shot[key].filter((x) => x !== id) : [...shot[key], id],
      });
  };
  const reorder = (delta: number) => {
    const xs = [...shots],
      i = index + delta;
    if (i < 0 || i >= xs.length) return;
    [xs[index], xs[i]] = [xs[i], xs[index]];
    edit(reflowShots(xs));
    setMessage('镜头已重排；后续起止帧已重算，请检查文稿和Cue时间绑定。');
  };
  const field = (label: string, value: string, onChange: (v: string) => void, rows = 2) => (
    <label className={s.field}>
      {label}
      <textarea
        aria-label={label}
        className={s.textarea}
        rows={rows}
        value={value}
        readOnly={readonly}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
  const select = (
    label: string,
    value: string,
    values: string[],
    onChange: (v: string) => void,
  ) => (
    <label className={s.field}>
      {label}
      <select
        aria-label={label}
        value={value}
        disabled={readonly}
        onChange={(e) => onChange(e.target.value)}
      >
        {values.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  const num = (label: string, value: number, onChange: (v: number) => void, min = 0) => (
    <label className={s.field}>
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        step="1"
        value={value}
        disabled={readonly}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
  return (
    <div className={s.stack}>
      <Notice>
        导演方案明确需要什么画面。示意图为受约束图形预览；尚未进行素材搜索、正式裁剪或最终视频渲染。
      </Notice>
      {error && (
        <div role="alert" className={s.error}>
          {error}
          <button
            className={s.button}
            onClick={() => load(revisionId, true).then(() => setError(''))}
          >
            重新载入（放弃本地修改）
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {data.impact.stale && (
        <Notice>
          依赖失效：{data.impact.scriptChanged ? '文稿已变化；' : ''}
          {data.impact.voiceChanged ? '配音已变化；' : ''}受影响镜头{' '}
          {data.impact.affectedShotIds.length} 个。历史内容保留，请创建新修订。
        </Notice>
      )}
      <Card
        title="固定输入与 AI 导演"
        aside={
          <Badge tone={doc?.provenance === 'mock' ? 'amber' : 'gray'}>
            {doc?.provenance === 'real'
              ? '真实 Codex 结果'
              : doc?.provenance === 'mock'
                ? 'Mock · 未调用模型'
                : '手动草稿'}
          </Badge>
        }
      >
        {doc ? (
          <>
            <p>
              {doc.durationMs / 1000} 秒 · {doc.fps} FPS · {doc.totalFrames} 帧 · {data.brief.width}{' '}
              × {data.brief.height}
            </p>
            <p className={s.caption}>
              固定文稿 {doc.scriptRevisionId} · 配音 {doc.voiceRevisionId}
            </p>
            <p className={s.caption}>
              半开帧区间，末尾向上取整不足一帧；过渡包含在镜头内。模型时间、人工时间沿用Cue原始标记。
            </p>
            {data.voice?.audio && (
              <audio
                aria-label="导演语音基准"
                controls
                preload="metadata"
                src={`/api/v1/projects/${projectId}/voice-files/${data.voice.audio.blob.id}`}
              />
            )}
          </>
        ) : (
          <>
            <p>需要当前有效且已批准的文稿与配音时间轴。</p>
            <button
              className={s.primary}
              disabled={
                busy ||
                !data.availableInputs ||
                !!r?.directorSchemaVersion ||
                r?.status === 'approved'
              }
              onClick={() =>
                send(`/projects/${projectId}/director`, 'POST', {
                  ...data.availableInputs,
                  ...(r ? { legacyRevisionId: r.id, expectedVersion: r.version } : {}),
                })
              }
            >
              建立导演草稿
            </button>
          </>
        )}
        {doc && (
          <div className={s.stack}>
            <label className={s.field}>
              Provider
              <select
                aria-label="导演Provider"
                value={mode}
                disabled={readonly}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="real">
                  Codex CLI · {data.provider.mode === 'real' ? '已启用真实模型' : '未配置'}
                </option>
                <option value="mock">显式 Mock 演示</option>
                <option value="unconfigured">未配置失败测试</option>
              </select>
            </label>
            <label className={s.field}>
              镜头数量
              <input
                aria-label="镜头数量"
                type="number"
                min="1"
                max="60"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                disabled={readonly}
              />
            </label>
            {field('导演要求', instruction, setInstruction, 3)}
            <button
              className={s.primary}
              disabled={readonly || dirty || data.impact.stale}
              onClick={() =>
                send(`/projects/${projectId}/director-runs`, 'POST', {
                  revisionId: r!.id,
                  expectedVersion: r!.version,
                  mode,
                  shotCount: count,
                  instruction,
                })
              }
            >
              AI 生成导演表
            </button>
          </div>
        )}
      </Card>
      {doc && (
        <>
          <Card
            title="导演时间轴"
            aside={
              <Badge tone={remaining ? 'amber' : 'green'}>
                剩余 {remaining} 帧 / {(remaining / doc.fps).toFixed(3)} 秒
              </Badge>
            }
          >
            <div style={{ display: 'flex', gap: 3, minHeight: 42, overflowX: 'auto' }}>
              {shots.map((x, i) => (
                <button
                  key={x.shotId}
                  aria-label={`定位镜头${i + 1}`}
                  className={s.button}
                  style={{
                    flex: `${x.durationFrames} 0 48px`,
                    background: selected === x.shotId ? '#dce8ff' : undefined,
                  }}
                  onClick={() => setSelected(x.shotId)}
                >
                  {i + 1} · {(x.durationFrames / doc.fps).toFixed(1)}s
                </button>
              ))}
            </div>
            <p className={s.caption}>
              镜头顺序与起止帧直接保存。改时长会重算本镜及后续镜头；未分配尾段可暂存，提交前必须归零。超出、负数、空隙及重叠由服务端拒绝。
            </p>
            {dirty && (
              <p>
                有未保存修改。受影响镜头：
                {shots
                  .filter((x) => {
                    const old = data.shots.find((y) => y.shotId === x.shotId);
                    return !old || old.startFrame !== x.startFrame || old.endFrame !== x.endFrame;
                  })
                  .map((x) => x.title)
                  .join('、') || '时间未变化'}
              </p>
            )}
            {data.warnings.map((w) => (
              <p key={w.shotId} className={s.fieldError}>
                镜头 {shots.findIndex((x) => x.shotId === w.shotId) + 1}：{w.issues.join('；')}
              </p>
            ))}
            <div className={s.actions}>
              <button
                className={s.button}
                disabled={readonly || shots.length >= 120 || !data.segments.length}
                onClick={() => {
                  const id = crypto.randomUUID(),
                    x = blankShot([data.segments[0].id], id, Math.max(1, remaining));
                  edit(reflowShots([...shots, x]));
                  setSelected(id);
                }}
              >
                新增镜头
              </button>
              <button
                className={s.primary}
                disabled={readonly || !dirty}
                onClick={async () => {
                  const result = await send(`/projects/${projectId}/director`, 'PATCH', {
                    revisionId: r!.id,
                    expectedVersion: r!.version,
                    shots,
                  });
                  if (result) setMessage('导演草稿已保存；段落和镜头ID保持稳定。');
                }}
              >
                保存导演草稿
              </button>
            </div>
          </Card>
          <div className={s.split}>
            <div className={s.stack}>
              <Card title={`镜头卡片 · ${shots.length}`}>
                {shots.map((x, i) => {
                  const time = shotTime(x, doc);
                  return (
                    <button
                      key={x.shotId}
                      className={s.workflowVersion}
                      aria-pressed={selected === x.shotId}
                      onClick={() => setSelected(x.shotId)}
                      style={{ width: '100%', textAlign: 'left', padding: 16, marginBottom: 12 }}
                    >
                      <b>
                        {String(i + 1).padStart(2, '0')} · {x.title}
                      </b>
                      <p>
                        {(time.startMs / 1000).toFixed(2)}—{(time.endMs / 1000).toFixed(2)}s · [
                        {x.startFrame},{x.endFrame})
                      </p>
                      <svg
                        viewBox="0 0 320 110"
                        role="img"
                        aria-label="受约束镜头示意"
                        style={{ width: '100%', background: '#edf3fb', borderRadius: 8 }}
                      >
                        {x.layers.map((layer, i) => (
                          <g
                            key={i}
                            transform={
                              'translate(' + (12 + layer.depth * 12) + ' ' + (8 + i * 14) + ')'
                            }
                          >
                            <rect
                              width={260 - layer.depth * 18}
                              height="24"
                              rx="6"
                              fill={
                                layer.kind === 'media'
                                  ? '#e0d9c8'
                                  : layer.kind === 'text'
                                    ? '#caddec'
                                    : '#c6d7fa'
                              }
                              stroke="#5579bd"
                            />
                            <text x="8" y="16" fontSize="10" fill="#243655">
                              {layer.role} · {layer.label.slice(0, 18)} · z{layer.depth}
                            </text>
                          </g>
                        ))}
                        <text x="40" y="100" fontSize="10" fill="#475569">
                          {x.visualType} · {x.animation.mechanism} · 示意
                        </text>
                      </svg>
                      <p>{x.narrativeGoal}</p>
                      <Badge tone={x.route === 'pending' ? 'amber' : 'gray'}>
                        {
                          { code: '纯代码动画', pending: '素材待匹配', bound: '已绑定真实候选' }[
                            x.route
                          ]
                        }
                      </Badge>
                      <p className={s.caption}>{x.viewerTakeaway}</p>
                    </button>
                  );
                })}
                {!shots.length && <p>尚无镜头，使用真实 AI 生成或手动添加。</p>}
              </Card>
              <Card title="版本差异">
                {data.diff ? (
                  <>
                    <p>
                      新增 {data.diff.added.length} · 删除 {data.diff.removed.length} · 内容变化{' '}
                      {data.diff.changed.length} · 顺序
                      {data.diff.orderChanged ? '已变化' : '未变化'}
                    </p>
                    <details>
                      <summary>逐镜修改前后内容与顺序</summary>
                      <pre style={{ whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(data.diff, null, 2)}
                      </pre>
                    </details>
                  </>
                ) : (
                  <p>首次修订没有父版。</p>
                )}
              </Card>
            </div>
            <div className={s.stack}>
              {shot && (
                <Card
                  title={`镜头 ${index + 1} · 逐镜编辑`}
                  aside={<Badge>{readonly ? '只读' : '草稿'}</Badge>}
                >
                  <p className={s.caption}>shotId: {shot.shotId}</p>
                  <div className={s.actions}>
                    <button
                      className={s.button}
                      disabled={readonly || index === 0}
                      onClick={() => reorder(-1)}
                    >
                      上移镜头
                    </button>
                    <button
                      className={s.button}
                      disabled={readonly || index === shots.length - 1}
                      onClick={() => reorder(1)}
                    >
                      下移镜头
                    </button>
                    <button
                      className={s.button}
                      disabled={readonly}
                      onClick={() => {
                        edit(reflowShots(shots.filter((x) => x.shotId !== selected)));
                        setSelected(shots.find((x) => x.shotId !== selected)?.shotId || '');
                      }}
                    >
                      删除镜头
                    </button>
                  </div>
                  {field('镜头标题', shot.title, (v) => update({ title: v }), 1)}
                  {field('叙事任务', shot.narrativeGoal, (v) => update({ narrativeGoal: v }))}
                  {field('观众理解', shot.viewerTakeaway, (v) => update({ viewerTakeaway: v }))}
                  {num(
                    '镜头时长（帧）',
                    shot.durationFrames,
                    (v) =>
                      edit(
                        reflowShots(
                          shots.map((x) =>
                            x.shotId === selected ? { ...x, durationFrames: v } : x,
                          ),
                        ),
                      ),
                    1,
                  )}
                  <p>
                    起止帧 [{shot.startFrame},{shot.endFrame}) · 转场不改变总时长
                  </p>
                  <details open>
                    <summary>文稿与口播绑定</summary>
                    {data.segments.map((seg, i) => (
                      <label key={seg.id} className={s.field}>
                        <span>
                          <input
                            type="checkbox"
                            disabled={readonly}
                            checked={shot.scriptSegmentIds.includes(seg.id)}
                            onChange={() => toggle('scriptSegmentIds', seg.id)}
                          />{' '}
                          第 {i + 1} 段 · {seg.purpose}
                        </span>
                        <span>{seg.text}</span>
                        <small>{seg.id}</small>
                      </label>
                    ))}
                    {data.voice?.mode === 'none' ? (
                      <p>静默时间范围，无语音Cue。</p>
                    ) : (
                      data.cues
                        .filter((c) => shot.scriptSegmentIds.includes(c.segmentId))
                        .map((c) => (
                          <label key={c.anchorId} className={s.field}>
                            <span>
                              <input
                                type="checkbox"
                                disabled={readonly}
                                checked={shot.voiceCueAnchorIds.includes(c.anchorId)}
                                onChange={() => toggle('voiceCueAnchorIds', c.anchorId)}
                              />
                              {c.startMs / 1000}–{c.endMs / 1000}s · {c.alignment} · {c.level}
                            </span>
                            <span>{c.text}</span>
                            <small>{c.anchorId}</small>
                          </label>
                        ))
                    )}
                    <p className={s.caption}>
                      空锚点表示按明确帧区间规划，不伪造词级对齐；多个段落可合用一镜。
                    </p>
                  </details>
                  {select(
                    '视觉类型',
                    shot.visualType,
                    ['diagram', 'chart', 'typography', 'footage', 'mixed'],
                    (v) => update({ visualType: v as DirectorShot['visualType'] }),
                  )}
                  {select('执行路线', shot.route, ['code', 'pending', 'bound'], (v) =>
                    update({
                      route: v as DirectorShot['route'],
                      media: null,
                      visualSearchIntent: {
                        ...shot.visualSearchIntent,
                        format: v === 'code' ? 'none' : 'image',
                      },
                      layers:
                        v === 'code'
                          ? shot.layers.map((l) => ({
                              ...l,
                              kind: l.kind === 'media' ? 'graphic' : l.kind,
                            }))
                          : shot.layers,
                    }),
                  )}
                  {field('构图', shot.composition, (v) => update({ composition: v }))}
                  <details open>
                    <summary>画面层级与2.5D</summary>
                    {shot.layers.map((layer, i) => (
                      <div key={i} style={{ borderBottom: '1px solid #dde5ee', padding: 8 }}>
                        {field(
                          `图层${i + 1}说明`,
                          layer.label,
                          (v) =>
                            update({
                              layers: shot.layers.map((l, j) => (j === i ? { ...l, label: v } : l)),
                            }),
                          1,
                        )}
                        {select(`图层${i + 1}类型`, layer.kind, ['graphic', 'text', 'media'], (v) =>
                          update({
                            layers: shot.layers.map((l, j) =>
                              j === i ? { ...l, kind: v as typeof l.kind } : l,
                            ),
                          }),
                        )}
                        {select(
                          `图层${i + 1}层级`,
                          layer.role,
                          ['background', 'content', 'foreground', 'caption'],
                          (v) =>
                            update({
                              layers: shot.layers.map((l, j) =>
                                j === i ? { ...l, role: v as typeof l.role } : l,
                              ),
                            }),
                        )}
                        {num(`图层${i + 1}深度`, layer.depth, (v) =>
                          update({
                            layers: shot.layers.map((l, j) => (j === i ? { ...l, depth: v } : l)),
                          }),
                        )}
                        <button
                          className={s.button}
                          disabled={readonly || shot.layers.length === 1}
                          onClick={() => update({ layers: shot.layers.filter((_, j) => j !== i) })}
                        >
                          移除此层
                        </button>
                      </div>
                    ))}
                    <button
                      className={s.button}
                      disabled={readonly || shot.layers.length >= 12}
                      onClick={() =>
                        update({
                          layers: [
                            ...shot.layers,
                            { kind: 'graphic', role: 'foreground', label: '解释层', depth: 2 },
                          ],
                        })
                      }
                    >
                      添加画面层
                    </button>
                  </details>
                  {select(
                    '推荐动画机制',
                    shot.animation.mechanism,
                    [
                      'static_focus',
                      'pan_target',
                      'parallax25d',
                      'highlight',
                      'relationship',
                      'data_change',
                    ],
                    (v) =>
                      update({
                        animation: {
                          ...shot.animation,
                          mechanism: v as DirectorShot['animation']['mechanism'],
                        },
                      }),
                  )}
                  {field('动画解释目的', shot.animation.reason, (v) =>
                    update({ animation: { ...shot.animation, reason: v } }),
                  )}
                  {select('转场', shot.transition.type, ['cut', 'match', 'push', 'dissolve'], (v) =>
                    update({
                      transition: {
                        ...shot.transition,
                        type: v as DirectorShot['transition']['type'],
                      },
                    }),
                  )}
                  {num('转场帧数', shot.transition.durationFrames, (v) =>
                    update({ transition: { ...shot.transition, durationFrames: v } }),
                  )}
                  {field('镜头连续性', shot.transition.continuity, (v) =>
                    update({ transition: { ...shot.transition, continuity: v } }),
                  )}
                  {shot.route !== 'code' && (
                    <>
                      <Notice>
                        {shot.route === 'pending'
                          ? '素材待匹配：仅保存需求，Phase 07 搜索后再绑定。'
                          : '只选择当前固定研究中的真实图片/视频；不会自动搜索或裁剪。'}
                      </Notice>
                      {Object.entries(shot.visualSearchIntent)
                        .filter(([k]) => k !== 'format')
                        .map(([k, v]) => (
                          <div key={k}>
                            {field(
                              `素材需求 ${k}`,
                              v,
                              (value) =>
                                update({
                                  visualSearchIntent: { ...shot.visualSearchIntent, [k]: value },
                                }),
                              1,
                            )}
                          </div>
                        ))}
                      {select('素材格式', shot.visualSearchIntent.format, ['image', 'video'], (v) =>
                        update({
                          visualSearchIntent: {
                            ...shot.visualSearchIntent,
                            format: v as 'image' | 'video',
                          },
                        }),
                      )}
                      {shot.route === 'bound' && (
                        <>
                          <label className={s.field}>
                            已有真实候选
                            <select
                              aria-label="已有真实候选"
                              value={shot.media?.sourceId || ''}
                              disabled={readonly}
                              onChange={(e) => {
                                const source = data.sources.find((s) => s.id === e.target.value);
                                if (source)
                                  update({
                                    media: {
                                      sourceId: source.id,
                                      sourceInMs: source.sourceType === 'video' ? 0 : null,
                                      sourceOutMs:
                                        source.sourceType === 'video'
                                          ? source.metadata!.durationMs!
                                          : null,
                                      playback: 'once',
                                    },
                                    sourceIds: [...new Set([...shot.sourceIds, source.id])],
                                  });
                              }}
                            >
                              <option value="">选择候选</option>
                              {data.sources
                                .filter(
                                  (s) => ['image', 'video'].includes(s.sourceType) && s.metadata,
                                )
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.title} · {s.sourceType}
                                  </option>
                                ))}
                            </select>
                          </label>
                          {shot.media &&
                            data.sources.find((s) => s.id === shot.media!.sourceId)?.sourceType ===
                              'video' && (
                              <>
                                {num('源片段开始毫秒', shot.media.sourceInMs ?? 0, (v) =>
                                  update({ media: { ...shot.media!, sourceInMs: v } }),
                                )}
                                {num(
                                  '源片段结束毫秒',
                                  shot.media.sourceOutMs ?? 1,
                                  (v) => update({ media: { ...shot.media!, sourceOutMs: v } }),
                                  1,
                                )}
                                {select(
                                  '素材播放方式',
                                  shot.media.playback,
                                  ['once', 'loop', 'freeze'],
                                  (v) =>
                                    update({
                                      media: {
                                        ...shot.media!,
                                        playback: v as 'once' | 'loop' | 'freeze',
                                      },
                                    }),
                                )}
                              </>
                            )}
                        </>
                      )}
                    </>
                  )}
                  <details>
                    <summary>关联 Claim、Source 与限制</summary>
                    <Link prefetch={false} href={`/projects/${projectId}/research`}>
                      查看研究来源 →
                    </Link>
                    {data.claims
                      .filter((c) =>
                        data.segments
                          .filter((s) => shot.scriptSegmentIds.includes(s.id))
                          .some((s) => s.factBindings.some((b) => b.claimId === c.id)),
                      )
                      .map((c) => (
                        <label key={c.id} className={s.field}>
                          <span>
                            <input
                              type="checkbox"
                              checked={shot.claimIds.includes(c.id)}
                              disabled={readonly}
                              onChange={() => toggle('claimIds', c.id)}
                            />
                            {c.text}
                          </span>
                          <small>
                            {c.verificationStatus} · {c.caveats}
                          </small>
                        </label>
                      ))}
                    {data.sources.map((source) => (
                      <label key={source.id} className={s.field}>
                        <span>
                          <input
                            type="checkbox"
                            disabled={readonly}
                            checked={shot.sourceIds.includes(source.id)}
                            onChange={() => toggle('sourceIds', source.id)}
                          />
                          {source.title}
                        </span>
                        <small>
                          {source.sourceUrl || '用户上传'} · {source.creator} ·{' '}
                          {source.licenseStatus} · {source.knownRestrictions || '未声明额外限制'}
                        </small>
                      </label>
                    ))}
                  </details>
                  {field(
                    '制作风险（每行一项）',
                    shot.risks.join('\n'),
                    (v) => update({ risks: v.split('\n').filter(Boolean) }),
                    3,
                  )}
                </Card>
              )}
            </div>
          </div>
        </>
      )}
      <Card title="导演任务与模型审计">
        {data.jobs
          .slice()
          .reverse()
          .map((j) => (
            <div key={j.id} className={s.workflowJob}>
              <p>
                <b>
                  {j.provider === 'director' ? `${j.directorInput?.mode} 导演任务` : '旧工作流任务'}
                </b>{' '}
                · {j.state} · {j.errorCode || ''} · {j.attempt}/{j.maxAttempts}
              </p>
              <small>{j.id}</small>
              {j.aiRuns?.map((run) => (
                <p key={run.runId} className={s.caption}>
                  {run.model} · run {run.runId} · {run.durationMs}ms ·{' '}
                  {run.failureReason || '模型调用完成；内容须审核'}
                </p>
              ))}
              <details>
                <summary>状态日志</summary>
                {j.logs?.map((l, i) => (
                  <p className={s.caption} key={i}>
                    {l.at} · {l.message}
                  </p>
                ))}
              </details>
              <div className={s.actions}>
                {['queued', 'running'].includes(j.state) && (
                  <button
                    className={s.button}
                    disabled={busy}
                    onClick={() =>
                      send(`/jobs/${j.id}/cancel`, 'POST', { expectedVersion: j.version })
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
                      send(`/jobs/${j.id}/retry`, 'POST', { expectedVersion: j.version })
                    }
                  >
                    重试任务
                  </button>
                )}
              </div>
            </div>
          ))}
      </Card>
      <WorkflowPanel
        projectId={projectId}
        type="storyboard"
        integratedDirector
        externalDirty={dirty}
        externalRevision={r ? { id: r.id, version: r.version } : undefined}
        onRevisionChange={(id) => {
          if (!dirtyRef.current) setRevisionId(id);
        }}
      />
    </div>
  );
}
