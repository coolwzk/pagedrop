'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { decodeUploadFilename } = require('./filename');

let migrated = false;

function ensureDirs() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.sitesDir, { recursive: true });
  if (!fs.existsSync(config.pagesDbPath)) {
    fs.writeFileSync(config.pagesDbPath, '[]', 'utf8');
  }
  migrateFilenamesOnce();
}

function migrateFilenamesOnce() {
  if (migrated) return;
  migrated = true;
  try {
    if (!fs.existsSync(config.pagesDbPath)) return;
    const raw = fs.readFileSync(config.pagesDbPath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return;
    let changed = false;
    for (const page of data) {
      if (!page.originalName) continue;
      const fixed = decodeUploadFilename(page.originalName);
      if (fixed !== page.originalName) {
        page.originalName = fixed;
        changed = true;
      }
    }
    if (changed) {
      writeAll(data);
    }
  } catch {
    /* ignore migration errors */
  }
}

function readAll() {
  ensureDirs();
  try {
    const raw = fs.readFileSync(config.pagesDbPath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAll(pages) {
  ensureDirs();
  const tmp = `${config.pagesDbPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(pages, null, 2), 'utf8');
  fs.renameSync(tmp, config.pagesDbPath);
}

function listByUsername(username) {
  const key = normalizeUsername(username);
  return readAll()
    .filter((p) => p.username === key)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function listRecent(limit = 50) {
  return readAll()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, limit);
}

function addPage(record) {
  const pages = readAll();
  pages.push(record);
  writeAll(pages);
  return record;
}

function getPage(username, id) {
  const key = normalizeUsername(username);
  return readAll().find((p) => p.username === key && p.id === id) || null;
}

function normalizeUsername(username) {
  return String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32);
}

function isValidUsername(username) {
  const n = normalizeUsername(username);
  return n.length >= 1 && n.length <= 32;
}

module.exports = {
  ensureDirs,
  listByUsername,
  listRecent,
  addPage,
  getPage,
  normalizeUsername,
  isValidUsername,
  pagesPath: () => path.resolve(config.pagesDbPath),
};
