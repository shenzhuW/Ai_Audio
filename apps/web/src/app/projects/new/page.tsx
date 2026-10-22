import { ProjectForm } from '@/components/project-form';
import { config } from '@/server/config';
export const dynamic = 'force-dynamic';
export default function NewProject() {
  const c = config();
  return <ProjectForm maxDurationMs={c.maxDurationMs} maxUploadBytes={c.maxUploadBytes} />;
}
