const { createHash } = require('node:crypto');
function publicEvidence(value) {
  if (Array.isArray(value)) return value.map(publicEvidence);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === 'extractedText' && typeof item === 'string') {
        out.extractedTextSha256 = createHash('sha256').update(item).digest('hex');
        out.extractedTextLength = item.length;
        out.extractedTextPreview = item.slice(0, 100);
      } else out[key] = publicEvidence(item);
    }
    return out;
  }
  return value;
}
module.exports = { publicEvidence };
