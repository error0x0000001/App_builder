import nodemailer from 'nodemailer';
import { signAwsV4, signAzureSharedKey } from '../../shared/security/signing.js';
import { resolveTarget, safeRequest } from '../../shared/net/safeRequest.js';

const ok = (message = 'Connected') => ({ ok: true, message });
const fail = (message) => ({ ok: false, message });
const SECURITY = { starttls: { secure: false, requireTLS: true }, ssl: { secure: true }, none: { secure: false, ignoreTLS: true } };

/** SMTP settings for the two email providers (Amazon SES is SMTP with its regional endpoint). */
export function smtpSettings(provider, config, secrets) {
  if (provider === 'ses') return { host: `email-smtp.${config.region}.amazonaws.com`, port: 587, security: 'starttls', username: config.username, password: secrets.password };
  return { host: config.host, port: Number(config.port), security: config.security ?? 'starttls', username: config.username, password: secrets.password };
}

/**
 * Builds a nodemailer transport that connects to the address we validated (not a second DNS answer) and still verifies the certificate
 * against the host name the admin typed.
 */
export async function createSmtpTransport(settings, { allowPrivate = false } = {}) {
  const target = await resolveTarget(settings.host, { allowPrivate });
  return nodemailer.createTransport({
    host: target.address, port: settings.port, ...SECURITY[settings.security],
    tls: { servername: settings.host },
    auth: settings.username ? { user: settings.username, pass: settings.password } : undefined,
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
  });
}

const describeStatus = (status, where) => (status === 401 || status === 403 ? `${where} rejected these credentials (HTTP ${status}).` : status === 404 ? `${where} did not find that resource (HTTP 404). Check the name.` : `${where} answered with HTTP ${status}.`);

async function testSmtp(provider, config, secrets, opts) {
  const settings = smtpSettings(provider, config, secrets);
  const transport = await createSmtpTransport(settings, opts);
  try { await transport.verify(); return ok(`Signed in to ${settings.host}`); } catch (e) { return fail(`${settings.host}: ${e.response ?? e.message}`); } finally { transport.close(); }
}

function s3Request(provider, config, secrets) {
  const region = config.region;
  let base;
  if (provider === 's3') base = `https://${config.bucket}.s3.${region}.amazonaws.com/`;
  else {
    const endpoint = new URL(config.endpoint);
    base = config.path_style === 'virtual' ? `${endpoint.protocol}//${config.bucket}.${endpoint.host}/` : `${endpoint.protocol}//${endpoint.host}/${config.bucket}`;
  }
  const headers = signAwsV4({ method: 'HEAD', url: base, region, accessKeyId: config.access_key_id, secretAccessKey: secrets.secret_access_key });
  return { url: base, headers };
}
async function testS3(provider, config, secrets, opts) {
  const { url, headers } = s3Request(provider, config, secrets);
  const res = await safeRequest(url, { method: 'HEAD', headers, ...opts });
  if (res.status === 200) return ok(`Bucket “${config.bucket}” is reachable`);
  if (res.status === 301 || res.status === 307) return fail('That bucket is in a different region. Check the Region field.');
  return fail(describeStatus(res.status, 'The store'));
}

async function testAzure(config, secrets, opts) {
  const url = `https://${config.account_name}.blob.${config.endpoint_suffix || 'core.windows.net'}/${config.container}?restype=container`;
  const headers = signAzureSharedKey({ method: 'GET', url, accountName: config.account_name, accountKey: secrets.account_key });
  const res = await safeRequest(url, { headers, ...opts });
  return res.status === 200 ? ok(`Container “${config.container}” is reachable`) : fail(describeStatus(res.status, 'Azure'));
}

async function testCloudinary(config, secrets, opts) {
  const auth = Buffer.from(`${config.api_key}:${secrets.api_secret}`).toString('base64');
  const res = await safeRequest(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloud_name)}/ping`, { headers: { authorization: `Basic ${auth}` }, ...opts });
  return res.status === 200 ? ok(`Cloud “${config.cloud_name}” answered`) : fail(describeStatus(res.status, 'Cloudinary'));
}

async function testGoogleMaps(config, secrets, opts) {
  const res = await safeRequest(`https://maps.googleapis.com/maps/api/geocode/json?address=Mountain+View&key=${encodeURIComponent(secrets.api_key)}`, opts);
  let body; try { body = JSON.parse(res.body); } catch { return fail(describeStatus(res.status, 'Google')); }
  if (body.status === 'OK' || body.status === 'ZERO_RESULTS') return ok('The key works for geocoding');
  return fail(`Google said ${body.status}${body.error_message ? `: ${body.error_message}` : ''}`);
}

async function testOsm(config, secrets, opts) {
  const style = await safeRequest(config.style_url, { headers: { accept: 'application/json', 'user-agent': `Cloudbase (${config.contact_email})` }, maxBytes: 512 * 1024, ...opts });
  if (style.status !== 200) return fail(describeStatus(style.status, 'The style server'));
  let json; try { json = JSON.parse(style.body); } catch { return fail('That address did not return a map style (style.json).'); }
  if (!Array.isArray(json.layers) || json.version !== 8) return fail('That is not a MapLibre style (expected version 8 with layers).');
  if (config.geocoder_url) {
    const geo = await safeRequest(`${config.geocoder_url.replace(/\/$/, '')}/status.php?format=json`, { headers: { 'user-agent': `Cloudbase (${config.contact_email})` }, ...opts });
    if (geo.status !== 200) return fail(`The map style loads, but the geocoder answered HTTP ${geo.status}.`);
  }
  return ok('Map style loads' + (config.geocoder_url ? ' and the geocoder answers' : ''));
}

async function testMapTiler(config, secrets, opts) {
  const res = await safeRequest(`https://api.maptiler.com/maps/${encodeURIComponent(config.style || 'streets-v2')}/style.json?key=${encodeURIComponent(secrets.api_key)}`, { maxBytes: 512 * 1024, ...opts });
  return res.status === 200 ? ok('The key works') : fail(describeStatus(res.status, 'MapTiler'));
}

async function testSlack(config, secrets, opts) {
  const url = new URL(secrets.webhook_url);
  if (url.hostname !== 'hooks.slack.com') return fail('That is not a Slack webhook (it should start with https://hooks.slack.com/).');
  const res = await safeRequest(secrets.webhook_url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: { text: 'Cloudbase connection test — you can ignore this message.' }, ...opts });
  return res.status === 200 ? ok('A test message was posted') : fail(`Slack answered HTTP ${res.status}: ${res.body.slice(0, 80)}`);
}

const TESTERS = {
  smtp: (c, s, o) => testSmtp('smtp', c, s, o), ses: (c, s, o) => testSmtp('ses', c, s, o),
  s3: (c, s, o) => testS3('s3', c, s, o), minio: (c, s, o) => testS3('minio', c, s, o),
  azure_blob: testAzure, cloudinary: testCloudinary, google_maps: testGoogleMaps, openstreetmap: testOsm, maptiler: testMapTiler, slack: testSlack,
};

/** Checks a provider's credentials for real (a signed request or a sign-in). Never throws: every failure becomes a readable message. */
export async function testProvider(provider, config, secrets, { allowPrivate = false } = {}) {
  const run = TESTERS[provider];
  if (!run) return fail('This provider cannot be tested yet.');
  try { return await run(config, secrets, { allowPrivate }); } catch (e) { return fail(String(e.code === 'ENOTFOUND' ? `Could not find that host (${e.hostname ?? 'DNS lookup failed'}).` : e.message ?? e).slice(0, 300)); }
}
