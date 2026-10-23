import type { AiRun } from '@/domain/ai';
export function AiRunDetails({ runs }: { runs?: AiRun[] }) {
  if (!runs?.length) return null;
  return (
    <details>
      <summary>查看 {runs.length} 次真实模型运行与使用量</summary>
      {runs.map((run, i) => (
        <div key={run.runId || run.startedAt + i}>
          <p>
            {run.provider} · {run.model} · {run.searchMode === 'live' ? '实时搜索' : '未启用搜索'} ·{' '}
            {(run.durationMs / 1000).toFixed(1)} 秒
          </p>
          <p>
            运行 ID：{run.runId || '未建立会话'} · 尝试 {run.jobAttempt || 1}
          </p>
          <p>
            输入 {run.usage?.input_tokens ?? '未知'} / 缓存{' '}
            {run.usage?.cached_input_tokens ?? '未知'} / 输出 {run.usage?.output_tokens ?? '未知'}{' '}
            tokens
          </p>
          <p>{run.quotaNote} 不代表永久免费。</p>
          {run.failureReason && <p role="status">失败原因：{run.failureReason}</p>}
        </div>
      ))}
    </details>
  );
}
