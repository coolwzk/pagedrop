'use strict';

const fs = require('fs');
const path = require('path');
const { customAlphabet } = require('nanoid');
const config = require('../config');
const db = require('./db');
const { extractZipSafe } = require('./zip');
const { renderMarkdown, extractTitle } = require('./markdown');
const { decodeUploadFilename } = require('./filename');

const nanoid = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 10);

const { resolveSiteDir } = require('./safePath');

function siteDir(username, id) {
  const dir = resolveSiteDir(username, id);
  if (!dir) {
    // fallback only for newly generated safe ids during publish
    return path.join(config.sitesDir, db.normalizeUsername(username), id);
  }
  return dir;
}

function detectKind(originalname, mimetype) {
  const ext = path.extname(originalname || '').toLowerCase();
  if (ext === '.zip' || mimetype === 'application/zip' || mimetype === 'application/x-zip-compressed') {
    return 'zip';
  }
  if (ext === '.md' || ext === '.markdown' || mimetype === 'text/markdown') {
    return 'md';
  }
  if (ext === '.html' || ext === '.htm' || mimetype === 'text/html') {
    return 'html';
  }
  return null;
}

function guessTitleFromHtml(html) {
  const m = String(html).match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : null;
}

/**
 * Resolve TTL days from client input + server default.
 * 0 => never expire
 */
function resolveTtlDays(raw) {
  let days;
  if (raw === undefined || raw === null || raw === '') {
    days = config.defaultTtlDays;
  } else {
    days = Number(raw);
  }
  if (!Number.isFinite(days) || days < 0) {
    throw Object.assign(new Error('有效期无效'), { status: 400 });
  }
  days = Math.floor(days);
  if (!config.allowedTtlDays.includes(days)) {
    throw Object.assign(
      new Error(`有效期仅支持：${config.allowedTtlDays.join(', ')} 天（0=永久）`),
      { status: 400 }
    );
  }
  return days;
}

function computeExpiresAt(ttlDays, from = new Date()) {
  if (!ttlDays || ttlDays <= 0) return null;
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + ttlDays);
  return d.toISOString();
}

function publish({ username, file, owner, ttlDays }) {
  if (!db.isValidUsername(username)) {
    throw Object.assign(
      new Error('用户名无效：1–32 位字母、数字、下划线或连字符'),
      { status: 400 }
    );
  }

  const user = db.normalizeUsername(username);
  const pageOwner = db.normalizeUsername(owner || user);
  if (!file || !file.buffer) {
    throw Object.assign(new Error('请上传文件'), { status: 400 });
  }

  const originalName = decodeUploadFilename(file.originalname);
  const resolvedTtl = resolveTtlDays(ttlDays);

  const kind = detectKind(originalName, file.mimetype);
  if (!kind) {
    throw Object.assign(
      new Error('仅支持 HTML、Markdown（.md）或 ZIP 文件'),
      { status: 400 }
    );
  }

  const id = nanoid();
  const dir = siteDir(user, id);
  fs.mkdirSync(dir, { recursive: true });

  let title = originalName || 'untitled';
  let entryFile = 'index.html';
  let fileCount = 1;
  const createdAt = new Date();

  try {
    if (kind === 'html') {
      const html = file.buffer.toString('utf8');
      title =
        guessTitleFromHtml(html) ||
        path.basename(originalName, path.extname(originalName)) ||
        'HTML Page';
      fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    } else if (kind === 'md') {
      const md = file.buffer.toString('utf8');
      title = extractTitle(md);
      const html = renderMarkdown(md, { title });
      fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
      fs.writeFileSync(path.join(dir, 'source.md'), md, 'utf8');
    } else if (kind === 'zip') {
      const result = extractZipSafe(file.buffer, dir);
      entryFile = result.entryFile;
      fileCount = result.fileCount;
      const htmlPath = path.join(dir, entryFile);
      if (fs.existsSync(htmlPath)) {
        title =
          guessTitleFromHtml(fs.readFileSync(htmlPath, 'utf8')) ||
          path.basename(originalName, '.zip') ||
          'Static Site';
      } else {
        title = path.basename(originalName, '.zip') || 'Static Site';
      }
    }

    const record = {
      id,
      username: user,
      owner: pageOwner,
      title: String(title).slice(0, 200),
      kind,
      entryFile,
      fileCount,
      originalName,
      size: file.size || file.buffer.length,
      ttlDays: resolvedTtl,
      expiresAt: computeExpiresAt(resolvedTtl, createdAt),
      createdAt: createdAt.toISOString(),
    };

    db.addPage(record);
    return record;
  } catch (err) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw err;
  }
}

function publicPath(record) {
  return `/p/${record.username}/${record.id}/`;
}

module.exports = {
  publish,
  publicPath,
  siteDir,
  detectKind,
  resolveTtlDays,
  computeExpiresAt,
};
