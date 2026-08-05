'use strict';

/**
 * Reset or create the admin account.
 *
 *   node scripts/reset-admin.js
 *   node scripts/reset-admin.js myNewPassword
 *   ADMIN_PASSWORD=secret node scripts/reset-admin.js
 */

const path = require('path');

// ensure we load project config from package root
process.chdir(path.join(__dirname, '..'));

const config = require('../server/config');
const { resetAdminPassword } = require('../server/lib/users');

const argPass = process.argv[2];
const password = argPass || config.adminPassword || config.defaultAdminPassword;

try {
  const result = resetAdminPassword(password);
  console.log('');
  console.log('Admin password reset OK');
  console.log(`  Username : ${result.username}`);
  console.log(`  Password : ${result.password}`);
  if (result.mustChangePassword) {
    console.log('  Note     : still marked as default — please change after login');
  }
  console.log(`  Saved    : ${path.join(config.dataDir, 'INITIAL_CREDENTIALS.txt')}`);
  console.log('');
} catch (err) {
  console.error('Failed:', err.message);
  process.exit(1);
}
