import crypto from 'node:crypto';

const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmacRaw = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * AWS Signature Version 4 for a single request (S3 and compatible stores: MinIO, R2, Spaces, Wasabi, B2).
 * Returns the headers to send. The payload is not hashed (`UNSIGNED-PAYLOAD`), which S3 accepts and which lets large bodies stream.
 */
export function signAwsV4({ method, url, region, service = 's3', accessKeyId, secretAccessKey, headers = {}, payloadHash = 'UNSIGNED-PAYLOAD', now = new Date() }) {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const hdrs = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host: u.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(hdrs).sort();
  const canonicalQuery = [...u.searchParams.entries()].map(([k, v]) => [enc(k), enc(v)]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&');
  const canonicalPath = u.pathname.split('/').map((seg) => enc(decodeURIComponent(seg))).join('/') || '/';
  const canonical = [method.toUpperCase(), canonicalPath, canonicalQuery, ...names.map((n) => `${n}:${hdrs[n]}`), '', names.join(';'), payloadHash].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
  const kDate = hmacRaw(`AWS4${secretAccessKey}`, date);
  const key = hmacRaw(hmacRaw(hmacRaw(kDate, region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', key).update(toSign).digest('hex');
  return { ...hdrs, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

/** Azure Storage "Shared Key" authorization for a request with no body (Get Container Properties and similar). */
export function signAzureSharedKey({ method, url, accountName, accountKey, headers = {}, now = new Date() }) {
  const u = new URL(url);
  const hdrs = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)])), 'x-ms-date': now.toUTCString(), 'x-ms-version': '2021-08-06' };
  const canonicalHeaders = Object.keys(hdrs).filter((k) => k.startsWith('x-ms-')).sort().map((k) => `${k}:${hdrs[k].trim()}\n`).join('');
  const params = {};
  for (const [k, v] of u.searchParams.entries()) (params[k.toLowerCase()] ??= []).push(v);
  const canonicalResource = `/${accountName}${u.pathname}${Object.keys(params).sort().map((k) => `\n${k}:${params[k].sort().join(',')}`).join('')}`;
  const stringToSign = [method.toUpperCase(), '', '', '', '', '', '', '', '', '', '', '', canonicalHeaders + canonicalResource].join('\n');
  const signature = crypto.createHmac('sha256', Buffer.from(accountKey, 'base64')).update(stringToSign, 'utf8').digest('base64');
  return { ...hdrs, authorization: `SharedKey ${accountName}:${signature}` };
}
