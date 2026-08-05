'use strict';

const path = require('path');
const express = require('express');
const config = require('./config');
const db = require('./lib/db');
const { bootstrapAdmin } = require('./lib/users');
const { startCleanupScheduler } = require('./lib/cleanup');
const { attachUser } = require('./middleware/auth');
const { isValidSiteId, escapeHtml } = require('./lib/safePath');
const api = require('./routes/api');
const authRoutes = require('./routes/auth');

db.ensureDirs();
try {
  bootstrapAdmin();
} catch (err) {
  console.error('[PageDrop] bootstrap failed:', err.message);
  process.exit(1);
}

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(attachUser);

// API
app.use('/api/auth', authRoutes);
app.use('/api', api);

// Gate expired / missing published sites
app.use('/p/:user/:id', (req, res, next) => {
  const user = req.params.user;
  const id = req.params.id;
  if (!db.isValidUsername(user) || !isValidSiteId(id)) {
    return res.status(404).type('html').send(notFoundPage(user, id, '不存在'));
  }
  const page = db.getPage(user, id, { includeExpired: true });
  if (!page) {
    return res.status(404).type('html').send(notFoundPage(user, id, '不存在'));
  }
  if (db.isExpired(page)) {
    return res.status(410).type('html').send(notFoundPage(user, id, '已过期'));
  }
  next();
});

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

app.get('/p/:user/:id/*', (req, res) => {
  res.status(404).type('html').send(notFoundPage(req.params.user, req.params.id, '文件不存在'));
});
app.get('/p/:user/:id', (req, res) => {
  const user = req.params.user;
  const id = req.params.id;
  if (!db.isValidUsername(user) || !isValidSiteId(id)) {
    return res.status(404).type('html').send(notFoundPage(user, id, '不存在'));
  }
  res.redirect(301, `/p/${encodeURIComponent(db.normalizeUsername(user))}/${encodeURIComponent(id)}/`);
});

// Frontend
app.use(express.static(path.join(config.rootDir, 'public')));

app.use((err, _req, res, _next) => {
  console.error('[PageDrop]', err);
  res.status(500).json({ ok: false, error: '服务器内部错误' });
});

function notFoundPage(user, id, reason) {
  const msg = escapeHtml(reason || '不存在');
  const safeUser = escapeHtml(user);
  const safeId = escapeHtml(id);
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>页面${msg}</title>
<style>body{font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f3eb;color:#1a3a2a}
a{color:#1a5c3a}</style></head><body><div style="text-align:center">
<h1>页面${msg}</h1><p>/p/${safeUser}/${safeId}/</p><p><a href="/">返回 PageDrop</a></p>
</div></body></html>`;
}

if (require.main === module) {
  startCleanupScheduler();
  app.listen(config.port, config.host, () => {
    console.log(`PageDrop running at http://localhost:${config.port}`);
    console.log(`Auth: ${config.authEnabled ? 'enabled' : 'disabled'}`);
  });
}

module.exports = app;
