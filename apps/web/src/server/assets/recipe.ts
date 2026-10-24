import { createHash } from 'node:crypto';
import { AssetRecipeSchema, type AssetMetadata, type AssetRecipe } from '../../domain/assets';
import { AppError } from '../errors';
export const recipeHash = (recipe: AssetRecipe) =>
  createHash('sha256')
    .update(JSON.stringify(AssetRecipeSchema.parse(recipe)))
    .digest('hex');
export function validateRange(
  meta: Pick<AssetMetadata, 'kind' | 'durationMs'>,
  a: number,
  b: number,
  targetMs: number,
  playback: string,
) {
  if (
    !Number.isSafeInteger(a) ||
    !Number.isSafeInteger(b) ||
    a < 0 ||
    b < 0 ||
    (meta.kind === 'image' ? a !== 0 || b !== 0 : b <= a || b > (meta.durationMs ?? 0)) ||
    (meta.kind === 'video' && playback === 'once' && b - a + 34 < targetMs)
  )
    throw new AppError(
      'ASSET_RANGE_INVALID',
      '区间无效、越界或不足镜头时长；短片段请明确选择循环/定格。',
      422,
    );
}
