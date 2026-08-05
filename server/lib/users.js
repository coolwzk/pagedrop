'use strict';

const fs = require('fs');
const path = require('path');
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
    mustChangePassword: !!u.mustChangePassword,
  };
}

function findUser(username) {
  const key = normalizeUsername(username);
  return readUsers().find((u) => u.username === key) || null;
}

function createUser({ username, password, role = 'user', mustChangePassword = false }) {
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
    mustChangePassword: !!mustChangePassword,
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

function changePassword(username, oldPassword, newPassword) {
  if (!newPassword || String(newPassword).length < 6) {
    throw Object.assign(new Error('新密码至少 6 位'), { status: 400 });
  }
  const key = normalizeUsername(username);
  const users = readUsers();
  const idx = users.findIndex((u) => u.username === key);
  if (idx === -1) {
    throw Object.assign(new Error('用户不存在'), { status: 404 });
  }
  const user = users[idx];
  if (!verifyPassword(user, oldPassword)) {
    throw Object.assign(new Error('当前密码不正确'), { status: 401 });
  }
  if (String(oldPassword) === String(newPassword)) {
    throw Object.assign(new Error('新密码不能与当前密码相同'), { status: 400 });
  }
  users[idx] = {
    ...user,
    passwordHash: bcrypt.hashSync(String(newPassword), SALT_ROUNDS),
    mustChangePassword: false,
    passwordChangedAt: new Date().toISOString(),
  };
  writeUsers(users);
  return publicUser(users[idx]);
}

/**
 * Hints for the login page (never expose custom secrets).
 * When still on documented default password, show username + default password.
 */
function getLoginHints() {
  if (!config.authEnabled) return null;

  const username = config.adminUsername;
  const users = readUsers();

  if (users.length === 0) {
    return {
      show: true,
      username,
      password: config.defaultAdminPassword,
      note: '首次启动将自动创建该管理员账号',
    };
  }

  // Show default password only while admin still must change it (still on bootstrap default)
  const pending = users.find((u) => u.role === 'admin' && u.mustChangePassword);
  if (pending) {
    return {
      show: true,
      username: pending.username,
      password: config.defaultAdminPassword,
      note: '首次默认密码，登录后请立即修改',
    };
  }

  return {
    show: false,
    username,
    password: null,
    note: '请使用已分配的账号密码登录',
  };
}

function writeCredentialsFile(username, password, isDefault) {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    const file = path.join(config.dataDir, 'INITIAL_CREDENTIALS.txt');
    const lines = [
      'PageDrop initial admin credentials',
      '================================',
      `Username: ${username}`,
      `Password: ${password}`,
      '',
      isDefault
        ? 'This is the built-in default (ADMIN_PASSWORD was not set).'
        : 'Password was taken from ADMIN_PASSWORD.',
      'Change the password after first login.',
      `Generated at: ${new Date().toISOString()}`,
      '',
    ];
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
  } catch (err) {
    console.warn('[PageDrop] could not write INITIAL_CREDENTIALS.txt:', err.message);
  }
}

/**
 * Bootstrap admin from env if user store is empty and AUTH is enabled.
 * Default: admin / admin123 (documented, shown on login page until changed).
 */
function bootstrapAdmin() {
  if (!config.authEnabled) return null;
  const users = readUsers();
  if (users.length > 0) return null;

  const fromEnv = !!(config.adminPassword && config.adminPassword.length > 0);
  let password = fromEnv ? config.adminPassword : config.defaultAdminPassword;
  const isDefault = !fromEnv;

  if (password.length < 6) {
    throw new Error('ADMIN_PASSWORD must be at least 6 characters');
  }

  const created = createUser({
    username: config.adminUsername,
    password,
    role: 'admin',
    mustChangePassword: isDefault || password === config.defaultAdminPassword,
  });

  writeCredentialsFile(config.adminUsername, password, isDefault);

  console.log('');
  console.log('========================================');
  console.log('  PageDrop admin account ready');
  console.log(`  Username : ${config.adminUsername}`);
  console.log(`  Password : ${password}`);
  if (isDefault) {
    console.log('  (built-in default — change after login)');
  }
  console.log(`  Also saved: data/INITIAL_CREDENTIALS.txt`);
  console.log('========================================');
  console.log('');

  return created;
}

/**
 * Reset admin password (CLI / recovery). Creates admin if missing.
 */
function resetAdminPassword(newPassword) {
  const password = newPassword || config.adminPassword || config.defaultAdminPassword;
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }
  const users = readUsers();
  const key = normalizeUsername(config.adminUsername);
  const idx = users.findIndex((u) => u.username === key);
  const mustChange = password === config.defaultAdminPassword;

  if (idx === -1) {
    createUser({
      username: key,
      password,
      role: 'admin',
      mustChangePassword: mustChange,
    });
  } else {
    users[idx] = {
      ...users[idx],
      passwordHash: bcrypt.hashSync(String(password), SALT_ROUNDS),
      role: 'admin',
      mustChangePassword: mustChange,
      passwordChangedAt: new Date().toISOString(),
    };
    writeUsers(users);
  }
  writeCredentialsFile(key, password, mustChange);
  return { username: key, password, mustChangePassword: mustChange };
}

module.exports = {
  readUsers,
  findUser,
  createUser,
  verifyPassword,
  changePassword,
  publicUser,
  bootstrapAdmin,
  getLoginHints,
  resetAdminPassword,
  usersPath: () => path.resolve(config.usersDbPath),
};
