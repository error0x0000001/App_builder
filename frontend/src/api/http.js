const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(status, { code, message, details } = {}) {
    super(message ?? 'Something went wrong');
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessToken = null;
let refreshInFlight = null;
const expiredListeners = new Set();

export const tokenStore = { clear: () => { accessToken = null; }, current: () => accessToken };
export const onSessionExpired = (listener) => { expiredListeners.add(listener); return () => expiredListeners.delete(listener); };

async function send(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    signal,
    credentials: 'include',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.error);
  if (data?.accessToken) accessToken = data.accessToken; // every flow that starts/changes a session lands here
  return data;
}

/** Single-flight refresh, also serialized across tabs so a rotated cookie is never replayed. */
export function refreshSession() {
  refreshInFlight ??= (async () => {
    const run = () => send('/auth/refresh', { method: 'POST' });
    try {
      return navigator.locks ? await navigator.locks.request('session-refresh', run) : await run();
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Authenticated request: on an expired access token, refresh once and retry. */
export async function request(path, options) {
  try {
    return await send(path, options);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || error.code !== 'UNAUTHENTICATED' || !accessToken) throw error;
    try {
      await refreshSession();
    } catch {
      accessToken = null;
      expiredListeners.forEach((listener) => listener());
      throw error;
    }
    return send(path, options);
  }
}

export const get = (path, options) => request(path, options); // options: { signal } to cancel a stale request
export const post = (path, body = {}) => request(path, { method: 'POST', body });
export const patch = (path, body = {}) => request(path, { method: 'PATCH', body });
export const del = (path) => request(path, { method: 'DELETE' });
export const qs = (params) => {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return query ? `?${query}` : '';
};

/** Authenticated file download (the bearer token can't ride on a plain <a href>): fetch → blob → save. */
/**
 * Authenticated multipart upload with progress (fetch cannot report upload progress, XHR can). `onProgress(0–1)`; `signal` aborts it.
 * Like `request`, an expired access token is refreshed once and the upload retried.
 */
export async function upload(path, formData, { onProgress, signal, method = 'POST' } = {}) {
  const attempt = () => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${BASE}${path}`);
    xhr.withCredentials = true;
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
    xhr.onload = () => {
      const data = (() => { try { return JSON.parse(xhr.responseText); } catch { return null; } })();
      if (xhr.status >= 200 && xhr.status < 300) resolve(data); else reject(new ApiError(xhr.status, data?.error));
    };
    xhr.onerror = () => reject(new ApiError(0, { message: 'The upload was interrupted. Check your connection and try again.' }));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(formData);
  });
  try {
    return await attempt();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || error.code !== 'UNAUTHENTICATED' || !accessToken) throw error;
    await refreshSession();
    return attempt();
  }
}

export async function download(path, filename) {
  const response = await fetch(`${BASE}${path.replace(/^\/api\/v1/, '')}`, { credentials: 'include', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  if (!response.ok) throw new ApiError(response.status, (await response.json().catch(() => null))?.error);
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
