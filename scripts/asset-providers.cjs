const { fetchAsset, checkedAssetUrl } = require('./asset-fetch.cjs'),
  { htmlText } = require('./public-fetch.cjs'),
  { randomUUID } = require('node:crypto');
const str = (x) => htmlText(String(x || '')).slice(0, 4000);
const base = (provider, x) => ({
  id: randomUUID(),
  provider,
  blob: null,
  localRef: null,
  metadata: null,
  index: null,
  status: 'discovered',
  createdAt: new Date().toISOString(),
  originSourceId: null,
  originProjectId: null,
  ...x,
});
function selectNasaVideoUrl(urls) {
  const safe = (Array.isArray(urls) ? urls : []).slice(0, 100).flatMap((raw) => {
    if (typeof raw !== 'string' || !/\.mp4(?:$|\?)/i.test(raw)) return [];
    try {
      const u = new URL(raw);
      if (u.hostname !== 'images-assets.nasa.gov') return [];
      if (u.protocol === 'http:') u.protocol = 'https:';
      return [checkedAssetUrl(u.href).href];
    } catch {
      return [];
    }
  });
  return (
    safe.find((u) => u.includes('~small.mp4')) ||
    safe.find((u) => u.includes('~mobile.mp4')) ||
    safe.find((u) => u.includes('~preview.mp4')) ||
    safe[0] ||
    null
  );
}
async function searchProvider(provider, query, signal, kind = 'image') {
  let url;
  if (provider === 'nasa')
    url =
      'https://images-api.nasa.gov/search?' +
      new URLSearchParams({ q: query, media_type: kind, page_size: '6' });
  else if (provider === 'commons')
    url =
      'https://commons.wikimedia.org/w/api.php?' +
      new URLSearchParams({
        action: 'query',
        format: 'json',
        formatversion: '2',
        generator: 'search',
        gsrsearch: query + (kind === 'video' ? ' filetype:video' : ' filetype:bitmap'),
        gsrnamespace: '6',
        gsrlimit: '6',
        prop: 'imageinfo',
        iiprop: 'url|size|extmetadata|mime',
        iiurlwidth: '1280',
      });
  else throw Error('PROVIDER_NOT_CONFIGURED');
  const r = await fetchAsset(url, { signal, json: true, maxBytes: 1048576 }),
    j = JSON.parse(r.bytes.toString('utf8'));
  let sources = [];
  if (provider === 'nasa' && kind === 'video') {
    for (const item of (j.collection?.items || []).slice(0, 6)) {
      const d = item.data?.[0];
      if (!d || d.media_type !== 'video') continue;
      const manifest = await fetchAsset(item.href, { signal, json: true, maxBytes: 1048576 });
      const download = selectNasaVideoUrl(JSON.parse(manifest.bytes.toString('utf8')));
      if (!download) continue;
      sources.push(
        base('nasa', {
          title: str(d.title).slice(0, 300) || d.nasa_id,
          sourceUrl: 'https://images.nasa.gov/details/' + encodeURIComponent(d.nasa_id),
          downloadUrl: download,
          author: str(d.secondary_creator || d.photographer || d.center),
          restrictions:
            'NASA 公开视频；保留署名、第三方、标识及已知限制，使用限制未知。不是商用授权结论。',
          license: 'unknown; consult NASA media usage guidelines',
          kind: 'video',
          searchTerms: str((d.keywords || []).join(' ')).slice(0, 1000),
        }),
      );
    }
  } else if (provider === 'nasa')
    sources = (j.collection?.items || []).flatMap((item) => {
      const d = item.data?.[0],
        link =
          item.links?.find((x) => x.render === 'image' && x.href.includes('~medium')) ||
          item.links?.find((x) => x.render === 'image');
      if (!d || !link || d.media_type !== 'image') return [];
      try {
        checkedAssetUrl(link.href);
      } catch {
        return [];
      }
      return [
        base('nasa', {
          title: str(d.title).slice(0, 300) || d.nasa_id,
          sourceUrl: 'https://images.nasa.gov/details/' + encodeURIComponent(d.nasa_id),
          downloadUrl: link.href,
          author: str(d.secondary_creator || d.photographer || d.center),
          restrictions: 'NASA 公开图片；逐项保留署名/第三方/标识与隐私限制。不是商用授权结论。',
          license: 'unknown; consult NASA media usage guidelines',
          kind: 'image',
          searchTerms: str((d.keywords || []).join(' ')).slice(0, 1000),
        }),
      ];
    });
  else
    sources = (j.query?.pages || []).flatMap((page) => {
      const info = page.imageinfo?.[0],
        e = info?.extmetadata || {};
      if (
        !info ||
        !(kind === 'video' ? ['video/webm', 'video/mp4'] : ['image/png', 'image/jpeg']).includes(
          info.mime,
        )
      )
        return [];
      const download = kind === 'video' ? info.url : info.thumburl || info.url;
      try {
        checkedAssetUrl(download);
      } catch {
        return [];
      }
      return [
        base('commons', {
          title: str(page.title).slice(0, 300),
          sourceUrl: info.descriptionurl || 'https://commons.wikimedia.org/?curid=' + page.pageid,
          downloadUrl: download,
          author: str(e.Artist?.value || e.Credit?.value),
          restrictions:
            str(
              [
                e.UsageTerms?.value,
                e.Restrictions?.value,
                e.AttributionRequired?.value
                  ? 'Attribution required: ' + e.AttributionRequired.value
                  : '',
              ]
                .filter(Boolean)
                .join('; '),
            ) || '已知限制未提供，需查看来源',
          license: str(e.LicenseShortName?.value || e.License?.value) || 'unknown',
          kind,
          searchTerms: str(e.ImageDescription?.value).slice(0, 1000),
        }),
      ];
    });
  return {
    sources,
    record: {
      provider,
      query,
      url: r.url,
      responseSha256: r.sha256,
      status: sources.length ? 'ok' : 'empty',
      count: sources.length,
      reason: '真实公开 API 元数据；未下载条目尚未验证像素',
      at: new Date().toISOString(),
    },
  };
}
module.exports = { searchProvider, selectNasaVideoUrl };
