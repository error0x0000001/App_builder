import busboy from 'busboy';
import { Router } from 'express';
import { z } from 'zod';
import { INLINE_SAFE, accessSchema, copyFileSchema, createFolderSchema, driveListQuerySchema, patchFileSchema, patchFolderSchema, starSchema, trashActionSchema, uuidField } from '@app/shared';
import { config } from '../../../shared/config.js';
import { AppError, TooManyRequestsError, ValidationError } from '../../../shared/errors.js';
import { TooLargeError } from '../../../shared/storage/localStorage.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireActiveWorkspaceRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';

const idParam = z.object({ id: uuidField });
const recordParams = z.object({ object: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/), id: uuidField });

/**
 * Reads ONE file from a multipart request without buffering it: `handler({ fields, stream, filename, mime })` runs as soon as the file part
 * starts (so form fields such as folderId must come first) and consumes the stream. Anything else in the body is drained.
 */
function receiveUpload(req, handler) {
  return new Promise((resolve, reject) => {
    if (!req.is('multipart/form-data')) return reject(new ValidationError({ file: 'Send the file as multipart/form-data' }));
    const parser = busboy({ headers: req.headers, limits: { files: 1, fields: 8, fieldSize: 1024 } });
    const fields = {};
    let work = null;
    parser.on('field', (name, value) => { fields[name] = value; });
    parser.on('file', (name, stream, info) => {
      if (work) return stream.resume();
      work = Promise.resolve().then(() => handler({ fields, stream, filename: info.filename, mime: info.mimeType })).catch((error) => { stream.resume(); throw error; });
      work.catch(() => {}); // surfaced below; avoids an unhandled-rejection warning while the body finishes
      return undefined;
    });
    parser.on('error', reject);
    parser.on('close', () => (work ? work.then(resolve, reject) : reject(new ValidationError({ file: 'Attach a file' }))));
    req.pipe(parser);
    return undefined;
  });
}

const tooLarge = (error) => (error instanceof TooLargeError ? new AppError(413, 'FILE_TOO_LARGE', `That file is larger than ${Math.floor(error.limit / 1024 / 1024)} MB`) : error);
const contentDisposition = (kind, name) => `${kind}; filename*=UTF-8''${encodeURIComponent(name).replace(/['()]/g, escape)}`;

/** Streams a stored file with Range support (media seeking, resumable downloads). Only safe types are ever shown inline. */
function sendFile(req, res, drive, file, { inline }) {
  const size = Number(file.size);
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  let start = 0; let end = size - 1; let status = 200;
  if (range && size > 0) {
    start = range[1] === '' ? Math.max(0, size - Number(range[2])) : Number(range[1]);
    end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
    if (start > end || start >= size) { res.set('Content-Range', `bytes */${size}`); return res.status(416).end(); }
    status = 206;
  }
  const safe = inline && INLINE_SAFE.has(file.mime);
  res.status(status).set({
    'Content-Type': safe ? file.mime : 'application/octet-stream',
    'Content-Disposition': contentDisposition(safe ? 'inline' : 'attachment', file.name),
    'Accept-Ranges': 'bytes',
    'Content-Length': String(size === 0 ? 0 : end - start + 1),
    ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    'X-Content-Type-Options': 'nosniff',
    ...(file.mime === 'application/pdf' ? {} : { 'Content-Security-Policy': "default-src 'none'; sandbox" }),
    'Cache-Control': 'private, no-store',
  });
  if (size === 0) return res.end();
  const stream = drive.open(file, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  return stream.pipe(res);
}

/** Documents (the Drive) and record attachments. Any member may call; the service decides per folder / per record. */
export function driveRoutes({ tokens, membershipLookup, cache, drive, users }) {
  const router = Router();

  // Signed links (previews for <img>, <video>, PDF viewers) carry their own proof, so they sit before the auth middleware.
  router.get('/raw/:token', async (req, res) => {
    const file = await drive.fileForLink(req.params.token);
    sendFile(req, res, drive, file, { inline: true });
  });

  router.use(authenticate(tokens), requireActiveWorkspaceRole(membershipLookup, 'viewer'));
  router.use(async (req, res, next) => {
    try {
      const ws = req.auth.workspaceId;
      if (!cache.allow(`drive:${ws}`, 60, config.SETUP_REQUESTS_PER_MINUTE)) throw new TooManyRequestsError(60);
      if (req.method !== 'GET' && (await cache.hit(`drive-w:${ws}:${req.auth.userId}`, 60)) > 600) throw new TooManyRequestsError(60);
      req.driveCtx = { workspaceId: ws, userId: req.auth.userId, actor: req.membership, email: await users.emailOf(req.auth.userId), ip: req.ctx.ip };
      next();
    } catch (error) { next(error); }
  });

  const ctx = (req) => req.driveCtx;
  const send = (res, data, status = 200) => res.status(status).set('Cache-Control', 'private, no-cache').json(data);

  router.get('/usage', async (req, res) => send(res, await drive.usage(ctx(req))));
  router.get('/list', validate({ query: driveListQuerySchema }), async (req, res) => send(res, await drive.list(ctx(req), req.valid.query)));
  router.get('/people', validate({ query: z.object({ q: z.string().trim().min(2).max(60) }) }), async (req, res) => send(res, await drive.people(ctx(req), req.valid.query.q)));

  router.post('/folders', validate({ body: createFolderSchema }), async (req, res) => send(res, await drive.createFolder(ctx(req), req.valid.body), 201));
  router.patch('/folders/:id', validate({ params: idParam, body: patchFolderSchema }), async (req, res) => send(res, await drive.renameOrMoveFolder(ctx(req), req.params.id, req.valid.body)));
  router.get('/folders/:id/access', validate({ params: idParam }), async (req, res) => send(res, await drive.getAccess(ctx(req), req.params.id)));
  router.put('/folders/:id/access', validate({ params: idParam, body: accessSchema }), async (req, res) => send(res, await drive.setAccess(ctx(req), req.params.id, req.valid.body)));

  router.post('/files', async (req, res, next) => {
    try {
      const declared = Number(req.headers['content-length']) || undefined;
      const result = await receiveUpload(req, async ({ fields, stream, filename, mime }) => {
        const folderId = uuidField.safeParse(fields.folderId);
        if (!folderId.success) { stream.resume(); throw new ValidationError({ folderId: 'Choose a folder first' }); }
        return drive.upload(ctx(req), { folderId: folderId.data, filename, mime, stream, declaredSize: declared });
      }).catch((error) => { throw tooLarge(error); });
      send(res, result, 201);
    } catch (error) { next(error); }
  });

  router.get('/files/:id', validate({ params: idParam }), async (req, res) => send(res, await drive.fileInfo(ctx(req), req.params.id)));
  router.patch('/files/:id', validate({ params: idParam, body: patchFileSchema }), async (req, res) => send(res, await drive.renameOrMoveFile(ctx(req), req.params.id, req.valid.body)));
  router.post('/files/:id/copy', validate({ params: idParam, body: copyFileSchema }), async (req, res) => send(res, await drive.copyFile(ctx(req), req.params.id, req.valid.body), 201));
  router.get('/files/:id/link', validate({ params: idParam }), async (req, res) => send(res, await drive.signedLink(ctx(req), req.params.id)));
  router.get('/files/:id/download', validate({ params: idParam, query: z.object({ inline: z.enum(['1']).optional() }) }), async (req, res) => {
    const file = await drive.fileForDownload(ctx(req), req.params.id);
    sendFile(req, res, drive, file, { inline: req.valid.query.inline === '1' });
  });

  router.post('/trash', validate({ body: trashActionSchema }), async (req, res) => send(res, await drive.trash(ctx(req), req.valid.body)));
  router.post('/restore', validate({ body: trashActionSchema }), async (req, res) => send(res, await drive.restore(ctx(req), req.valid.body)));
  router.post('/delete-forever', validate({ body: trashActionSchema }), async (req, res) => send(res, await drive.removeForever(ctx(req), req.valid.body)));
  router.put('/stars', validate({ body: starSchema }), async (req, res) => send(res, await drive.star(ctx(req), req.valid.body)));

  // Attachments of a record: everything lands in Records/<Object>/<record uuid>, visible in Documents to whoever may read the record.
  router.get('/records/:object/:id/files', validate({ params: recordParams }), async (req, res) => send(res, await drive.recordFiles(ctx(req), req.params.object, req.params.id)));
  router.post('/records/:object/:id/files', validate({ params: recordParams }), async (req, res, next) => {
    try {
      const declared = Number(req.headers['content-length']) || undefined;
      const result = await receiveUpload(req, ({ stream, filename, mime }) => drive.uploadToRecord(ctx(req), req.params.object, req.params.id, { filename, mime, stream, declaredSize: declared }))
        .catch((error) => { throw tooLarge(error); });
      send(res, result, 201);
    } catch (error) { next(error); }
  });

  return router;
}
