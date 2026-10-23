'use client';
import { useEffect, useRef, useState } from 'react';
import { Card, Badge, Notice, s } from './ui';
import { WorkflowPanel } from './workflow-panel';
import {
  purposeLabels,
  ScriptSegmentSchema,
  estimateScript,
  type ScriptSegment,
} from '@/domain/script';
import { claimLabels } from '@/domain/research';
import { statusLabels } from '@/domain/workflow';
import type { ScriptWorkspace } from '@/server/script/service';
const seconds = (ms: number) => (ms / 1000).toFixed(1) + ' 秒';
export function ScriptPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ScriptWorkspace>(),
    [view, setView] = useState(''),
    [compare, setCompare] = useState('');
  const [segments, setSegments] = useState<ScriptSegment[]>([]),
    [units, setUnits] = useState(240),
    [selected, setSelected] = useState('');
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [importText, setImportText] = useState(''),
    [instruction, setInstruction] = useState('保持事实边界和引用，改善解释逻辑与口语节奏。'),
    [mode, setMode] = useState('unconfigured');
  const buffer = useRef({ revisionId: '', version: 0 }),
    dirtyRef = useRef(false),
    pending = useRef<{ signature: string; key: string } | undefined>(undefined);
  const initialized = useRef(false);
  dirtyRef.current = dirty;
  const base = `/api/v1/projects/${projectId}`;
  async function read(force = false, signal?: AbortSignal) {
    const qs = new URLSearchParams();
    if (view) qs.set('revisionId', view);
    if (compare) qs.set('compareId', compare);
    const r = await fetch(base + '/script?' + qs, { cache: 'no-store', signal }),
      body = await r.json();
    if (!r.ok) throw Error(body.error?.message || '读取文稿失败');
    const next = body.data as ScriptWorkspace;
    if (signal?.aborted) return;
    setData(next);
    if (!initialized.current) {
      initialized.current = true;
      setImportText(next.brief.originalScript);
    }
    if (
      force ||
      (!dirtyRef.current &&
        (buffer.current.revisionId !== next.revision?.id ||
          buffer.current.version !== next.revision?.version))
    ) {
      buffer.current = {
        revisionId: next.revision?.id ?? '',
        version: next.revision?.version ?? 0,
      };
      setSegments(next.segments);
      setUnits(next.document?.unitsPerMinute ?? (next.brief.language.startsWith('zh') ? 240 : 150));
      setDirty(false);
      dirtyRef.current = false;
    }
    return next;
  }
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () =>
      read(false, controller.signal).catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    refresh();
    const timer = setInterval(refresh, 1500);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [projectId, view, compare]);
  function change(xs: ScriptSegment[]) {
    setSegments(xs);
    setDirty(true);
    dirtyRef.current = true;
    setMessage('');
  }
  function update(id: string, patch: Partial<ScriptSegment>) {
    change(segments.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  async function send(url: string, body: unknown, method = 'POST') {
    setBusy(true);
    setError('');
    setMessage('');
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
      if (r.status < 500) pending.current = undefined;
      if (!r.ok)
        throw Error((r.status === 409 ? '409 并发冲突：' : '') + (b.error?.message || '操作失败'));
      return b.data;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const r = await send(
      base + '/script',
      {
        revisionId: buffer.current.revisionId,
        expectedVersion: buffer.current.version,
        segments,
        unitsPerMinute: units,
      },
      'PATCH',
    );
    if (r) {
      await read(true);
      setMessage('段落草稿已保存');
    }
  }
  async function start(origin: 'user_provided' | 'research' | 'legacy') {
    const r = await send(base + '/script', {
      origin,
      text:
        origin === 'legacy'
          ? data?.revision?.text
          : importText || (origin === 'research' ? data?.research.approvedRevision?.text : ''),
      ...(origin === 'research' ? { researchRevisionId: data?.research.approvedRevision?.id } : {}),
    });
    if (r) {
      setView(r.id);
      setMessage('结构化草稿已建立；导入不是 AI 生成。');
    }
  }
  async function generate(partial: boolean) {
    const r = await send(base + '/script-runs', {
      revisionId: buffer.current.revisionId,
      expectedVersion: buffer.current.version,
      instruction,
      mode,
      ...(partial ? { segmentId: active?.id } : {}),
    });
    if (r) {
      setMessage('写作任务已排队：' + r.jobId);
      await read();
    }
  }
  const revision = data?.revision,
    editable =
      revision?.status === 'draft' && data?.currentRevisionId === revision.id && !!data?.document;
  const active = segments.find((x) => x.id === selected) || segments[0];
  const validUnits = Number.isFinite(units) && units >= 60 && units <= 600;
  const timing = estimateScript(
    segments,
    validUnits ? units : 240,
    data?.brief.targetDurationMs ?? 1,
  );
  function move(id: string, by: number) {
    const xs = [...segments],
      i = xs.findIndex((x) => x.id === id),
      j = i + by;
    if (j < 0 || j >= xs.length) return;
    [xs[i], xs[j]] = [xs[j], xs[i]];
    change(xs);
  }
  const sourceIds = (claimId: string) => [
    ...new Set(
      data!.research.evidence
        .filter(
          (e) =>
            e.claimId === claimId &&
            data!.research.sources.some((x) => x.id === e.sourceId && x.selected),
        )
        .map((e) => e.sourceId),
    ),
  ];
  return (
    <>
      <Notice>
        文稿以叙事段落组织，一段可覆盖多个镜头。引用只来自固定批准研究；用户自带文稿可跳过研究。真实写作模型未配置，Mock
        需显式选择；估时不等于实测配音。
      </Notice>
      {error && (
        <p role="alert" className={s.error}>
          {error}{' '}
          <button
            className={s.button}
            onClick={() =>
              read(true)
                .then(() => setError(''))
                .catch((e) => setError(e.message))
            }
          >
            重新载入文稿（放弃本地修改）
          </button>
        </p>
      )}
      {message && (
        <p role="status" className={s.workflowMessage}>
          {message}
        </p>
      )}
      {!data && <p role="status">正在读取结构化文稿…</p>}
      {data && !data.document && (
        <Card title={revision ? '旧文本修订' : '建立结构化文稿'}>
          {revision ? (
            <>
              <p>旧文本完整保留；批准/驳回版本请先创建新修订，再转换当前草稿。</p>
              <pre className={s.scriptPlain}>{revision.text}</pre>
              <button
                className={s.primary}
                disabled={
                  busy || revision.status !== 'draft' || data.currentRevisionId !== revision.id
                }
                onClick={() => start('legacy')}
              >
                转换当前草稿为结构化文稿
              </button>
            </>
          ) : (
            <>
              <label className={s.field}>
                已有文稿 / 初始正文
                <textarea
                  rows={6}
                  maxLength={50000}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
              </label>
              <div className={s.actions}>
                <button
                  className={s.primary}
                  disabled={busy}
                  onClick={() => start('user_provided')}
                >
                  导入文稿 / 建立空白草稿
                </button>
                <button
                  className={s.button}
                  disabled={busy || !data.research.approvedRevision}
                  onClick={() => start('research')}
                >
                  从批准研究建立草稿
                </button>
              </div>
              <p className={s.caption}>
                {data.research.approvedRevision
                  ? `可用研究 v${data.research.approvedRevision.revisionNumber}；仅导入摘要作为起点，不冒充 AI 写稿。`
                  : '尚无批准研究，可直接导入用户文稿或建立空白草稿。'}
              </p>
            </>
          )}
        </Card>
      )}
      {data?.document && (
        <>
          <div className={s.cardHead}>
            <b>
              文稿快照 v{revision!.revisionNumber} · {statusLabels[revision!.status]}
            </b>
            <Badge tone={revision!.mock ? 'amber' : 'gray'}>
              {revision!.mock
                ? 'Mock · 未调用真实模型'
                : data.document.origin === 'user_provided'
                  ? '用户提供 · 未独立核实'
                  : data.document.origin === 'legacy'
                    ? '旧文稿导入 · 未独立核实'
                    : '研究依据草稿 · 未独立核实'}
            </Badge>
          </div>
          {!editable && (
            <Notice>当前文稿快照只读。修改已提交、已批准或已驳回内容，请创建新修订。</Notice>
          )}
          {data.impact.stale && (
            <Notice>
              上游研究已更新，引用旧研究的段落需要重新检查。原批准版保留；创建新修订切换输入后须重新绑定事实。
            </Notice>
          )}
          {dirty && data.revision?.version !== buffer.current.version && (
            <Notice>服务器已有更新；本地编辑仍保留，保存会返回 409，请先核对再重新载入。</Notice>
          )}
          <div className={s.scriptGrid}>
            <aside className={s.stack}>
              <Card title="文稿段落" aside={<Badge tone="gray">{segments.length} 段</Badge>}>
                {segments.map((x, i) => (
                  <button
                    key={x.id}
                    className={s.workflowVersion}
                    aria-pressed={active?.id === x.id}
                    onClick={() => setSelected(x.id)}
                  >
                    {String(i + 1).padStart(2, '0')} · {purposeLabels[x.purpose]}
                    <small className={s.caption}>
                      {x.text.slice(0, 50) || '空段落'} ·{' '}
                      {seconds(
                        timing.details.find((t) => t.segmentId === x.id)?.estDurationMs ?? 0,
                      )}
                    </small>
                  </button>
                ))}
                <button
                  className={s.button}
                  disabled={!editable || busy || segments.length >= 300}
                  onClick={() => {
                    const x = ScriptSegmentSchema.parse({
                      id: crypto.randomUUID(),
                      text: '',
                      purpose: 'explanation',
                    });
                    change([...segments, x]);
                    setSelected(x.id);
                  }}
                >
                  添加段落
                </button>
              </Card>
              <Card title="整体写稿与局部改写">
                <label className={s.field}>
                  写作 Provider
                  <select
                    value={mode}
                    disabled={!editable || busy || dirty}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    <option value="unconfigured">真实模型 · 未配置</option>
                    <option value="mock">显式 Mock 结构演示</option>
                  </select>
                </label>
                <label className={s.field}>
                  改写要求
                  <textarea
                    rows={4}
                    maxLength={2500}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    disabled={!editable || busy}
                  />
                </label>
                <div className={s.actions}>
                  <button
                    className={s.button}
                    disabled={
                      !editable || busy || dirty || !instruction.trim() || data.impact.stale
                    }
                    onClick={() => generate(false)}
                  >
                    整体写稿
                  </button>
                  <button
                    className={s.button}
                    disabled={
                      !editable ||
                      busy ||
                      dirty ||
                      !active ||
                      !instruction.trim() ||
                      data.impact.stale
                    }
                    onClick={() => generate(true)}
                  >
                    仅改写当前段落
                  </button>
                </div>
                <p className={s.caption}>
                  先保存编辑，再启动后台任务。Mock 是流程示范，不是 AI 成稿。
                </p>
              </Card>
            </aside>
            <section className={s.stack} aria-label="口播文稿编辑器">
              <Card
                title="可编辑口播正文"
                aside={
                  <button
                    className={s.primary}
                    disabled={!editable || busy || !dirty || !validUnits}
                    onClick={save}
                  >
                    保存段落草稿
                  </button>
                }
              >
                {segments.length === 0 && <p>尚无段落，请添加、导入或选择显式 Mock 演示。</p>}
                {segments.map((x, i) => (
                  <article key={x.id} className={s.scriptSegment} data-segment-id={x.id}>
                    <div className={s.cardHead}>
                      <button className={s.button} onClick={() => setSelected(x.id)}>
                        段落 {i + 1} · {purposeLabels[x.purpose]}
                      </button>
                      <small>{seconds(timing.details[i]?.estDurationMs ?? 0)}</small>
                    </div>
                    <label className={s.field}>
                      第{i + 1}段正文
                      <textarea
                        rows={4}
                        value={x.text}
                        maxLength={10000}
                        readOnly={!editable}
                        onFocus={() => setSelected(x.id)}
                        onChange={(e) => update(x.id, { text: e.target.value })}
                      />
                    </label>
                    <div className={s.cols2}>
                      <label className={s.field}>
                        第{i + 1}段叙事用途
                        <select
                          disabled={!editable}
                          value={x.purpose}
                          onChange={(e) =>
                            update(x.id, { purpose: e.target.value as ScriptSegment['purpose'] })
                          }
                        >
                          {Object.entries(purposeLabels).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={s.field}>
                        第{i + 1}段节奏
                        <select
                          disabled={!editable}
                          value={x.delivery}
                          onChange={(e) =>
                            update(x.id, { delivery: e.target.value as ScriptSegment['delivery'] })
                          }
                        >
                          <option value="normal">正常解释</option>
                          <option value="slow">放慢 · 留出理解时间</option>
                          <option value="brisk">紧凑</option>
                        </select>
                      </label>
                    </div>
                    <details>
                      <summary>叙事意图、视觉提示与停顿</summary>
                      <label className={s.field}>
                        第{i + 1}段观众收获
                        <input
                          maxLength={1000}
                          value={x.viewerTakeaway}
                          readOnly={!editable}
                          onChange={(e) => update(x.id, { viewerTakeaway: e.target.value })}
                        />
                      </label>
                      <label className={s.field}>
                        第{i + 1}段画面意图
                        <textarea
                          rows={2}
                          maxLength={1500}
                          value={x.visualIntent}
                          readOnly={!editable}
                          onChange={(e) => update(x.id, { visualIntent: e.target.value })}
                        />
                      </label>
                      <label className={s.field}>
                        第{i + 1}段停顿毫秒
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          step={100}
                          value={x.pauseMs}
                          readOnly={!editable}
                          onChange={(e) => update(x.id, { pauseMs: Number(e.target.value) })}
                        />
                      </label>
                    </details>
                    <p className={s.caption}>
                      稳定段落 ID：{x.id} · 关联 Claim {x.factBindings.length} 项
                    </p>
                    {data.warnings
                      .find((w) => w.segmentId === x.id)
                      ?.notes.map((note) => (
                        <p className={s.fieldError} key={note}>
                          {note}
                        </p>
                      ))}
                    {x.needsRebind && (
                      <button
                        className={s.button}
                        disabled={!editable}
                        onClick={() => update(x.id, { needsRebind: false })}
                      >
                        已重新核对该段引用
                      </button>
                    )}
                    <div className={s.actions}>
                      <button
                        className={s.button}
                        disabled={!editable || i === 0}
                        aria-label={`上移第${i + 1}段`}
                        onClick={() => move(x.id, -1)}
                      >
                        上移
                      </button>
                      <button
                        className={s.button}
                        disabled={!editable || i === segments.length - 1}
                        aria-label={`下移第${i + 1}段`}
                        onClick={() => move(x.id, 1)}
                      >
                        下移
                      </button>
                      <button
                        className={s.button}
                        disabled={!editable}
                        aria-label={`删除第${i + 1}段`}
                        onClick={() => change(segments.filter((y) => y.id !== x.id))}
                      >
                        删除
                      </button>
                    </div>
                  </article>
                ))}
                {dirty && <p role="status">有未保存的段落修改；保存后再审核或改写。</p>}
              </Card>
            </section>
            <aside className={s.stack}>
              <Card title="时长与节奏">
                <p>目标时长：{seconds(timing.targetDurationMs)}</p>
                <p>
                  预计口播：<b>{seconds(timing.estDurationMs)}</b>
                </p>
                <p>
                  目标差异：{timing.differenceMs >= 0 ? '+' : ''}
                  {seconds(timing.differenceMs)}
                </p>
                <label className={s.field}>
                  朗读单位每分钟
                  <input
                    type="number"
                    min={60}
                    max={600}
                    value={units}
                    disabled={!editable}
                    onChange={(e) => {
                      setUnits(Number(e.target.value));
                      setDirty(true);
                    }}
                  />
                </label>
                <p className={s.caption}>{timing.note}</p>
                {!validUnits && (
                  <p role="alert" className={s.fieldError}>
                    请输入 60–600 之间的朗读单位；当前暂按 240 估算，不能保存无效设置。
                  </p>
                )}
                {Math.abs(timing.differenceMs) > timing.targetDurationMs * 0.15 && (
                  <p className={s.fieldError}>
                    {timing.differenceMs > 0
                      ? '可精简重复信息或拆分长段，不建议自动加速配音。'
                      : '可补充解释和必要铺垫；不要为凑时长编造事实。'}
                  </p>
                )}
                {segments[0] && segments[0].purpose !== 'hook' && (
                  <p className={s.caption}>节奏提示：检查开场是否尽快提出观众关心的问题。</p>
                )}
                {timing.details.some((t) => t.units > 120) && (
                  <p className={s.caption}>节奏提示：存在长段，可按解释层次分段并安排停顿。</p>
                )}
              </Card>
              <Card title="当前段落依据">
                <p>
                  {data.document.researchRevisionId
                    ? `固定研究 v${data.research.boundRevision?.revisionNumber}`
                    : '用户提供文稿，未强制绑定研究。'}
                </p>
                {active &&
                  data.research.claims.map((c) => (
                    <div key={c.id} className={s.scriptFact}>
                      <label>
                        <input
                          type="checkbox"
                          disabled={!editable}
                          checked={active.factBindings.some((b) => b.claimId === c.id)}
                          onChange={(e) =>
                            update(active.id, {
                              factBindings: e.target.checked
                                ? [
                                    ...active.factBindings,
                                    { claimId: c.id, sourceIds: sourceIds(c.id) },
                                  ]
                                : active.factBindings.filter((b) => b.claimId !== c.id),
                            })
                          }
                        />{' '}
                        {c.text}
                      </label>
                      <Badge tone={c.verificationStatus === 'conflicting' ? 'amber' : 'gray'}>
                        {claimLabels[c.verificationStatus]}
                      </Badge>
                      <p className={s.caption}>
                        日期 {c.asOf || '未填'} · 口径 {c.scope || '未填'} · 单位 {c.unit || '未填'}
                      </p>
                      <p className={s.caption}>{c.caveats}</p>
                      <details>
                        <summary>查看 Claim 来源与引用位置</summary>
                        {data.research.evidence
                          .filter((e) => e.claimId === c.id)
                          .map((e) => {
                            const source = data.research.sources.find((x) => x.id === e.sourceId);
                            return (
                              <blockquote className={s.researchQuote} key={e.id}>
                                <b>
                                  {source?.title} ·{' '}
                                  {e.role === 'refute'
                                    ? '反驳 / 冲突'
                                    : e.role === 'support'
                                      ? '支持'
                                      : '背景'}
                                </b>
                                <p>“{e.quote}”</p>
                                <small>
                                  {e.locator.kind === 'page'
                                    ? `PDF 第 ${e.locator.page} 页`
                                    : e.locator.kind === 'time'
                                      ? `${e.locator.startMs}–${e.locator.endMs} ms`
                                      : e.locator.label}{' '}
                                  ·{' '}
                                  {e.validation === 'matched'
                                    ? '原文已定位，事实未独立核实'
                                    : e.validation === 'mock'
                                      ? 'Mock 引用'
                                      : '未定位核验'}
                                </small>
                                {source && (
                                  <>
                                    <p>{source.knownRestrictions}</p>
                                    <a
                                      className={s.link}
                                      href={`/api/v1/sources/${source.id}/files/${source.blob.id}`}
                                    >
                                      查看 / 下载来源原件
                                    </a>
                                  </>
                                )}
                              </blockquote>
                            );
                          })}
                      </details>
                    </div>
                  ))}
                {!data.research.claims.length && (
                  <p className={s.caption}>没有可绑定的研究 Claim，不会生成伪造来源。</p>
                )}
              </Card>
              <Card title="修改影响">
                <p>绑定旧研究的受影响段落：{data.impact.researchAffectedSegmentIds.length}</p>
                {data.impact.downstream.map((d) => (
                  <p className={s.caption} key={d.revisionId}>
                    {d.revisionId.slice(0, 8)} · 文稿 v
                    {data.revisions.find((r) => r.id === d.upstreamRevisionId)?.revisionNumber} ·{' '}
                    {d.stale
                      ? '依赖失效'
                      : revision?.status === 'draft' && d.wouldBeStale
                        ? '批准此草稿后需更新'
                        : '当前依赖有效'}{' '}
                    · {d.segmentIds?.length ? `${d.segmentIds.length} 个指定段落` : '整个文稿修订'}
                  </p>
                ))}
                {!data.impact.downstream.length && (
                  <p className={s.caption}>尚无实际下游产物；配音/导演模块在后续阶段实现。</p>
                )}
              </Card>
            </aside>
          </div>
          <Card title="版本差异">
            <label className={s.field}>
              比较基准版本
              <select
                value={compare || data.comparisonRevisionId || ''}
                disabled={dirty}
                onChange={(e) => setCompare(e.target.value)}
              >
                <option value="">无 / 默认父版本</option>
                {data.revisions
                  .filter((r) => r.id !== revision?.id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      v{r.revisionNumber} · {statusLabels[r.status]}
                    </option>
                  ))}
              </select>
            </label>
            {data.diff.map((d) => (
              <details key={d.segmentId}>
                <summary>
                  {d.segmentId.slice(0, 8)} ·{' '}
                  {d.changes
                    .map(
                      (c) =>
                        ({
                          added: '新增',
                          removed: '删除',
                          text: '正文',
                          order: '顺序',
                          factBindings: '事实引用',
                          purpose: '叙事用途',
                          delivery: '节奏',
                          pauseMs: '停顿',
                          viewerTakeaway: '观众收获',
                          visualIntent: '画面意图',
                          needsRebind: '待重绑',
                        })[c] || c,
                    )
                    .join('、')}
                </summary>
                <div className={s.cols2}>
                  <pre className={s.scriptPlain}>之前：{d.before?.text || '无'}</pre>
                  <pre className={s.scriptPlain}>之后：{d.after?.text || '无'}</pre>
                </div>
              </details>
            ))}
            {!data.diff.length && (
              <p className={s.caption}>当前保存版本与基准无段落差异，或尚无基准版本。</p>
            )}
          </Card>
          <Card title="写作任务与日志">
            <details>
              <summary>查看 {data.jobs.length} 项文稿任务</summary>
              {data.jobs.map((j) => (
                <div key={j.id} className={s.workflowJob}>
                  <b>
                    {j.provider === 'script'
                      ? j.scriptInput?.mode === 'mock'
                        ? 'Mock 写作演示'
                        : '真实模型未配置'
                      : '旧文本 Mock 任务'}
                  </b>{' '}
                  · {statusLabels[j.state]}
                  <p className={s.caption}>
                    {j.id} · 尝试 {j.attempt}/{j.maxAttempts} {j.errorCode}
                  </p>
                  {j.scriptResult && <p>{j.scriptResult.notes}</p>}
                  {j.logs?.map((l, i) => (
                    <p className={s.caption} key={i}>
                      {l.at} · {l.message}
                    </p>
                  ))}
                  {['queued', 'running', 'failed', 'cancelled'].includes(j.state) && (
                    <button
                      className={s.button}
                      disabled={busy || dirty || j.attempt >= j.maxAttempts}
                      onClick={async () => {
                        await send(
                          `/api/v1/jobs/${j.id}/${['queued', 'running'].includes(j.state) ? 'cancel' : 'retry'}`,
                          { expectedVersion: j.version },
                        );
                        await read();
                      }}
                    >
                      {['queued', 'running'].includes(j.state) ? '取消任务' : '重试任务'}
                    </button>
                  )}
                </div>
              ))}
            </details>
          </Card>
        </>
      )}
      {data?.revision && (
        <div className={s.researchReview}>
          <WorkflowPanel
            projectId={projectId}
            type="script"
            integratedScript
            externalDirty={dirty || busy}
            externalRevision={data.revision}
            onRevisionChange={(id) => {
              setSelected('');
              setCompare('');
              setView(id);
            }}
          />
        </div>
      )}
    </>
  );
}
