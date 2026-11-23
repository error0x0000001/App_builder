import busboy from 'busboy';
import { AppError, ValidationError } from '../../../shared/errors.js';
import { TooLargeError } from '../../../shared/storage/localStorage.js';

/**
 * Reads ONE file from a multipart request without buffering it: `handler({ fields, stream, filename, mime })` runs as soon as the file part
 * starts (so form fields such as folderId must come first) and consumes the stream. Anything else in the body is drained.
 */
export function receiveUpload(req, handler, { maxFileBytes } = {}) {
  return new Promise((resolve, reject) => {
    if (!req.is('multipart/form-data')) return reject(new ValidationError({ file: 'Send the file as multipart/form-data' }));
    const parser = busboy({ headers: req.headers, limits: { files: 1, fields: 8, fieldSize: 1024, ...(maxFileBytes ? { fileSize: maxFileBytes } : {}) } });
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

export const tooLarge = (error) => (error instanceof TooLargeError ? new AppError(413, 'FILE_TOO_LARGE', `That file is larger than ${Math.floor(error.limit / 1024 / 1024)} MB`) : error);
