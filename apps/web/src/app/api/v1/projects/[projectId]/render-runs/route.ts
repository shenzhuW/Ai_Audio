import { NextRequest } from 'next/server';
import { z } from 'zod';
import { api, limitedBody } from '@/server/http';
import { workflow } from '@/server/workflow';
import { RenderRequestSchema } from '@/domain/motion';
import type { WorkflowJob } from '@/domain/workflow';
import { assets } from '@/server/assets/service';
import { AppError } from '@/server/errors';
import { trustedInput } from '@/server/render/preset';
export async function POST(r: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  return api(
    r,
    async () => {
      const id = z.uuid().parse((await ctx.params).projectId);
      const body = RenderRequestSchema.parse(JSON.parse((await limitedBody(r, 10000)).toString()));
      const service = await workflow();
      await service.read(id, 'local-user');
      const input = trustedInput(body.titleFontSize);
      if (body.preparedBindingId) {
        const w = await (await assets()).read(id, 'local-user'),
          b = w.bindings.find((b) => b.id === body.preparedBindingId),
          p = w.prepared.find((p) => p.recipeHash === b?.recipeHash);
        if (!b || !p || w.stale || w.status.find((s) => s.shotId === b.shotId)?.bindingId !== b.id)
          throw new AppError('ASSET_RENDER_INVALID', '素材绑定不可用。', 422);
        input.assets.backgroundSha256 = p.blob.sha256;
        input.preparedBackground = {
          directorRevisionId: b.directorRevisionId,
          shotId: b.shotId,
          bindingId: b.id,
          recipeHash: b.recipeHash,
          sha256: p.blob.sha256,
          provenance: {
            sourceAssetId: b.sourceAssetId,
            provider: w.sources.find((a) => a.id === b.sourceAssetId)!.provider,
            sourceUrl: w.sources.find((a) => a.id === b.sourceAssetId)!.sourceUrl,
            author: w.sources.find((a) => a.id === b.sourceAssetId)!.author,
            license: w.sources.find((a) => a.id === b.sourceAssetId)!.license,
            restrictions: w.sources.find((a) => a.id === b.sourceAssetId)!.restrictions,
            sourceInMs: b.recipe.sourceInMs,
            sourceOutMs: b.recipe.sourceOutMs,
            purpose: b.purpose,
          },
        };
      }
      const job = (await service.execute(
        id,
        'local-user',
        { action: 'render', input },
        r.headers.get('idempotency-key') || '',
      )) as WorkflowJob;
      return { jobId: job.id, status: job.state };
    },
    202,
  );
}
