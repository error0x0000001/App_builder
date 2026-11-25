import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { isPrivateAddress } from '../../modules/chat/linkPreview.service.js';

/**
 * Outbound calls to an address the organisation admin typed in (SMTP host, S3 endpoint, style URL). The server must not become a way to
 * reach internal services, so private / loopback / metadata addresses are refused — checked on the address actually connected to,
 * so DNS rebinding cannot swap it afterwards. `allowPrivate` (INTEGRATIONS_ALLOW_PRIVATE_HOSTS) is for on-premise installs and tests.
 */
export async function resolveTarget(host, { allowPrivate = false } = {}) {
  const answers = await dns.promises.lookup(host, { all: true });
  if (!answers.length) throw new Error(`Could not resolve ${host}`);
  if (!allowPrivate && answers.some((a) => isPrivateAddress(a.address))) throw new Error('That address is on a private network, which is not allowed');
  return answers[0];
}

const guardedLookup = (allowPrivate) => (hostname, options, callback) => dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
  if (error) return callback(error);
  const list = allowPrivate ? addresses : addresses.filter((a) => !isPrivateAddress(a.address));
  if (!list.length || list.length !== addresses.length) return callback(new Error('That address is on a private network, which is not allowed'));
  return options.all ? callback(null, list) : callback(null, list[0].address, list[0].family);
});

/** Small HTTP client: timeout, response size cap, guarded DNS. Returns { status, headers, body (utf-8, at most `maxBytes`) }. */
export function safeRequest(url, { method = 'GET', headers = {}, body, timeoutMs = 10_000, maxBytes = 64 * 1024, allowPrivate = false } = {}) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = new URL(url); } catch { reject(new Error('Not a valid URL')); return; }
    if (!/^https?:$/.test(target.protocol)) { reject(new Error('Only http and https addresses are supported')); return; }
    if (!allowPrivate && net.isIP(target.hostname.replace(/^\[|\]$/g, '')) && isPrivateAddress(target.hostname.replace(/^\[|\]$/g, ''))) { reject(new Error('That address is on a private network, which is not allowed')); return; } // IP literals skip DNS, so check them here
    const lib = target.protocol === 'https:' ? https : http;
    const payload = body === undefined ? undefined : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const req = lib.request(target, { method, headers: { ...(payload ? { 'content-length': payload.length } : {}), ...headers }, lookup: guardedLookup(allowPrivate), timeout: timeoutMs }, (res) => {
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size <= maxBytes) chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('The server did not answer in time')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
