'use strict';

const express = require('express');
const multer = require('multer');
const config = require('../config');
const db = require('../lib/db');
const { publish, publicPath } = require('../lib/publish');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileBytes, files: 1 },
});

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

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
        url: `${baseUrl(req)}${path}`,
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
    const pages = db.listByUsername(username).map((p) => ({
      ...p,
      path: publicPath(p),
      url: `${baseUrl(req)}${publicPath(p)}`,
    }));
    return res.json({ ok: true, pages });
  }
  const pages = db.listRecent(30).map((p) => ({
    ...p,
    path: publicPath(p),
    url: `${baseUrl(req)}${publicPath(p)}`,
  }));
  return res.json({ ok: true, pages });
});

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'pagedrop' });
});

module.exports = router;
