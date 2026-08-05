'use strict';

const config = require('../config');
const { readSession } = require('../lib/session');
const { findUser, publicUser } = require('../lib/users');

function attachUser(req, _res, next) {
  req.user = null;
  if (!config.authEnabled) {
    return next();
  }
  const session = readSession(req);
  if (!session) return next();
  const user = findUser(session.username);
  if (!user) return next();
  // role from store wins over cookie
  req.user = publicUser({ ...user, role: user.role });
  next();
}

function requireAuth(req, res, next) {
  if (!config.authEnabled) return next();
  if (!req.user) {
    return res.status(401).json({ ok: false, error: '请先登录', code: 'UNAUTHORIZED' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!config.authEnabled) return next();
  if (!req.user) {
    return res.status(401).json({ ok: false, error: '请先登录', code: 'UNAUTHORIZED' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: '需要管理员权限', code: 'FORBIDDEN' });
  }
  next();
}

function canManagePage(user, page) {
  if (!config.authEnabled) return true;
  if (!user || !page) return false;
  if (user.role === 'admin') return true;
  const owner = page.owner || page.username;
  return owner === user.username;
}

module.exports = {
  attachUser,
  requireAuth,
  requireAdmin,
  canManagePage,
};
