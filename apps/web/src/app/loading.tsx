import { Card, s } from '@/components/ui';
export default function Loading() {
  return (
    <Card>
      <div role="status" className={s.empty}>
        正在载入项目…
      </div>
    </Card>
  );
}
