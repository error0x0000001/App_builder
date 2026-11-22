import { UnauthorizedError } from '../../../shared/errors.js';

/** Loads the full user row for handlers that need it (password / MFA operations). */
export const loadUser = (userRepo) => async (req, res, next) => {
  try {
    const user = await userRepo.findById(req.auth.userId);
    if (!user || user.status !== 'active') throw new UnauthorizedError();
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
