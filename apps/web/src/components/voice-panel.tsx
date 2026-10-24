'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { VoiceWorkspace } from '@/server/voice/service';
import type { VoiceCue, SubtitleCue } from '@/domain/voice';
import { Card, Badge, Notice, s } from './ui';
import { WorkflowPanel } from './workflow-panel';
import v from './voice.module.css';
type Draft = {
  durationMs: number;
  cues: VoiceCue[];
  subtitles: SubtitleCue[];
  alignmentConfirmed: boolean;
};
const labels = { tts: 'AI / TTS配音', import: '导入配音', none: '无口播' };
const timing = {
  manual: '人工校时',
  estimated: '估算 · 非精确对齐',
  planned: '静默编排',
  forced: '真实模型对齐 · 待听校',
};
const clock = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, '0')}:${((ms % 60000) / 1000).toFixed(3).padStart(6, '0')}`;
export function VoicePanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<VoiceWorkspace>(),
    [draft, setDraft] = useState<Draft>(),
    [view, setView] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [position, setPosition] = useState(0),
    [file, setFile] = useState<File>(),
    [voiceName, setVoiceName] = useState(''),
    [rate, setRate] = useState(0),
    [provider, setProvider] = useState('windows-sapi'),
    [offset, setOffset] = useState(0),
    [cueFilter, setCueFilter] = useState('sentence');
  const audio = useRef<HTMLAudioElement>(null),
    dirtyRef = useRef(false),
    version = useRef(0),
    pending = useRef<{ signature: string; key: string } | null>(null);
  const base = `/api/v1/projects/${projectId}`;
  async function reload(force = false) {
    const response = await fetch(base + '/voice-timeline' + (view ? '?revisionId=' + view : ''), {
        cache: 'no-store',
      }),
      body = await response.json();
    if (!response.ok) throw Error(body.error?.message || '配音读取失败');
    const w = body.data as VoiceWorkspace;
    setData(w);
    if (w.timeline && (!dirtyRef.current || force)) {
      setDraft({
        durationMs: w.timeline.durationMs,
        cues: w.cues,
        subtitles: w.track?.cues ?? [],
        alignmentConfirmed: w.timeline.alignmentConfirmed,
      });
      version.current = w.revision!.version;
      dirtyRef.current = false;
      setDirty(false);
    }
    return w;
  }
  useEffect(() => {
    reload().catch((e) => setError(e.message));
    const timer = setInterval(() => reload().catch((e) => setError(e.message)), 2000);
    return () => clearInterval(timer);
  }, [projectId, view]);
  function mark(update: (d: Draft) => Draft) {
    dirtyRef.current = true;
    setDirty(true);
    setDraft((d) => (d ? update(d) : d));
  }
  async function send(url: string, body: unknown, method = 'POST') {
    setBusy(true);
    setError('');
    const signature = JSON.stringify([url, body, method]);
    if (pending.current?.signature !== signature)
      pending.current = { signature, key: crypto.randomUUID() };
    try {
      const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.current.key },
          body: JSON.stringify(body),
        }),
        b = await response.json();
      if (response.status < 500) pending.current = null;
      if (!response.ok)
        throw Error(`${response.status} ${b.error?.code || ''}：${b.error?.message || '操作失败'}`);
      dirtyRef.current = false;
      setDirty(false);
      await reload(true);
      return b.data;
    } catch (e) {
      setError((e as Error).message);
      await reload().catch(() => {});
      return null;
    } finally {
      setBusy(false);
    }
  }
  const r = data?.revision,
    doc = data?.timeline,
    editable = !!r && r.status === 'draft' && r.id === data?.currentRevisionId,
    locked = !editable || busy;
  const jobs =
      data?.jobs
        .filter((j) => j.provider === 'voice' && j.voiceInput?.revisionId === r?.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [],
    running = jobs.some((j) => ['queued', 'running'].includes(j.state));
  const edit = () => ({ revisionId: r!.id, expectedVersion: dirty ? version.current : r!.version });
  function seek(ms: number) {
    setPosition(ms);
    if (audio.current) audio.current.currentTime = ms / 1000;
  }
  function changeCue(id: string, patch: Partial<VoiceCue>) {
    mark((d) => ({
      ...d,
      alignmentConfirmed: false,
      cues: d.cues.map((c) =>
        c.id === id
          ? {
              ...c,
              ...patch,
              alignment: doc?.mode === 'none' ? 'planned' : 'manual',
              alignmentRunId: undefined,
              stale: false,
            }
          : c,
      ),
    }));
  }
  function bindCue(c: VoiceCue, segmentId: string, startChar: number, endChar: number) {
    const segment = data!.segments.find((s) => s.id === segmentId);
    if (segment)
      changeCue(c.id, {
        segmentId,
        startChar,
        endChar,
        text: segment.text.slice(startChar, endChar),
        segmentTextSha256: segment.textSha256,
      });
  }
  async function save() {
    if (!draft) return;
    await send(base + '/voice-timeline', { ...edit(), ...draft }, 'PATCH');
  }
  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file || !r) return;
    setBusy(true);
    setError('');
    const form = new FormData();
    form.set('file', file);
    form.set('metadata', JSON.stringify(edit()));
    const signature = JSON.stringify(['upload', edit(), file.name, file.size, file.lastModified]);
    if (pending.current?.signature !== signature)
      pending.current = { signature, key: crypto.randomUUID() };
    try {
      const response = await fetch(base + '/voice-audio', {
          method: 'POST',
          headers: { 'Idempotency-Key': pending.current.key },
          body: form,
        }),
        b = await response.json();
      if (response.status < 500) pending.current = null;
      if (!response.ok) throw Error(`${response.status} ${b.error?.code}：${b.error?.message}`);
      setFile(undefined);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function generate(purpose: 'preview' | 'final') {
    return send(base + '/voice-runs', {
      ...edit(),
      provider,
      voice: voiceName || data?.providers.system.voices[0]?.name || 'unconfigured',
      rate,
      purpose,
    });
  }
  function analyze(operation: 'transcribe' | 'align') {
    return send(base + '/voice-analysis-runs', {
      ...edit(),
      operation,
      provider: data?.providers.asr.configured ? 'whisper-local' : 'unconfigured',
    });
  }
  const active = draft?.subtitles.find((c) => position >= c.startMs && position < c.endMs);
  const filtered = draft?.cues.filter((c) => cueFilter === 'all' || c.level === cueFilter) ?? [];
  return (
    <>
      <Notice>
        真实音频时长、识别草稿、模型对齐与人工校正分别保存。原文绑定固定批准文稿，字幕编辑不修改文稿或事实引用。无口播仅编排静默节奏。
      </Notice>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {!data && <p role="status">正在读取配音工作区…</p>}
      {data && !doc && (
        <Card title="建立配音时间轴">
          <p>使用当前有效已批准文稿；三种模式均保留真实状态。</p>
          {!data.availableScript && <Notice>尚无有效批准文稿，请先完成第04页审核。</Notice>}
          <div className={s.actions}>
            {Object.entries(labels).map(([mode, label]) => (
              <button
                className={s.primary}
                key={mode}
                disabled={busy || !data.availableScript}
                onClick={async () => {
                  const result = await send(base + '/voice-timeline', {
                    scriptRevisionId: data.availableScript!.id,
                    ...(data.revision?.status === 'draft' && !data.revision.voiceSchemaVersion
                      ? {
                          legacyRevisionId: data.revision.id,
                          expectedVersion: data.revision.version,
                        }
                      : {}),
                    mode,
                  });
                  if (result) setView(result.id);
                }}
              >
                {label} · 建立草稿
              </button>
            ))}
          </div>
        </Card>
      )}
      {data && doc && draft && r && (
        <>
          {dirty && (
            <Notice>
              有未保存修改，审核和切换版本暂不可用。
              {r.version !== version.current
                ? '服务器版本已变化；保存会返回409，编辑缓冲区保持。'
                : ''}
            </Notice>
          )}
          {data.impact.stale && (
            <Notice>
              上游批准文稿已变化；当前音频与字幕保留旧修订。受影响锚点{' '}
              {data.impact.affectedAnchorIds.length} 个，请Fork并重新生成/导入、对齐。
            </Notice>
          )}
          {!editable && <Notice>当前修订只读。修改请在下方创建新修订。</Notice>}
          <div className={v.grid}>
            <div className={s.stack}>
              <Card
                title="声音制作"
                aside={
                  <Badge>
                    {labels[doc.mode]} · v{r.revisionNumber}
                  </Badge>
                }
              >
                <div className={s.actions}>
                  {Object.entries(labels).map(([mode, label]) => (
                    <button
                      aria-pressed={doc.mode === mode}
                      className={doc.mode === mode ? s.primary : s.button}
                      disabled={locked || dirty || running || doc.mode === mode}
                      key={mode}
                      onClick={() => send(base + '/voice-mode', { ...edit(), mode })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className={s.caption}>
                  固定文稿 {doc.scriptRevisionId} · 时长基准{' '}
                  {doc.timingBasis === 'audio'
                    ? 'FFprobe实测'
                    : doc.mode === 'none'
                      ? '静默目标时长'
                      : '等待真实音频'}
                </p>
                {doc.audio ? (
                  <>
                    <audio
                      ref={audio}
                      aria-label="配音播放器"
                      className={v.audio}
                      controls
                      preload="metadata"
                      src={base + '/voice-files/' + doc.audio.blob.id}
                      onTimeUpdate={(e) =>
                        setPosition(Math.round(e.currentTarget.currentTime * 1000))
                      }
                    />
                    <p>
                      {clock(position)} / {clock(doc.audio.durationMs)} · {doc.audio.codec} ·{' '}
                      {doc.audio.sampleRate} Hz · {doc.audio.channels} 声道
                    </p>
                    <details>
                      <summary>音频原件与用途</summary>
                      <p>
                        {doc.audio.blob.name} · {doc.audio.origin} ·{' '}
                        {doc.audio.purpose === 'final' ? '正式声轨' : '临时试听'}
                      </p>
                      <p className={v.hash}>SHA256 {doc.audio.blob.sha256}</p>
                    </details>
                  </>
                ) : (
                  <Notice>
                    {doc.mode === 'none'
                      ? '静默编排，没有音频、转录或语音置信度。'
                      : '尚无真实音频；可保存草稿，生成或导入成功后再确认正式时间基准。'}
                  </Notice>
                )}
                <label className={s.field}>
                  时间定位（毫秒）
                  <input
                    type="range"
                    aria-label="时间轴定位"
                    min={0}
                    max={draft.durationMs}
                    value={Math.min(position, draft.durationMs)}
                    onChange={(e) => seek(Number(e.target.value))}
                  />
                </label>
                <div className={v.subtitle} data-testid="active-subtitle">
                  <small>{clock(position)} · 当前字幕</small>
                  <p aria-live="polite">{active?.text || '此时没有字幕'}</p>
                </div>
                <div className={v.timeline} aria-label="Cue时间分布">
                  {draft.cues
                    .filter((c) => c.level === 'sentence')
                    .map((c) => (
                      <button
                        key={c.id}
                        aria-label={`跳转Cue ${c.text}`}
                        title={`${clock(c.startMs)}–${clock(c.endMs)} ${timing[c.alignment]}`}
                        style={{
                          left: `${(c.startMs / draft.durationMs) * 100}%`,
                          width: `${Math.max(0.3, ((c.endMs - c.startMs) / draft.durationMs) * 100)}%`,
                        }}
                        onClick={() => seek(c.startMs)}
                      />
                    ))}
                </div>
                {doc.mode === 'import' && (
                  <form onSubmit={upload} className={s.stack}>
                    <label className={s.field}>
                      上传真实口播音频
                      <input
                        type="file"
                        accept=".wav,.mp3,.m4a,.flac,.ogg,.opus"
                        disabled={locked || dirty || running}
                        onChange={(e) => setFile(e.target.files?.[0])}
                      />
                    </label>
                    <button className={s.primary} disabled={locked || dirty || running || !file}>
                      导入并执行FFprobe
                    </button>
                  </form>
                )}
                {doc.mode === 'none' && (
                  <label className={s.field}>
                    静默时间轴时长（秒）
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={draft.durationMs / 1000}
                      disabled={locked}
                      onChange={(e) => {
                        const ms = Math.round(Number(e.target.value) * 1000);
                        mark((d) => ({
                          ...d,
                          durationMs: ms,
                          alignmentConfirmed: false,
                          cues: d.cues.map((c) => ({
                            ...c,
                            startMs: Math.round((c.startMs / d.durationMs) * ms),
                            endMs: Math.round((c.endMs / d.durationMs) * ms),
                          })),
                          subtitles: d.subtitles.map((c) => ({
                            ...c,
                            startMs: Math.round((c.startMs / d.durationMs) * ms),
                            endMs: Math.round((c.endMs / d.durationMs) * ms),
                          })),
                        }));
                      }}
                    />
                  </label>
                )}
              </Card>
              <Card title="字幕与时间编辑" aside={<Badge>{draft.subtitles.length} 条</Badge>}>
                {draft.subtitles.map((c, i) => (
                  <article className={v.row} key={c.id} data-subtitle-id={c.id}>
                    <label className={s.field}>
                      第{i + 1}条字幕
                      <textarea
                        className={s.textarea}
                        rows={2}
                        value={c.text}
                        disabled={locked}
                        onChange={(e) =>
                          mark((d) => ({
                            ...d,
                            alignmentConfirmed: false,
                            subtitles: d.subtitles.map((s) =>
                              s.id === c.id ? { ...s, text: e.target.value } : s,
                            ),
                          }))
                        }
                      />
                    </label>
                    <div className={s.formGrid}>
                      <label className={s.field}>
                        字幕{i + 1}开始（秒）
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          value={c.startMs / 1000}
                          disabled={locked}
                          onChange={(e) =>
                            mark((d) => ({
                              ...d,
                              alignmentConfirmed: false,
                              subtitles: d.subtitles.map((s) =>
                                s.id === c.id
                                  ? { ...s, startMs: Math.round(Number(e.target.value) * 1000) }
                                  : s,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label className={s.field}>
                        字幕{i + 1}结束（秒）
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          value={c.endMs / 1000}
                          disabled={locked}
                          onChange={(e) =>
                            mark((d) => ({
                              ...d,
                              alignmentConfirmed: false,
                              subtitles: d.subtitles.map((s) =>
                                s.id === c.id
                                  ? { ...s, endMs: Math.round(Number(e.target.value) * 1000) }
                                  : s,
                              ),
                            }))
                          }
                        />
                      </label>
                    </div>
                    <label className={s.field}>
                      字幕{i + 1}文稿段落
                      <select
                        value={c.segmentId ?? ''}
                        disabled={locked}
                        onChange={(e) =>
                          mark((d) => ({
                            ...d,
                            alignmentConfirmed: false,
                            subtitles: d.subtitles.map((s) =>
                              s.id === c.id
                                ? { ...s, segmentId: e.target.value || null, anchorId: null }
                                : s,
                            ),
                          }))
                        }
                      >
                        <option value="">识别草稿 · 尚未绑定</option>
                        {data.segments.map((s, i) => (
                          <option value={s.id} key={s.id}>
                            第{i + 1}段 · {s.text.slice(0, 35)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className={s.actions}>
                      <button className={s.button} onClick={() => seek(c.startMs)}>
                        定位字幕{i + 1}
                      </button>
                      <button
                        className={s.button}
                        disabled={locked}
                        onClick={() =>
                          mark((d) => ({
                            ...d,
                            alignmentConfirmed: false,
                            subtitles: d.subtitles.filter((s) => s.id !== c.id),
                          }))
                        }
                      >
                        删除字幕{i + 1}
                      </button>
                    </div>
                  </article>
                ))}
                <button
                  className={s.button}
                  disabled={locked || !data.segments.length}
                  onClick={() =>
                    mark((d) => ({
                      ...d,
                      alignmentConfirmed: false,
                      subtitles: [
                        ...d.subtitles,
                        {
                          id: crypto.randomUUID(),
                          anchorId: null,
                          segmentId: data.segments[0].id,
                          text: '新字幕',
                          startMs: position,
                          endMs: Math.min(d.durationMs, position + 1000),
                        },
                      ],
                    }))
                  }
                >
                  添加字幕
                </button>
              </Card>
              <Card title="Cue锚点与文本位置" aside={<Badge>{draft.cues.length} 个</Badge>}>
                <label className={s.field}>
                  显示Cue层级
                  <select value={cueFilter} onChange={(e) => setCueFilter(e.target.value)}>
                    <option value="sentence">句级</option>
                    <option value="phrase">短语级</option>
                    <option value="word">词级</option>
                    <option value="all">全部</option>
                  </select>
                </label>
                {filtered.map((c, i) => (
                  <article className={v.row} key={c.id} data-anchor-id={c.anchorId}>
                    <Badge tone={c.stale ? 'amber' : 'gray'}>
                      {c.stale ? '时间失效 · 须重核' : timing[c.alignment]}
                    </Badge>
                    <p>{c.text}</p>
                    <small className={v.hash}>
                      anchorId {c.anchorId} · {c.level}
                    </small>
                    <div className={s.formGrid}>
                      <label className={s.field}>
                        Cue{i + 1}开始（秒）
                        <input
                          type="number"
                          step="0.001"
                          min={0}
                          value={c.startMs / 1000}
                          disabled={locked}
                          onChange={(e) =>
                            changeCue(c.id, { startMs: Math.round(Number(e.target.value) * 1000) })
                          }
                        />
                      </label>
                      <label className={s.field}>
                        Cue{i + 1}结束（秒）
                        <input
                          type="number"
                          step="0.001"
                          min={0}
                          value={c.endMs / 1000}
                          disabled={locked}
                          onChange={(e) =>
                            changeCue(c.id, { endMs: Math.round(Number(e.target.value) * 1000) })
                          }
                        />
                      </label>
                    </div>
                    <details>
                      <summary>文本范围与重复词定位</summary>
                      <label className={s.field}>
                        Cue{i + 1}段落
                        <select
                          disabled={locked}
                          value={c.segmentId}
                          onChange={(e) =>
                            bindCue(
                              c,
                              e.target.value,
                              0,
                              data.segments.find((s) => s.id === e.target.value)?.text.length ?? 1,
                            )
                          }
                        >
                          {data.segments.map((s, i) => (
                            <option key={s.id} value={s.id}>
                              第{i + 1}段 · {s.text}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className={s.formGrid}>
                        <label className={s.field}>
                          Cue{i + 1}起始字符
                          <input
                            type="number"
                            min={0}
                            value={c.startChar}
                            disabled={locked}
                            onChange={(e) =>
                              bindCue(c, c.segmentId, Number(e.target.value), c.endChar)
                            }
                          />
                        </label>
                        <label className={s.field}>
                          Cue{i + 1}末端字符
                          <input
                            type="number"
                            min={1}
                            value={c.endChar}
                            disabled={locked}
                            onChange={(e) =>
                              bindCue(c, c.segmentId, c.startChar, Number(e.target.value))
                            }
                          />
                        </label>
                      </div>
                      <p className={v.hash}>
                        UTF-16 [{c.startChar},{c.endChar}) · 段落SHA256 {c.segmentTextSha256}
                      </p>
                      <label className={s.field}>
                        Cue{i + 1}层级
                        <select
                          value={c.level}
                          disabled={locked}
                          onChange={(e) =>
                            changeCue(c.id, { level: e.target.value as VoiceCue['level'] })
                          }
                        >
                          <option value="sentence">句子</option>
                          <option value="phrase">短语</option>
                          <option value="word">词</option>
                        </select>
                      </label>
                    </details>
                    <div className={s.actions}>
                      <button className={s.button} onClick={() => seek(c.startMs)}>
                        定位Cue{i + 1}
                      </button>
                      <button
                        className={s.button}
                        disabled={locked}
                        onClick={() =>
                          mark((d) => ({
                            ...d,
                            alignmentConfirmed: false,
                            cues: d.cues.filter((v) => v.id !== c.id),
                            subtitles: d.subtitles.map((s) =>
                              s.anchorId === c.anchorId ? { ...s, anchorId: null } : s,
                            ),
                          }))
                        }
                      >
                        删除Cue{i + 1}
                      </button>
                    </div>
                  </article>
                ))}
                <button
                  className={s.button}
                  disabled={locked || !data.segments.length}
                  onClick={() => {
                    const segment = data.segments[0];
                    mark((d) => ({
                      ...d,
                      alignmentConfirmed: false,
                      cues: [
                        ...d.cues,
                        {
                          id: crypto.randomUUID(),
                          anchorId: crypto.randomUUID(),
                          segmentId: segment.id,
                          level: 'phrase',
                          startChar: 0,
                          endChar: segment.text.length,
                          segmentTextSha256: segment.textSha256,
                          text: segment.text,
                          startMs: position,
                          endMs: Math.min(d.durationMs, position + 1000),
                          alignment: doc.mode === 'none' ? 'planned' : 'manual',
                          confidence: null,
                          stale: false,
                        },
                      ],
                    }));
                    setCueFilter('phrase');
                  }}
                >
                  添加短语Cue
                </button>
              </Card>
            </div>
            <aside className={s.stack}>
              <Card title="配音参数与真实Provider">
                <p>{data.providers.system.note}</p>
                <p>云端AI TTS：未配置；Codex数据CLI不作为TTS。</p>
                <label className={s.field}>
                  TTS Provider
                  <select
                    value={provider}
                    disabled={locked || dirty || running}
                    onChange={(e) => setProvider(e.target.value)}
                  >
                    <option value="windows-sapi">本机系统TTS · 真实音频</option>
                    <option value="unconfigured">云端AI TTS · 未配置</option>
                    <option value="mock">显式Mock · 不生成声音</option>
                  </select>
                </label>
                <label className={s.field}>
                  系统声线
                  <select
                    value={voiceName || data.providers.system.voices[0]?.name || ''}
                    disabled={locked || dirty || running}
                    onChange={(e) => setVoiceName(e.target.value)}
                  >
                    {!data.providers.system.voices.length && <option value="">未配置</option>}
                    {data.providers.system.voices.map((v) => (
                      <option value={v.name} key={v.name}>
                        {v.name} · {v.language}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={s.field}>
                  系统语速档位
                  <input
                    type="number"
                    min={-10}
                    max={10}
                    value={rate}
                    disabled={locked || dirty || running}
                    onChange={(e) => setRate(Number(e.target.value))}
                  />
                </label>
                <div className={s.actions}>
                  <button
                    className={s.button}
                    disabled={locked || dirty || running || doc.mode !== 'tts'}
                    onClick={() => generate('preview')}
                  >
                    试听首段（临时）
                  </button>
                  <button
                    className={s.primary}
                    disabled={locked || dirty || running || doc.mode !== 'tts'}
                    onClick={() => generate('final')}
                  >
                    生成正式配音
                  </button>
                </div>
              </Card>
              <Card title="识别与真实强制对齐">
                <p>
                  ASR：{data.providers.asr.configured ? '真实本地Whisper' : '未配置'} · 强制对齐：
                  {data.providers.alignment.configured ? '真实stable-ts模型' : '未配置'}
                </p>
                <p className={s.caption}>
                  {data.providers.asr.note} 单任务音频上限{data.providers.asr.maxSeconds}秒。
                </p>
                <button
                  className={s.button}
                  disabled={locked || dirty || running || !doc.audio || doc.mode === 'none'}
                  onClick={() => analyze('transcribe')}
                >
                  真实识别并生成字幕草稿
                </button>
                <button
                  className={s.primary}
                  disabled={locked || dirty || running || !doc.audio || doc.mode === 'none'}
                  onClick={() => analyze('align')}
                >
                  按批准文稿强制对齐
                </button>
                <p className={s.caption}>
                  识别草稿可能有错字；对齐将使用实际音频和固定文稿重新生成时间，覆盖前请先保存。模型对齐不等于人工核验精度，零时长词不编造时长。
                </p>
              </Card>
              <Card title="保存与时间基准">
                <label className={s.field}>
                  整体偏移（毫秒）
                  <input
                    type="number"
                    step={1}
                    value={offset}
                    disabled={locked}
                    onChange={(e) => setOffset(Number(e.target.value))}
                  />
                </label>
                <button
                  className={s.button}
                  disabled={locked}
                  onClick={() =>
                    mark((d) => ({
                      ...d,
                      alignmentConfirmed: false,
                      cues: d.cues.map((c) => ({
                        ...c,
                        startMs: c.startMs + offset,
                        endMs: c.endMs + offset,
                        alignment: doc.mode === 'none' ? 'planned' : 'manual',
                        alignmentRunId: undefined,
                      })),
                      subtitles: d.subtitles.map((c) => ({
                        ...c,
                        startMs: c.startMs + offset,
                        endMs: c.endMs + offset,
                      })),
                    }))
                  }
                >
                  应用整体偏移
                </button>
                <button
                  className={s.button}
                  disabled={locked || dirty || running}
                  onClick={() => send(base + '/voice-retime', edit())}
                >
                  重建估算 / 静默节奏
                </button>
                <label className={v.check}>
                  <input
                    type="checkbox"
                    checked={draft.alignmentConfirmed}
                    disabled={locked}
                    onChange={(e) => mark((d) => ({ ...d, alignmentConfirmed: e.target.checked }))}
                  />
                  我已试听或检查并确认当前时间基准；人工/估算不会因此变成精确模型对齐。
                </label>
                <button className={s.primary} disabled={locked || !dirty} onClick={save}>
                  保存时间轴与字幕
                </button>
                <button
                  className={s.button}
                  disabled={busy}
                  onClick={() => {
                    dirtyRef.current = false;
                    reload(true)
                      .then(() => setError(''))
                      .catch((e) => setError(e.message));
                  }}
                >
                  重新载入（放弃本地修改）
                </button>
                <p className={s.caption}>
                  当前并发版本 {r.version} · 目标{clock(doc.targetDurationMs)} · 当前
                  {clock(draft.durationMs)}
                </p>
              </Card>
              {data.diff && (
                <Card title="与父修订差异">
                  <p>
                    配置{data.diff.timelineChanged ? '已变化' : '相同'} · 变化锚点
                    {data.diff.cueChanges.length} · 字幕
                    {data.diff.subtitleChanges ? '有变化' : '相同'}
                  </p>
                </Card>
              )}
              <Card title="任务、运行与产物">
                {!jobs.length && <p>尚无任务。导入、试听、生成、识别及对齐均使用真实Job。</p>}
                {jobs.map((j) => (
                  <article className={v.row} key={j.id}>
                    <Badge>
                      {j.voiceInput?.operation} · {j.state}
                    </Badge>
                    <p className={v.hash}>Job {j.id}</p>
                    <p>{j.errorCode}</p>
                    {j.voiceResult?.kind === 'audio' && j.voiceResult.purpose === 'preview' && (
                      <audio
                        aria-label="临时试听播放器"
                        controls
                        className={v.audio}
                        src={base + '/voice-files/' + j.voiceResult.audio.blob.id}
                      />
                    )}
                    {j.voiceResult?.kind === 'asr' && (
                      <>
                        <p>真实识别原文（未人工校正）</p>
                        <blockquote>{j.voiceResult.transcript}</blockquote>
                      </>
                    )}
                    {j.voiceResult && <p className={s.caption}>{j.voiceResult.notes}</p>}
                    <details>
                      <summary>运行审计与日志</summary>
                      {j.voiceRuns?.map((run) => (
                        <p className={v.hash} key={run.runId}>
                          {run.provider} · {run.runId} · {(run.durationMs / 1000).toFixed(2)}秒 ·{' '}
                          {run.failureReason || '调用完成'}
                        </p>
                      ))}
                      {j.voiceResult && 'model' in j.voiceResult && (
                        <p className={v.hash}>
                          {j.voiceResult.model} · {j.voiceResult.engineVersion} · 模型SHA{' '}
                          {j.voiceResult.modelSha256} · 音频SHA {j.voiceResult.audioSha256}
                        </p>
                      )}
                      {j.logs?.map((l, i) => (
                        <p key={i}>
                          {l.at} {l.message}
                        </p>
                      ))}
                    </details>
                    <div className={s.actions}>
                      {['queued', 'running'].includes(j.state) && (
                        <button
                          className={s.button}
                          disabled={busy}
                          onClick={() =>
                            send(`/api/v1/jobs/${j.id}/cancel`, { expectedVersion: j.version })
                          }
                        >
                          取消语音任务
                        </button>
                      )}
                      {['failed', 'cancelled'].includes(j.state) && j.attempt < j.maxAttempts && (
                        <button
                          className={s.button}
                          disabled={locked || dirty}
                          onClick={() =>
                            send(`/api/v1/jobs/${j.id}/retry`, { expectedVersion: j.version })
                          }
                        >
                          重试语音任务
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </Card>
            </aside>
          </div>
        </>
      )}
      <div className={s.researchReview}>
        <WorkflowPanel
          projectId={projectId}
          type="voice"
          integratedVoice
          externalDirty={dirty}
          externalRevision={r ? { id: r.id, version: r.version } : undefined}
          onRevisionChange={(id) => {
            if (!dirty) {
              setView(id);
              setPosition(0);
            } else setError('请先保存或放弃本地修改。');
          }}
        />
      </div>
    </>
  );
}
