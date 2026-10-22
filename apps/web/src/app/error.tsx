'use client';
import { Card, s } from '@/components/ui';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <Card title="暂时无法载入">
      <p role="alert">请检查本地数据目录是否可写、数据库是否可用，再重试。</p>
      <button onClick={reset} className={s.primary}>
        重新载入
      </button>
    </Card>
  );
}
