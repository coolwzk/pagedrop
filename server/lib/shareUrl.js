'use strict';

const os = require('os');
const config = require('../config');

function isLoopbackHost(host) {
  const h = String(host || '')
    .split(':')[0]
    .toLowerCase();
  return (
    !h ||
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '[::1]' ||
    h === '0.0.0.0'
  );
}

/**
 * Pick a LAN IPv4 that others on the same network can reach.
 * Prefer common private ranges; skip virtual adapters when possible.
 */
function detectLanIPv4() {
  const nets = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(nets)) {
    const lower = name.toLowerCase();
    // skip common virtual / tunnel adapters
    if (
      /virtual|vmware|vbox|hyper-v|docker|wsl|loopback|vethernet|tailscale|zerotier/i.test(
        lower
      )
    ) {
      continue;
    }
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' && net.family !== 4) continue;
      if (net.internal) continue;
      candidates.push(net.address);
    }
  }

  // Prefer RFC1918 private addresses
  const privateIp = candidates.find(
    (ip) =>
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
  if (privateIp) return privateIp;
  return candidates[0] || null;
}

/**
 * Base URL suitable for sharing (not localhost when possible).
 *
 * Priority:
 * 1. PUBLIC_URL / BASE_URL env
 * 2. Request Host if it's not loopback
 * 3. Detected LAN IP + port
 * 4. Fallback to request Host (may be localhost)
 */
function shareBaseUrl(req) {
  const configured = (config.publicUrl || '').replace(/\/$/, '');
  if (configured) return configured;

  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const rawHost = req.headers['x-forwarded-host'] || req.get('host') || '';
  const hostname = rawHost.split(':')[0];
  const portFromHost = rawHost.includes(':') ? rawHost.split(':').pop() : null;
  const port = portFromHost || String(config.port);

  if (!isLoopbackHost(hostname)) {
    return `${proto}://${rawHost}`;
  }

  const lan = detectLanIPv4();
  if (lan) {
    const needsPort = port && port !== '80' && port !== '443';
    return needsPort ? `http://${lan}:${port}` : `http://${lan}`;
  }

  return `${proto}://${rawHost || `localhost:${config.port}`}`;
}

function absoluteShareUrl(req, path) {
  const base = shareBaseUrl(req);
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

module.exports = {
  shareBaseUrl,
  absoluteShareUrl,
  detectLanIPv4,
  isLoopbackHost,
};
