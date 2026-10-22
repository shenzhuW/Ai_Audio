import { notFound } from 'next/navigation';
import { pages } from '@/domain/navigation';
import { StageWorkspace } from '@/components/stage-workspace';
export default async function DemoPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage } = await params;
  const found = pages.slice(1).find((p) => p.key === stage);
  if (!found) notFound();
  return <StageWorkspace stage={found.key} demo />;
}
