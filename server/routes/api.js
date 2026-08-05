'use strict';

const express = require('express');
const multer = require('multer');
const config = require('../config');
const db = require('../lib/db');
const { publish, publicPath } = require('../lib/publish');
const { absoluteShareUrl, shareBaseUrl, detectLanIPv4 } = require('../lib/shareUrl');
const { decodeUploadFilename } = require('../lib/filename');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileBytes, files: 1 },
});

router.post('/publish', (req, res) => {
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
      const username = req.body.username || '';
      const record = publish({ username, file: req.file });
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

router.get('/pages', (req, res) => {
  const username = req.query.username;
  if (username) {
    if (!db.isValidUsername(username)) {
      return res.status(400).json({ ok: false, error: '用户名无效' });
    }
    const pages = db.listByUsername(username).map(decoratePage(req));
    return res.json({ ok: true, pages, shareBase: shareBaseUrl(req) });
  }
  const pages = db.listRecent(30).map(decoratePage(req));
  return res.json({ ok: true, pages, shareBase: shareBaseUrl(req) });
});

function decoratePage(req) {
  return (p) => ({
    ...p,
    originalName: decodeUploadFilename(p.originalName || ''),
    path: publicPath(p),
    url: absoluteShareUrl(req, publicPath(p)),
  });
}

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'pagedrop',
    shareBase: config.publicUrl || null,
    lanIp: detectLanIPv4(),
    port: config.port,
  });
});

module.exports = router;
