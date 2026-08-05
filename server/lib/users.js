'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { normalizeUsername, isValidUsername } = require('./db');

const SALT_ROUNDS = 10;

function ensureUsersFile() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  if (!fs.existsSync(config.usersDbPath)) {
    fs.writeFileSync(config.usersDbPath, '[]', 'utf8');
  }
}

function readUsers() {
  ensureUsersFile();
  try {
    const data = JSON.parse(fs.readFileSync(config.usersDbPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeUsers(users) {
  ensureUsersFile();
  const tmp = `${config.usersDbPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), 'utf8');
  fs.renameSync(tmp, config.usersDbPath);
}

function publicUser(u) {
  if (!u) return null;
  return {
    username: u.username,
    role: u.role,
    createdAt: u.createdAt,
  };
}

function findUser(username) {
  const key = normalizeUsername(username);
  return readUsers().find((u) => u.username === key) || null;
}

function createUser({ username, password, role = 'user' }) {
  if (!isValidUsername(username)) {
    throw Object.assign(new Error('用户名无效：1–32 位字母、数字、下划线或连字符'), {
      status: 400,
    });
  }
  if (!password || String(password).length < 6) {
    throw Object.assign(new Error('密码至少 6 位'), { status: 400 });
  }
  if (!['user', 'admin'].includes(role)) {
    throw Object.assign(new Error('角色无效'), { status: 400 });
  }

  const key = normalizeUsername(username);
  const users = readUsers();
  if (users.some((u) => u.username === key)) {
    throw Object.assign(new Error('用户名已存在'), { status: 409 });
  }

  const record = {
    username: key,
    passwordHash: bcrypt.hashSync(String(password), SALT_ROUNDS),
    role,
    createdAt: new Date().toISOString(),
  };
  users.push(record);
  writeUsers(users);
  return publicUser(record);
}

function verifyPassword(user, password) {
  if (!user || !user.passwordHash) return false;
  return bcrypt.compareSync(String(password || ''), user.passwordHash);
}

/**
 * Bootstrap admin from env if user store is empty and AUTH is enabled.
 */
function bootstrapAdmin() {
  if (!config.authEnabled) return null;
  const users = readUsers();
  if (users.length > 0) return null;

  let password = config.adminPassword;
  if (!password) {
    password = crypto.randomBytes(9).toString('base64url');
    console.warn(
      `[PageDrop] No users found. Created admin "${config.adminUsername}" with generated password: ${password}`
    );
    console.warn('[PageDrop] Set ADMIN_PASSWORD (and SESSION_SECRET) for production.');
  } else if (password.length < 6) {
    throw new Error('ADMIN_PASSWORD must be at least 6 characters');
  } else {
    console.log(`[PageDrop] Bootstrapped admin user "${config.adminUsername}" from ADMIN_PASSWORD`);
  }

  return createUser({
    username: config.adminUsername,
    password,
    role: 'admin',
  });
}

module.exports = {
  readUsers,
  findUser,
  createUser,
  verifyPassword,
  publicUser,
  bootstrapAdmin,
  usersPath: () => path.resolve(config.usersDbPath),
};
