import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

const sign = (userId, version) => createHmac('sha256', config.JWT_SECRET).update(`avatar:${userId}:${version}`).digest('base64url').slice(0, 24);

/** The URL of a person's profile photo (0 = none). Signed, so it works in <img> without a bearer token, and immutable per version so browsers cache it. */
export const avatarUrl = (userId, version) => (version > 0 ? `/api/v1/avatars/${userId}/${version}.jpg?s=${sign(userId, version)}` : null);

export const avatarSignatureValid = (userId, version, signature) => {
  const expected = Buffer.from(sign(userId, version)); const given = Buffer.from(String(signature ?? ''));
  return expected.length === given.length && timingSafeEqual(expected, given);
};
