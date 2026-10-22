import { getProjectPage } from '@/server/project/page-data';
import { Overview } from '@/components/overview';
export const dynamic = 'force-dynamic';
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  return <Overview project={await getProjectPage((await params).projectId)} />;
}
