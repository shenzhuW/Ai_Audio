import { z } from 'zod';
import { AssetProvenanceSchema } from './assets';
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const frame = z.number().int().min(0).max(300);
const text = z.string().min(1).max(200);
const layer = { id: z.string().min(1), zIndex: z.number().int().nonnegative() };
export const SceneSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    sceneId: z.uuid(),
    shotId: z.uuid(),
    narrativeGoal: text,
    fps: z.literal(30),
    durationFrames: z.literal(300),
    resolution: z.object({ width: z.literal(1080), height: z.literal(1920) }).strict(),
    layers: z
      .array(
        z.union([
          z
            .object({
              ...layer,
              kind: z.literal('video'),
              assetBindingId: z.literal('poc-background'),
              fit: z.literal('cover'),
            })
            .strict(),
          z
            .object({
              ...layer,
              kind: z.literal('component'),
              component: z.literal('KineticText'),
              props: z.object({ text, fontSize: z.number().int().min(52).max(92) }).strict(),
            })
            .strict(),
          z
            .object({
              ...layer,
              kind: z.literal('component'),
              component: z.literal('BarChart'),
              dataRef: z.literal('poc-values'),
            })
            .strict(),
          z
            .object({ ...layer, kind: z.literal('subtitle'), voiceTimelineRevisionId: z.uuid() })
            .strict(),
        ]),
      )
      .length(4),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (
      new Set(s.layers.map((l) => l.id)).size !== 4 ||
      s.layers.some((l, i) => i > 0 && l.zIndex <= s.layers[i - 1].zIndex)
    )
      ctx.addIssue({ code: 'custom', message: 'Layer IDs and zIndex order must be unique' });
    if (
      s.layers.filter((l) => l.kind === 'video').length !== 1 ||
      s.layers.filter((l) => l.kind === 'subtitle').length !== 1 ||
      !s.layers.some((l) => l.kind === 'component' && l.component === 'KineticText') ||
      !s.layers.some((l) => l.kind === 'component' && l.component === 'BarChart')
    )
      ctx.addIssue({ code: 'custom', message: 'Only the trusted four-layer preset is supported' });
  });
const TimelineSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.uuid(),
    mode: z.literal('none'),
    durationFrames: z.literal(300),
    subtitles: z
      .array(z.object({ id: z.uuid(), startFrame: frame, endFrame: frame, text }).strict())
      .min(1)
      .max(10),
  })
  .strict()
  .superRefine((t, ctx) => {
    if (
      t.subtitles.some(
        (c, i) =>
          c.startFrame >= c.endFrame || (i > 0 && c.startFrame < t.subtitles[i - 1].endFrame),
      )
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid subtitle frame boundaries' });
  });
export const RenderInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    presetId: z.literal('poc-v1'),
    scene: SceneSpecSchema,
    timeline: TimelineSchema,
    assets: z.object({ backgroundSha256: hash, fontSha256: hash }).strict(),
    preparedBackground: z
      .object({
        directorRevisionId: z.uuid(),
        shotId: z.uuid(),
        bindingId: z.uuid(),
        recipeHash: hash,
        sha256: hash,
        provenance: AssetProvenanceSchema,
      })
      .strict()
      .optional(),
    dataset: z
      .object({
        id: z.literal('poc-values'),
        provenance: z.literal('synthetic'),
        values: z.array(z.number().min(0).max(100)).length(3),
      })
      .strict(),
    toolchain: z
      .object({
        remotion: z.literal('4.0.538'),
        catalogVersion: z.literal('poc-v1'),
        componentHash: hash,
      })
      .strict(),
  })
  .strict()
  .superRefine((i, ctx) => {
    if (
      i.scene.layers.some(
        (l) => l.kind === 'subtitle' && l.voiceTimelineRevisionId !== i.timeline.id,
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Subtitle layer must reference the frozen timeline',
      });
  });
export type RenderInput = z.infer<typeof RenderInputSchema>;
export const RenderRequestSchema = z
  .object({
    presetId: z.literal('poc-v1'),
    titleFontSize: z.number().int().min(52).max(92).default(72),
    preparedBindingId: z.uuid().optional(),
  })
  .strict();
export function makePocInput(
  titleFontSize: number,
  assets: RenderInput['assets'],
  componentHash: string,
): RenderInput {
  const timelineId = '82e73dc6-67ac-451d-933a-b9d95ed709a8';
  return RenderInputSchema.parse({
    schemaVersion: 1,
    presetId: 'poc-v1',
    scene: {
      schemaVersion: 1,
      sceneId: '17eefba2-b055-4cae-a613-7c61432cba86',
      shotId: '2c04d041-61b7-466a-bcfe-8fe7c385d7a2',
      narrativeGoal: '验证真实视频与帧驱动图层的技术闭环，无事实主张',
      fps: 30,
      durationFrames: 300,
      resolution: { width: 1080, height: 1920 },
      layers: [
        {
          id: 'background',
          kind: 'video',
          assetBindingId: 'poc-background',
          fit: 'cover',
          zIndex: 0,
        },
        {
          id: 'title',
          kind: 'component',
          component: 'KineticText',
          zIndex: 20,
          props: { text: '让想法，逐帧成形', fontSize: titleFontSize },
        },
        {
          id: 'chart',
          kind: 'component',
          component: 'BarChart',
          zIndex: 30,
          dataRef: 'poc-values',
        },
        { id: 'subtitles', kind: 'subtitle', zIndex: 50, voiceTimelineRevisionId: timelineId },
      ],
    },
    timeline: {
      schemaVersion: 1,
      id: timelineId,
      mode: 'none',
      durationFrames: 300,
      subtitles: [
        {
          id: '042406b1-5ae7-4c4a-a2a9-3279aedfab3b',
          startFrame: 0,
          endFrame: 90,
          text: '真实视频作为底图。',
        },
        {
          id: '4a642657-c7e5-4a7a-b845-0e7f32f6d82f',
          startFrame: 90,
          endFrame: 195,
          text: '文字和图表逐帧生长。',
        },
        {
          id: '7b81c82c-5797-436d-baa2-aef1b6fbb065',
          startFrame: 195,
          endFrame: 300,
          text: '同一场景，生成同一画面。',
        },
      ],
    },
    assets,
    dataset: { id: 'poc-values', provenance: 'synthetic', values: [32, 64, 90] },
    toolchain: { remotion: '4.0.538', catalogVersion: 'poc-v1', componentHash },
  });
}
const MetadataSchema = z.object({
  durationSeconds: z.literal(10),
  width: z.literal(1080),
  height: z.literal(1920),
  fps: z.literal(30),
  codec: z.literal('h264'),
  frames: z.literal(300),
});
export function verifyVideoMetadata(raw: unknown) {
  const p = z
    .object({
      streams: z.array(
        z.object({
          codec_type: z.string(),
          codec_name: z.string(),
          width: z.number().optional(),
          height: z.number().optional(),
          avg_frame_rate: z.string().optional(),
          nb_frames: z.string().optional(),
          duration: z.string().optional(),
        }),
      ),
      format: z.object({ duration: z.string() }),
    })
    .parse(raw);
  const v = p.streams.find((s) => s.codec_type === 'video');
  if (!v) throw new Error('No video stream');
  const [n, d] = (v.avg_frame_rate || '').split('/').map(Number);
  if (Number(p.format.duration) !== 10 || Number(v.duration) !== 10)
    throw new Error('Expected exactly 10 seconds');
  return MetadataSchema.parse({
    durationSeconds: Number(v.duration),
    width: v.width,
    height: v.height,
    fps: n / d,
    codec: v.codec_name,
    frames: Number(v.nb_frames),
  });
}
export const renderFiles = [
  'video.mp4',
  'frame-060.png',
  'frame-150.png',
  'frame-240.png',
  'ffprobe.json',
  'manifest.json',
] as const;
export const RenderResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.uuid(),
    manifestHash: hash,
    previewManifestHash: hash,
    metadata: MetadataSchema,
    artifacts: z
      .array(
        z
          .object({
            file: z.enum(renderFiles),
            sha256: hash,
            sizeBytes: z.number().int().positive(),
          })
          .strict(),
      )
      .length(6),
    determinism: z
      .array(z.object({ frame: z.number().int(), first: hash, second: hash }).strict())
      .length(3),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (
      r.manifestHash !== r.previewManifestHash ||
      new Set(r.artifacts.map((a) => a.file)).size !== 6 ||
      r.determinism.some((d, i) => d.frame !== [60, 150, 240][i] || d.first !== d.second)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Manifest or deterministic frame verification failed',
      });
  });
export type RenderResult = z.infer<typeof RenderResultSchema>;
