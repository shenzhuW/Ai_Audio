import Link from 'next/link';
import { Card, Empty, s } from '@/components/ui';
export default function NotFound() {
  return (
    <Card>
      <Empty title="找不到这个项目或页面">请从项目库重新选择，或创建一个新项目。</Empty>
      <Link prefetch={false} href="/projects" className={s.primary}>
        返回项目库
      </Link>
    </Card>
  );
}
