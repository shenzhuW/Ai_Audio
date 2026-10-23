import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { makePocInput } from '../../domain/motion';
export function repositoryRoot() {
  if (process.env.STUDIO_REPO_ROOT) return resolve(process.env.STUDIO_REPO_ROOT);
  let root = process.cwd();
  while (!existsSync(join(root, 'apps/render/package.json'))) {
    const parent = dirname(root);
    if (parent === root) throw new Error('Trusted render package not found');
    root = parent;
  }
  return root;
}
export function trustedInput(fontSize: number) {
  const root = repositoryRoot();
  const assetRoot = join(root, 'apps/render/public');
  const assets = JSON.parse(readFileSync(join(assetRoot, 'asset-manifest.json'), 'utf8'));
  const hash = createHash('sha256');
  for (const name of ['index.ts', 'root.tsx', 'poc.tsx'])
    hash.update(readFileSync(join(root, 'apps/render/src', name)));
  return makePocInput(
    fontSize,
    { backgroundSha256: assets.backgroundSha256, fontSha256: assets.fontSha256 },
    hash.digest('hex'),
  );
}
