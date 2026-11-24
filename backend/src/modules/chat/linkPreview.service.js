import { createHash } from 'node:crypto';
import dns from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import net from 'node:net';
import { sql } from 'drizzle-orm';
import { ValidationError } from '../../shared/errors.js';

const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 4000;
const MAX_REDIRECTS = 3;
const FRESH_MS = 7 * 24 * 3600_000;
const FAILED_RETRY_MS = 3600_000;

/** True for any address a user-supplied URL must never make the server connect to (loopback, private, link-local, CGNAT, multicast, metadata…). */
export function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224;
  }
  if (net.isIPv6(address)) {
    const v = address.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe[89ab]|ff)/.test(v);
  }
  return true;
}

/** A DNS lookup that refuses private answers — it runs when the socket connects, so a DNS-rebinding host cannot slip in a different address later. */
const safeLookup = (hostname, options, callback) => dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
  if (error) return callback(error);
  const list = addresses.filter((a) => !isPrivateAddress(a.address));
  if (!list.length || list.length !== addresses.length) return callback(new Error('Blocked address'));
  return options.all ? callback(null, list) : callback(null, list[0].address, list[0].family);
});

const decode = (text) => text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();
const meta = (html, ...names) => {
  for (const name of names) {
    const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i').exec(html)?.[0];
    const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (content) return decode(content).slice(0, 300);
  }
  return null;
};

/** Titles and descriptions for links in chat. Public web pages only: private networks are blocked, redirects re-checked, size and time capped, results cached. */
export class LinkPreviewService {
  constructor({ db, cache, fetchHtml }) { Object.assign(this, { db, cache }); this.fetchHtml = fetchHtml ?? this.#fetchHtml.bind(this); }

  #fetchHtml(urlString, redirects = 0) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlString);
      if (!['http:', 'https:'].includes(url.protocol) || (url.port && !['80', '443'].includes(url.port)) || url.username || url.password) return reject(new Error('Blocked URL'));
      if (net.isIP(url.hostname) && isPrivateAddress(url.hostname)) return reject(new Error('Blocked address'));
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, { method: 'GET', lookup: safeLookup, timeout: TIMEOUT_MS, headers: { 'User-Agent': 'QuelliLinkPreview/1.0', Accept: 'text/html' } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) return reject(new Error('Too many redirects'));
          return resolve(this.#fetchHtml(new URL(res.headers.location, url).toString(), redirects + 1));
        }
        if (res.statusCode !== 200 || !/text\/html|application\/xhtml/i.test(res.headers['content-type'] ?? '')) { res.resume(); return reject(new Error('Not a web page')); }
        const chunks = []; let size = 0;
        res.on('data', (chunk) => { size += chunk.length; chunks.push(chunk); if (size > MAX_BYTES) { res.destroy(); resolve(Buffer.concat(chunks).toString('utf8')); } });
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
        return undefined;
      });
      request.on('timeout', () => request.destroy(new Error('Timed out')));
      request.on('error', reject);
      request.end();
    });
  }

  async preview(ctx, rawUrl) {
    let url;
    try { url = new URL(rawUrl); } catch { throw new ValidationError({ url: 'Not a valid link' }); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new ValidationError({ url: 'Only web links have previews' });
    if (!this.cache.allow(`link-preview:${ctx.userId}`, 60, 60)) return { preview: null };
    url.hash = '';
    const hash = createHash('sha256').update(url.toString()).digest('hex');
    const { rows: [hit] } = await this.db.execute(sql`select title, description, site, status, fetched_at from chat_link_previews where url_hash = ${hash}`);
    if (hit && Date.now() - new Date(hit.fetched_at) < (hit.status === 'ok' ? FRESH_MS : FAILED_RETRY_MS)) return { preview: hit.status === 'ok' ? { url: url.toString(), title: hit.title, description: hit.description, site: hit.site } : null };
    let result = null;
    try {
      const html = await this.fetchHtml(url.toString());
      const title = meta(html, 'og:title', 'twitter:title') ?? (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ? decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)[1]).slice(0, 300) : null);
      if (title) result = { title, description: meta(html, 'og:description', 'description', 'twitter:description'), site: meta(html, 'og:site_name') ?? url.hostname.replace(/^www\./, '') };
    } catch { /* unreachable, blocked or not a page: remembered as failed for a while */ }
    await this.db.execute(sql`insert into chat_link_previews (url_hash, url, title, description, site, status, fetched_at) values (${hash}, ${url.toString()}, ${result?.title ?? null}, ${result?.description ?? null}, ${result?.site ?? null}, ${result ? 'ok' : 'failed'}, now())
      on conflict (url_hash) do update set title = excluded.title, description = excluded.description, site = excluded.site, status = excluded.status, fetched_at = now()`);
    return { preview: result ? { url: url.toString(), ...result } : null };
  }
}
