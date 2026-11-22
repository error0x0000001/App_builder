import { ValidationError } from '../../../shared/errors.js';

/** validate({ body, query, params }) — parsed values land on req.valid.* (Express 5 makes req.query read-only). */
export const validate = (schemas) => (req, res, next) => {
  req.valid = {};
  const issues = [];
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (result.success) req.valid[part] = result.data;
    else issues.push(...result.error.issues.map((i) => ({ field: i.path.join('.') || part, message: i.message })));
  }
  next(issues.length ? new ValidationError(issues) : undefined);
};
