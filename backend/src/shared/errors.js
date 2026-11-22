import { ERROR_CODES } from '@app/shared';

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(details, message = 'Invalid request') { super(400, ERROR_CODES.VALIDATION, message, details); }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = ERROR_CODES.UNAUTHENTICATED) { super(401, code, message); }
}
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource', code = ERROR_CODES.FORBIDDEN, details) { super(403, code, message, details); }
}
export class NotFoundError extends AppError {
  constructor(message = 'Not found') { super(404, ERROR_CODES.NOT_FOUND, message); }
}
export class ConflictError extends AppError {
  constructor(message = 'Already exists') { super(409, ERROR_CODES.CONFLICT, message); }
}
export class TooManyRequestsError extends AppError {
  constructor(retryAfterSeconds) {
    super(429, ERROR_CODES.RATE_LIMITED, 'Too many attempts. Please try again later.', { retryAfterSeconds });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const invalidCredentials = () =>
  new UnauthorizedError('Please check your email and password. If you still can’t log in, contact your administrator.', ERROR_CODES.INVALID_CREDENTIALS);
export const invalidCode = () => new UnauthorizedError('That code is invalid or has expired.', ERROR_CODES.INVALID_CODE);
export const invalidToken = () => new UnauthorizedError('This link is invalid or has expired.', ERROR_CODES.INVALID_TOKEN);
