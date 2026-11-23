import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

const sign = (kind, id, version) => createHmac('sha256', config.JWT_SECRET).update(`${kind}:${id}:${version}`).digest('base64url').slice(0, 24);

/** URL of a stored photo (`kind`: 'avatars' | 'chat-icons'; 0 = none). Signed, so it works in <img> without a bearer token, and immutable per version so browsers cache it. */
export const photoUrl = (kind, id, version) => (version > 0 ? `/api/v1/${kind}/${id}/${version}.jpg?s=${sign(kind, id, version)}` : null);
export const photoSignatureValid = (kind, id, version, signature) => {
  const expected = Buffer.from(sign(kind, id, version)); const given = Buffer.from(String(signature ?? ''));
  return expected.length === given.length && timingSafeEqual(expected, given);
};

export const avatarUrl = (userId, version) => photoUrl('avatars', userId, version);
export const chatIconUrl = (conversationId, version) => photoUrl('chat-icons', conversationId, version);
