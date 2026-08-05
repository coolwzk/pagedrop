'use strict';

/**
 * Browsers often send UTF-8 filenames in multipart as raw bytes;
 * busboy/multer may decode them as Latin-1, producing mojibake like
 * "èµç®¡....html" instead of "智能....html".
 *
 * If the name already contains CJK, leave it alone.
 * Otherwise try Latin-1 → UTF-8 repair when that yields CJK.
 */
function decodeUploadFilename(name) {
  if (!name || typeof name !== 'string') return name || '';

  // Already proper Chinese / CJK — do not touch
  if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(name)) {
    return name;
  }

  // No non-ASCII — nothing to fix
  if (![...name].some((ch) => ch.charCodeAt(0) > 127)) {
    return name;
  }

  try {
    const repaired = Buffer.from(name, 'latin1').toString('utf8');
    if (repaired.includes('\uFFFD')) return name;
    // Prefer repair when it recovers CJK or other non-latin1 scripts
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(repaired)) {
      return repaired;
    }
  } catch {
    /* keep original */
  }

  return name;
}

module.exports = { decodeUploadFilename };
