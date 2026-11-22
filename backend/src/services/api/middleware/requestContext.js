/** Attaches the client fingerprint used for sessions, audit events and rate limits. */
export const requestContext = (req, res, next) => {
  req.ctx = { ip: req.ip, userAgent: (req.get('user-agent') ?? '').slice(0, 255) };
  next();
};
