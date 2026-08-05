'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  port: Number(process.env.PORT) || 3780,
  host: process.env.HOST || '0.0.0.0',
  // Prefer for share links, e.g. http://192.168.1.10:3780 or https://pagedrop.company.local
  publicUrl: (process.env.PUBLIC_URL || process.env.BASE_URL || '').replace(/\/$/, ''),
  rootDir: ROOT,
  sitesDir: path.join(ROOT, 'storage', 'sites'),
  dataDir: path.join(ROOT, 'data'),
  pagesDbPath: path.join(ROOT, 'data', 'pages.json'),
  maxFileBytes: Number(process.env.MAX_FILE_BYTES) || 20 * 1024 * 1024,
  maxZipEntries: 500,
  maxZipUncompressedBytes: 80 * 1024 * 1024,
  allowedExtensions: new Set([
    '.html', '.htm', '.css', '.js', '.mjs', '.json',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.txt', '.md', '.map', '.xml', '.pdf', '.mp4', '.webm', '.mp3',
  ]),
};
