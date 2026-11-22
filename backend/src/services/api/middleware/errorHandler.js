import { ERROR_CODES } from '@app/shared';
import { ZodError } from 'zod';
import { AppError } from '../../../shared/errors.js';

export const notFoundHandler = (req, res) => res.status(404).json({ error: { code: ERROR_CODES.NOT_FOUND, message: 'Not found' } });

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join('.') || 'body', message: i.message }));
    return res.status(400).json({ error: { code: ERROR_CODES.VALIDATION, message: 'Invalid request', details } });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: ERROR_CODES.VALIDATION, message: 'Malformed JSON' } });
  if (err.code === '23505' || err.cause?.code === '23505') return res.status(409).json({ error: { code: ERROR_CODES.CONFLICT, message: 'Already exists' } });
  req.log.error(err);
  res.status(500).json({ error: { code: ERROR_CODES.INTERNAL, message: 'Something went wrong' } });
};
