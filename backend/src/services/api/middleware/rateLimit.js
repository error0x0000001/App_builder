import { TooManyRequestsError } from '../../../shared/errors.js';

const keyByIp = (req) => req.ctx.ip;
const keyByEmail = (req) => req.valid?.body?.email ?? req.body?.email ?? '';

/** Fixed-window limiter backed by the shared DB so limits hold across every API instance. */
export const createRateLimiters = (rateLimitRepo) => {
  const make = (name, { limit, windowSeconds, key }) => async (req, res, next) => {
    try {
      const subject = key(req);
      if (!subject) return next();
      const { count, retryAfter } = await rateLimitRepo.hit(`${name}:${subject}`, windowSeconds);
      if (count > limit) {
        res.set('Retry-After', String(retryAfter));
        throw new TooManyRequestsError(retryAfter);
      }
      next();
    } catch (error) {
      next(error);
    }
  };

  const ip = (name, limit, windowSeconds) => make(`${name}:ip`, { limit, windowSeconds, key: keyByIp });
  const email = (name, limit, windowSeconds) => make(`${name}:email`, { limit, windowSeconds, key: keyByEmail });
  return { ip, email, make };
};
