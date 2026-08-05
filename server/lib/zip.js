'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const config = require('../config');

/**
 * Safely extract a ZIP into targetDir.
 * Guards against Zip Slip, symlinks, oversized archives, and disallowed types.
 */
function extractZipSafe(zipBuffer, targetDir) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  if (entries.length === 0) {
    throw Object.assign(new Error('ZIP 为空'), { status: 400 });
  }
  if (entries.length > config.maxZipEntries) {
    throw Object.assign(
      new Error(`ZIP 内文件过多（最多 ${config.maxZipEntries} 个）`),
      { status: 400 }
    );
  }

  let totalUncompressed = 0;
  const resolvedRoot = path.resolve(targetDir);
  const written = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    // Normalize zip path: use forward slashes, strip leading ./
    let name = entry.entryName.replace(/\\/g, '/');
    if (name.startsWith('./')) name = name.slice(2);
    if (!name || name.endsWith('/')) continue;

    // Reject absolute paths, drive letters, and parent traversal
    if (
      name.startsWith('/') ||
      /^[a-zA-Z]:/.test(name) ||
      name.split('/').some((p) => p === '..')
    ) {
      throw Object.assign(new Error(`不安全的 ZIP 路径: ${entry.entryName}`), {
        status: 400,
      });
    }

    const dest = path.resolve(resolvedRoot, name);
    if (!dest.startsWith(resolvedRoot + path.sep) && dest !== resolvedRoot) {
      throw Object.assign(new Error(`Zip Slip 已拦截: ${entry.entryName}`), {
        status: 400,
      });
    }

    const ext = path.extname(name).toLowerCase();
    if (!config.allowedExtensions.has(ext)) {
      throw Object.assign(
        new Error(`不允许的文件类型: ${ext || '(无扩展名)'}（${name}）`),
        { status: 400 }
      );
    }

    const data = entry.getData();
    totalUncompressed += data.length;
    if (totalUncompressed > config.maxZipUncompressedBytes) {
      throw Object.assign(new Error('解压后体积超过限制'), { status: 400 });
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    written.push(name);
  }

  if (written.length === 0) {
    throw Object.assign(new Error('ZIP 中没有可发布的文件'), { status: 400 });
  }

  // Find index.html — root first, then nested single folder
  let entryFile = null;
  if (fs.existsSync(path.join(resolvedRoot, 'index.html'))) {
    entryFile = 'index.html';
  } else {
    // common case: zip contains one top-level folder
    const top = fs.readdirSync(resolvedRoot, { withFileTypes: true });
    const dirs = top.filter((d) => d.isDirectory());
    const files = top.filter((d) => d.isFile());
    if (files.length === 0 && dirs.length === 1) {
      const nested = path.join(resolvedRoot, dirs[0].name, 'index.html');
      if (fs.existsSync(nested)) {
        // hoist nested folder contents to root
        hoistDirectory(path.join(resolvedRoot, dirs[0].name), resolvedRoot);
        entryFile = 'index.html';
      }
    }
  }

  if (!entryFile) {
    throw Object.assign(
      new Error('ZIP 根目录必须包含 index.html（或单层子目录内包含）'),
      { status: 400 }
    );
  }

  return { entryFile, fileCount: written.length };
}

function hoistDirectory(srcDir, destDir) {
  const items = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const item of items) {
    const from = path.join(srcDir, item.name);
    const to = path.join(destDir, item.name);
    if (item.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      hoistDirectory(from, to);
    } else {
      fs.renameSync(from, to);
    }
  }
  fs.rmSync(srcDir, { recursive: true, force: true });
}

module.exports = { extractZipSafe };
