'use strict';

const path = require('path');
const express = require('express');
const config = require('./config');
const db = require('./lib/db');
const api = require('./routes/api');

db.ensureDirs();

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// API
app.use('/api', api);

// Published static sites
app.use(
  '/p',
  express.static(config.sitesDir, {
    index: ['index.html'],
    fallthrough: true,
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  })
);

// SPA-style 404 for missing published pages
app.get('/p/:user/:id/*', (req, res) => {
  res.status(404).type('html').send(notFoundPage(req.params.user, req.params.id));
});
app.get('/p/:user/:id', (req, res) => {
  res.redirect(301, `/p/${req.params.user}/${req.params.id}/`);
});

// Frontend
app.use(express.static(path.join(config.rootDir, 'public')));

app.use((err, _req, res, _next) => {
  console.error('[PageDrop]', err);
  res.status(500).json({ ok: false, error: '服务器内部错误' });
});

function notFoundPage(user, id) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>页面不存在</title>
<style>body{font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f3eb;color:#1a3a2a}
a{color:#1a5c3a}</style></head><body><div style="text-align:center">
<h1>页面不存在</h1><p>未找到 /p/${user}/${id}/</p><p><a href="/">返回 PageDrop</a></p>
</div></body></html>`;
}

if (require.main === module) {
  app.listen(config.port, config.host, () => {
    console.log(`PageDrop running at http://localhost:${config.port}`);
  });
}

module.exports = app;
