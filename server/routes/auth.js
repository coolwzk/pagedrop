'use strict';

const express = require('express');
const config = require('../config');
const { findUser, createUser, verifyPassword, publicUser } = require('../lib/users');
const {
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
} = require('../lib/session');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { createRateLimiter } = require('../lib/rateLimit');

const router = express.Router();

const loginLimiter = createRateLimiter({
  windowMs: config.loginWindowMs,
  max: config.loginMaxAttempts,
});

const registerLimiter = createRateLimiter({
  windowMs: config.loginWindowMs,
  max: Math.max(3, Math.floor(config.loginMaxAttempts / 2)),
});

router.get('/config', (_req, res) => {
  res.json({
    ok: true,
    authEnabled: config.authEnabled,
    allowRegister: config.authAllowRegister,
    defaultTtlDays: config.defaultTtlDays,
    allowedTtlDays: config.allowedTtlDays,
  });
});

router.get('/me', (req, res) => {
  res.json({
    ok: true,
    authEnabled: config.authEnabled,
    user: req.user || null,
  });
});

router.post('/login', (req, res) => {
  if (!config.authEnabled) {
    return res.status(400).json({ ok: false, error: '当前未开启登录鉴权' });
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const limited = loginLimiter.check(`login:${ip}`);
  if (!limited.ok) {
    return res.status(429).json({
      ok: false,
      error: '登录尝试过多，请稍后再试',
      code: 'RATE_LIMITED',
    });
  }

  const username = req.body?.username || '';
  const password = req.body?.password || '';
  const user = findUser(username);
  if (!user || !verifyPassword(user, password)) {
    return res.status(401).json({ ok: false, error: '用户名或密码错误' });
  }

  const token = createSessionToken(user);
  setSessionCookie(res, token);
  return res.json({ ok: true, user: publicUser(user) });
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.post('/register', (req, res) => {
  if (!config.authEnabled) {
    return res.status(400).json({ ok: false, error: '当前未开启登录鉴权' });
  }
  if (!config.authAllowRegister) {
    return res.status(403).json({ ok: false, error: '未开放自助注册，请联系管理员' });
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const limited = registerLimiter.check(`register:${ip}`);
  if (!limited.ok) {
    return res.status(429).json({
      ok: false,
      error: '注册尝试过多，请稍后再试',
      code: 'RATE_LIMITED',
    });
  }

  try {
    const user = createUser({
      username: req.body?.username,
      password: req.body?.password,
      role: 'user',
    });
    const full = findUser(user.username);
    const token = createSessionToken(full);
    setSessionCookie(res, token);
    return res.status(201).json({ ok: true, user });
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.message || '注册失败' });
  }
});

router.post('/users', requireAuth, requireAdmin, (req, res) => {
  try {
    const user = createUser({
      username: req.body?.username,
      password: req.body?.password,
      role: req.body?.role === 'admin' ? 'admin' : 'user',
    });
    return res.status(201).json({ ok: true, user });
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.message || '创建失败' });
  }
});

module.exports = router;
