import { avatarUrl } from '../../shared/avatar.js';

export const toPublicUser = (u) => ({
  id: u.id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  jobTitle: u.jobTitle,
  avatar: avatarUrl(u.id, u.avatarVersion ?? 0),
  phone: u.phone,
  country: u.country,
  emailVerified: Boolean(u.emailVerifiedAt),
  mfaEnabled: u.mfaEnabled,
  hasPassword: Boolean(u.passwordHash),
  preferences: u.preferences ?? {},
  createdAt: u.createdAt,
});
