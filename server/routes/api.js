'use strict';

const express = require('express');
const multer = require('multer');
const config = require('../config');
const db = require('../lib/db');
const { publish, publicPath } = require('../lib/publish');
const { absoluteShareUrl, shareBaseUrl, detectLanIPv4 } = require('../lib/shareUrl');
const { decodeUploadFilename } = require('../lib/filename');
const { requireAuth, canManagePage } = require('../middleware/auth');
const { deletePage, purgeExpired } = require('../lib/cleanup');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileBytes, files: 1 },
});

router.post('/publish', requireAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          ok: false,
          error: `文件过大（上限 ${Math.round(config.maxFileBytes / 1024 / 1024)}MB）`,
        });
      }
      return res.status(400).json({ ok: false, error: err.message });
    }
    if (err) {
      return res.status(400).json({ ok: false, error: err.message || '上传失败' });
    }

    try {
      // When auth is on, force namespace = logged-in user
      let username = req.body.username || '';
      let owner = username;
      if (config.authEnabled && req.user) {
        username = req.user.username;
        owner = req.user.username;
      }

      const record = publish({
        username,
        owner,
        file: req.file,
        ttlDays: req.body.ttlDays,
      });
      const path = publicPath(record);
      return res.json({
        ok: true,
        page: record,
        path,
        url: absoluteShareUrl(req, path),
        shareBase: shareBaseUrl(req),
      });
    } catch (e) {
      const status = e.status || 500;
      return res.status(status).json({
        ok: false,
        error: e.message || '发布失败',
      });
    }
  });
});

router.get('/pages', requireAuth, (req, res) => {
  try {
    let pages;
    if (config.authEnabled && req.user) {
      if (req.user.role === 'admin' && req.query.all === '1') {
        pages = db.listRecent(100);
      } else if (req.query.username && req.user.role === 'admin') {
        if (!db.isValidUsername(req.query.username)) {
          return res.status(400).json({ ok: false, error: '用户名无效' });
        }
        pages = db.listByUsername(req.query.username);
      } else {
        pages = db.listByUsername(req.user.username);
      }
    } else {
      // auth off: open list
      const username = req.query.username;
      if (username) {
        if (!db.isValidUsername(username)) {
          return res.status(400).json({ ok: false, error: '用户名无效' });
        }
        pages = db.listByUsername(username);
      } else {
        pages = db.listRecent(30);
      }
    }

    return res.json({
      ok: true,
      pages: pages.map(decoratePage(req)),
      shareBase: shareBaseUrl(req),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || '加载失败' });
  }
});

router.delete('/pages/:username/:id', requireAuth, (req, res) => {
  const { username, id } = req.params;
  if (!db.isValidUsername(username) || !id) {
    return res.status(400).json({ ok: false, error: '参数无效' });
  }

  const page = db.getPage(username, id, { includeExpired: true });
  if (!page) {
    return res.status(404).json({ ok: false, error: '页面不存在' });
  }

  if (!canManagePage(req.user, page)) {
    return res.status(403).json({ ok: false, error: '无权删除此页面' });
  }

  deletePage(username, id);
  return res.json({ ok: true, deleted: { username, id } });
});

router.post('/admin/cleanup', requireAuth, (req, res) => {
  if (config.authEnabled && (!req.user || req.user.role !== 'admin')) {
    return res.status(403).json({ ok: false, error: '需要管理员权限' });
  }
  const n = purgeExpired();
  return res.json({ ok: true, purged: n });
});

function decoratePage(req) {
  return (p) => ({
    ...p,
    originalName: decodeUploadFilename(p.originalName || ''),
    path: publicPath(p),
    url: absoluteShareUrl(req, publicPath(p)),
    expired: db.isExpired(p),
    canDelete: canManagePage(req.user, p),
  });
}

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'pagedrop',
    authEnabled: config.authEnabled,
    shareBase: config.publicUrl || null,
    lanIp: detectLanIPv4(),
    port: config.port,
  });
});

module.exports = router;
