// Fixed local parsers only. No remote URLs, browser page execution, OCR/ASR claims or clip output.
require('./register-typescript.cjs');
const fs = require('node:fs/promises'),
  path = require('node:path');
const { createRequire } = require('node:module'),
  { pathToFileURL } = require('node:url'),
  { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const command = promisify(execFile);
const appRequire = createRequire(path.resolve(__dirname, '../apps/web/package.json'));
const {
  researchBlobStore,
  validateResearchUpload,
} = require('../apps/web/src/server/research/storage.ts');
const {
  MockVisionProvider,
  MockSearchProvider,
  UnconfiguredProvider,
} = require('../apps/web/src/server/research/providers.ts');
module.exports.validateResearchUpload = validateResearchUpload;
async function tool(executable, args) {
  try {
    return (
      await command(executable, args, {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 2 * 1024 * 1024,
      })
    ).stdout;
  } catch (e) {
    throw Object.assign(
      new Error(e.code === 'ENOENT' ? 'MEDIA_TOOL_NOT_CONFIGURED' : 'MEDIA_PARSE_FAILED'),
      { code: e.code === 'ENOENT' ? 'MEDIA_TOOL_NOT_CONFIGURED' : 'MEDIA_PARSE_FAILED' },
    );
  }
}
async function analyze(input, dataDir, workDir, limits, signal) {
  if (input.mode === 'unconfigured') return new UnconfiguredProvider().extract(input.blob);
  if (input.kind === 'search')
    return input.mode === 'real'
      ? require('./codex-research.cjs').search(input, dataDir, signal)
      : new MockSearchProvider().search(input.query);
  const store = researchBlobStore(path.join(dataDir, 'research-blobs'), 100 * 1024 * 1024),
    blob = input.blob,
    bytes = await store.read(blob);
  const metadata = { mime: blob.mime, sizeBytes: blob.sizeBytes, sha256: blob.sha256 },
    entries = [],
    warnings = [];
  const add = (entry) => entries.push({ keywords: [], provenance: input.mode, ...entry });
  if (blob.mime === 'text/plain' || blob.mime === 'text/markdown') {
    const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    add({
      contentType: 'text',
      summary: '从用户上传原件实际提取的 UTF-8 文本；未核实内容事实。',
      extractedText: value.slice(0, 100000),
    });
    if (value.length > 100000) {
      metadata.truncated = true;
      warnings.push('文本超过 100000 字符，仅索引前部。');
    }
  } else if (blob.mime === 'application/pdf') {
    const pdfjs = await import(
      pathToFileURL(appRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
    );
    const task = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      standardFontDataUrl:
        path.join(path.dirname(appRequire.resolve('pdfjs-dist/package.json')), 'standard_fonts') +
        '/',
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      enableXfa: false,
      stopAtErrors: true,
      useWorkerFetch: false,
    });
    try {
      const pdf = await task.promise;
      metadata.pages = pdf.numPages;
      const count = Math.min(pdf.numPages, limits.maxPdfPages);
      metadata.truncated = count < pdf.numPages;
      let remaining = 300000;
      for (let page = 1; page <= count && remaining > 0; page++) {
        const item = await pdf.getPage(page),
          view = item.getViewport({ scale: 1 }),
          text = await item.getTextContent();
        const content = text.items
          .filter((x) => typeof x.str === 'string')
          .map((x) => x.str + (x.hasEOL ? '\n' : ' '))
          .join('')
          .trim();
        const excerpt = content.slice(0, Math.min(100000, remaining));
        remaining -= excerpt.length;
        add({
          contentType: 'pdf_page',
          page,
          summary: `PDF 第 ${page} 页，${Math.round(view.width)}×${Math.round(view.height)} pt；文本提取不等于事实核验。`,
          extractedText: excerpt,
        });
        if (excerpt.length < content.length) metadata.truncated = true;
        item.cleanup();
      }
      if (!entries.some((x) => x.extractedText))
        warnings.push('PDF 未含可提取文本；OCR 未配置，未编造文字。');
      if (metadata.truncated) warnings.push('PDF 超出页数/文本预算，索引已明确截断。');
    } catch (e) {
      throw Object.assign(
        new Error(e.name === 'PasswordException' ? 'PDF_PASSWORD_REQUIRED' : 'PDF_PARSE_FAILED'),
        { code: e.name === 'PasswordException' ? 'PDF_PASSWORD_REQUIRED' : 'PDF_PARSE_FAILED' },
      );
    } finally {
      await task.destroy();
    }
  } else {
    const original = path.join(dataDir, 'research-blobs', blob.id);
    const raw = JSON.parse(
      await tool(process.env.STUDIO_FFPROBE_PATH || 'ffprobe', [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        original,
      ]),
    );
    const video = raw.streams.find((x) => x.codec_type === 'video');
    if (
      !video ||
      !Number.isInteger(video.width) ||
      !Number.isInteger(video.height) ||
      video.width < 1 ||
      video.height < 1 ||
      video.width * video.height > 40000000
    )
      throw Error('MEDIA_DIMENSION_LIMIT');
    Object.assign(metadata, { width: video.width, height: video.height, codec: video.codec_name });
    if (blob.mime.startsWith('image/'))
      add({
        contentType: 'image',
        summary: `图片 ${video.width}×${video.height}；视觉/OCR 未配置，未识别图像语义。`,
      });
    else {
      const durationMs = Math.round(Number(raw.format.duration ?? video.duration) * 1000);
      if (
        !Number.isFinite(durationMs) ||
        durationMs < 1 ||
        durationMs > limits.maxVideoSeconds * 1000
      )
        throw Error('VIDEO_DURATION_LIMIT');
      metadata.durationMs = durationMs;
      const [num, den] = String(video.avg_frame_rate).split('/').map(Number);
      if (num > 0 && den > 0) metadata.fps = num / den;
      await fs.mkdir(workDir, { recursive: true });
      for (let n = 0; n < 3; n++) {
        const startMs = Math.floor((durationMs * n) / 3),
          endMs = Math.floor((durationMs * (n + 1)) / 3);
        if (endMs <= startMs) continue;
        const out = path.join(workDir, `frame-${n}.jpg`);
        await tool(process.env.STUDIO_FFMPEG_PATH || 'ffmpeg', [
          '-v',
          'error',
          '-nostdin',
          '-protocol_whitelist',
          'file,pipe',
          '-ss',
          String(startMs / 1000),
          '-i',
          original,
          '-frames:v',
          '1',
          '-vf',
          'scale=480:-2',
          '-q:v',
          '3',
          '-n',
          out,
        ]);
        const frame = await store.put(`frame-${n}.jpg`, await fs.readFile(out));
        add({
          contentType: 'video_segment',
          startMs,
          endMs,
          summary: `技术时间索引 ${startMs}–${endMs} ms；视觉/字幕识别未配置，未进行正式剪辑。`,
          frameRefs: [{ timeMs: startMs, blob: frame }],
        });
      }
    }
  }
  if (input.mode === 'mock') {
    const description = await new MockVisionProvider().describe(blob);
    for (const entry of entries) {
      entry.summary = description.summary;
      delete entry.extractedText;
    }
  } else if (blob.mime.startsWith('image/') || blob.mime === 'video/mp4')
    warnings.push('视觉/OCR/ASR 提供方未配置；仅真实技术元数据和时间索引，无语义结论。');
  const result = { kind: 'analyze', mode: input.mode, metadata, entries, warnings };
  return input.mode === 'real' && input.vision
    ? require('./codex-research.cjs').vision(result, input, dataDir, signal)
    : result;
}
module.exports.analyze = analyze;
