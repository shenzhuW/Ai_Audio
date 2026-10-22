import { projects } from '@/server/project';
import { ProjectList } from '@/components/project-list';
import { pages } from '@/domain/navigation';
export const dynamic = 'force-dynamic';
export default async function List({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const query = await searchParams;
  const next = pages.find((p) => p.key === query.next && p.key !== 'new')?.key || 'overview';
  return <ProjectList projects={await (await projects()).list('local-user')} next={next} />;
}
