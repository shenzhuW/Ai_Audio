import { getProjectPage } from '@/server/project/page-data';
import { Overview } from '@/components/overview';
import { workflow } from '@/server/workflow';
export const dynamic = 'force-dynamic';
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const project = await getProjectPage((await params).projectId);
  return (
    <Overview
      project={project}
      snapshot={await (await workflow()).read(project.id, 'local-user')}
    />
  );
}
