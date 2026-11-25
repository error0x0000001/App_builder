import { z } from 'zod';
import { ASSIGNABLE_ROLES, INDUSTRIES, ROLES, TENANT_THEME_IDS, TIMEZONES } from '../constants.js';
import { acceptTermsField, emailField, nameField, optionalChoice, optionalText, passwordField, passwordsMatch, teamSizeField, tokenField } from './fields.js';

export const tokenOnlySchema = z.object({ token: tokenField });

export const createTenantSchema = z.object({ name: nameField('organisation name').pipe(z.string().max(80)) });

export const onboardingSchema = z.object({
  name: nameField('company name').pipe(z.string().max(80)),
  industry: optionalChoice(INDUSTRIES),
  teamSize: teamSizeField,
  timezone: optionalChoice(TIMEZONES),
});

export const workspaceSchema = z.object({ name: nameField('workspace name').pipe(z.string().max(80)) });
export const workspaceAssignmentsSchema = z.object({ workspaceIds: z.array(z.string().uuid()).min(1).max(100) });

export const tenantThemeSchema = z.object({ theme: z.enum(TENANT_THEME_IDS) });

export const inviteSchema = z.object({ email: emailField, role: z.enum(ASSIGNABLE_ROLES).default('member') });
export const bulkInviteSchema = z.object({ invitations: z.array(inviteSchema).min(1).max(50) });
export const changeRoleSchema = z.object({ role: z.enum(ROLES) });

export const acceptInviteSchema = z.object({
  token: tokenField,
  firstName: optionalText(),
  lastName: optionalText(),
  password: passwordField.optional(),
  acceptTerms: acceptTermsField.optional(),
});

/** The form a brand-new invitee fills in (the API schema above is permissive because existing users send only the token). */
export const acceptNewUserInviteSchema = passwordsMatch(
  z.object({
    token: tokenField,
    firstName: nameField('first name'),
    lastName: nameField('last name'),
    password: passwordField,
    confirmPassword: z.string(),
    acceptTerms: acceptTermsField,
  }),
);

/** Cursor pagination used by every list endpoint. */
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  after: z.string().max(200).optional(),
});
