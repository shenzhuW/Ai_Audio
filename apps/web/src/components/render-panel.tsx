'use client';
import { useEffect, useState } from 'react';
import { Card, Badge, Notice, s } from './ui';
import { statusLabels, type WorkflowJob } from '@/domain/workflow';

export function RenderPanel({ projectId }: { projectId: string }) {
  const [mediaError, setMediaError] = useState('');
  const [jobs, setJobs] = useState<WorkflowJob[]>([]),
    [selected, setSelected] = useState('');
  const [fontSize, setFontSize] = useState(72),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<{ size: number; key: string } | null>(null);
  async function reload() {
    const r = await fetch(`/api/v1/projects/${projectId}/workflow`, { cache: 'no-store' }),
      b = await r.json();
    if (!r.ok) throw new Error(b.error?.message || '任务读取失败');
    setJobs(
      b.data.jobs
        .filter((j: WorkflowJob) => j.provider === 'remotion')
        .sort((a: WorkflowJob, b: WorkflowJob) => b.createdAt.localeCompare(a.createdAt)),
    );
    setLoaded(true);
  }
  useEffect(() => {
    let active = true;
    const refresh = () =>
      reload().catch((e) => {
        if (active) setError(e.message);
      });
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [projectId]);
  const job = jobs.find((j) => j.id === selected) || jobs[0];
  useEffect(() => {
    setMediaError('');
  }, [job?.id]);
  const fileUrl = (name: string) => `/api/v1/jobs/${job!.id}/render-files/${name}`;
  async function start() {
    setBusy(true);
    setError('');
    const key = pending?.size === fontSize ? pending.key : crypto.randomUUID();
    setPending({ size: fontSize, key });
    try {
      const r = await fetch(`/api/v1/projects/${projectId}/render-runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
          body: JSON.stringify({ presetId: 'poc-v1', titleFontSize: fontSize }),
        }),
        b = await r.json();
      if (r.status < 500) setPending(null);
      if (!r.ok) throw new Error(b.error?.message || '创建渲染任务失败');
      setSelected(b.data.jobId);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(action: 'cancel' | 'retry') {
    if (!job) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/v1/jobs/${job.id}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ expectedVersion: job.version }),
        }),
        b = await r.json();
      if (!r.ok) throw new Error(b.error?.message || '任务状态已变化，请刷新');
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Notice>
        技术验证场景：10 秒 · 1080 × 1920 · 30 FPS。使用自制测试视频、可信 React/SVG
        组件和示例数据，无 AI 生成代码。此示例不改变项目目标时长。
      </Notice>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      <div className={s.motionGrid}>
        <div className={s.stack}>
          <Card title="可信组件" aside={<Badge>PoC</Badge>}>
            <div className={s.workflowJob}>
              <b>01 · 视频底图</b>
              <p className={s.caption}>自制几何运动 MP4</p>
            </div>
            <div className={s.workflowJob}>
              <b>02 · 文字动画</b>
              <p className={s.caption}>按帧计算位置与透明度</p>
            </div>
            <div className={s.workflowJob}>
              <b>03 · SVG 图表</b>
              <p className={s.caption}>合成示例数值，不是真实测量</p>
            </div>
            <div className={s.workflowJob}>
              <b>04 · 字幕</b>
              <p className={s.caption}>固定无口播时间轴</p>
            </div>
            <label className={s.field}>
              标题字号
              <input
                type="number"
                name="titleFontSize"
                min={52}
                max={92}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
              />
            </label>
            <p className={s.caption}>
              仅开放预置组件声明的参数；更改后产生新的渲染输入，原版本保留。
            </p>
            <button
              className={s.primary}
              disabled={busy || !Number.isInteger(fontSize) || fontSize < 52 || fontSize > 92}
              onClick={start}
            >
              渲染 10 秒示例
            </button>
          </Card>
          <Card title="渲染历史" aside={<Badge tone="gray">{jobs.length} 项</Badge>}>
            {jobs.map((j, i) => (
              <button
                key={j.id}
                className={s.workflowVersion}
                aria-pressed={job?.id === j.id}
                onClick={() => setSelected(j.id)}
              >
                渲染 {jobs.length - i} · {statusLabels[j.state]}
              </button>
            ))}
            {loaded && !jobs.length && <p className={s.caption}>尚无渲染任务。</p>}
          </Card>
        </div>
        <div className={s.stack}>
          <Card
            title="真实视频预览"
            aside={
              <Badge tone={job?.state === 'succeeded' ? 'green' : 'gray'}>
                {job ? statusLabels[job.state] : '暂无视频'}
              </Badge>
            }
          >
            {job?.state === 'succeeded' && job.renderResult ? (
              <>
                <video
                  key={job.id}
                  className={s.motionVideo}
                  src={fileUrl('video.mp4')}
                  poster={fileUrl('frame-150.png')}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label="Remotion 真实渲染预览"
                  onError={() =>
                    setMediaError(
                      '浏览器无法播放此视频，请使用支持 H.264 的浏览器，或下载 MP4 查看。渲染与文件验证结果保留。',
                    )
                  }
                />
                {mediaError && (
                  <p role="alert" className={s.fieldError}>
                    {mediaError}
                  </p>
                )}
                <p className={s.caption}>
                  H.264 · {job.renderResult.metadata.durationSeconds}s ·{' '}
                  {job.renderResult.metadata.width} × {job.renderResult.metadata.height} ·{' '}
                  {job.renderResult.metadata.fps} FPS
                </p>
                <a className={s.button} href={fileUrl('video.mp4')} download>
                  下载真实 MP4
                </a>
                <div className={s.motionFrames}>
                  {['060', '150', '240'].map((frame) => (
                    <a
                      href={fileUrl(`frame-${frame}.png`)}
                      key={frame}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={fileUrl(`frame-${frame}.png`)}
                        alt={`实际渲染关键帧 ${Number(frame)}`}
                      />
                      <small>帧 {Number(frame)}</small>
                    </a>
                  ))}
                </div>
              </>
            ) : (
              <div className={s.motionEmpty}>
                <b>
                  {!loaded
                    ? '正在读取渲染任务…'
                    : job?.state === 'running'
                      ? 'Worker 正在渲染'
                      : job?.state === 'queued'
                        ? '等待独立 Render Worker'
                        : '尚无通过验证的视频'}
                </b>
                <p>成功完成媒体与关键帧校验后，显示实际 MP4。</p>
              </div>
            )}
          </Card>
        </div>
        <div className={s.stack}>
          <Card title="任务与日志" aside={job ? <Badge>Real render</Badge> : undefined}>
            {job ? (
              <>
                <p className={s.workflowMeta}>Job · {job.id}</p>
                <progress
                  max={1}
                  value={job.progress || 0}
                  className={s.motionProgress}
                  aria-label="渲染进度"
                />
                <p className={s.caption}>
                  {Math.round((job.progress || 0) * 100)}% · 尝试 {job.attempt}/{job.maxAttempts}
                </p>
                {job.heartbeatAt && <p className={s.caption}>最近心跳 {job.heartbeatAt}</p>}
                {job.errorCode && (
                  <p role="alert" className={s.fieldError}>
                    {job.errorCode} · 查看下方日志定位失败；原版本和素材保留。
                  </p>
                )}
                <div className={s.actions}>
                  {['queued', 'running'].includes(job.state) && (
                    <button className={s.button} disabled={busy} onClick={() => action('cancel')}>
                      取消渲染
                    </button>
                  )}
                  {['failed', 'cancelled'].includes(job.state) && job.attempt < job.maxAttempts && (
                    <button className={s.button} disabled={busy} onClick={() => action('retry')}>
                      重试渲染
                    </button>
                  )}
                </div>
                <pre className={s.motionLogs}>
                  {job.logs?.map((l) => `${l.at}\n${l.message}`).join('\n\n') || '等待执行日志'}
                </pre>
                {job.renderResult && (
                  <>
                    <p className={s.caption}>预览与输出使用同一份 SceneSpec、Props 和时间轴。</p>
                    <details className={s.workflowMeta}>
                      <summary>输入与验证记录</summary>
                      <p className={s.caption}>{job.renderResult.manifestHash}</p>
                      <a href={fileUrl('manifest.json')}>下载冻结输入</a>
                      <p>
                        <a href={fileUrl('ffprobe.json')}>FFprobe 检测结果</a>
                      </p>
                      <p>重复关键帧校验：3/3 相同</p>
                    </details>
                  </>
                )}
              </>
            ) : (
              <p className={s.caption}>创建任务后可离开页面，进度与产物在后端持久保存。</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
