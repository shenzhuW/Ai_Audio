import { notFound } from 'next/navigation';
import { getProjectPage } from '@/server/project/page-data';
import { pages } from '@/domain/navigation';
import { StageWorkspace } from '@/components/stage-workspace';
export const dynamic = 'force-dynamic';
export default async function StagePage({
  params,
}: {
  params: Promise<{ projectId: string; stage: string }>;
}) {
  const { projectId, stage } = await params;
  const page = pages.slice(2).find((p) => p.key === stage);
  if (!page) notFound();
  return <StageWorkspace stage={page.key} project={await getProjectPage(projectId)} />;
}
