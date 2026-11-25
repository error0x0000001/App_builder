import { z } from 'zod';
import {
  acceptTermsField, countryField, emailField, nameField, optionalText, otpField, passwordField, passwordsMatch,
  recoveryCodeField, slugField, teamSizeField, tokenField,
} from './fields.js';

export const signupSchema = z.object({
  firstName: nameField('first name'),
  lastName: nameField('last name'),
  email: emailField,
  password: passwordField,
  company: nameField('company name').pipe(z.string().max(80)),
  jobTitle: optionalText(),
  phone: optionalText(30),
  teamSize: teamSizeField,
  country: countryField,
  acceptTerms: acceptTermsField,
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password').max(256),
  tenant: slugField.optional().or(z.literal('').transform(() => undefined)),
  rememberMe: z.boolean().optional(),
});

export const verifyEmailSchema = z.object({ email: emailField, code: otpField });
export const emailOnlySchema = z.object({ email: emailField });

export const resetPasswordSchema = passwordsMatch(z.object({ token: tokenField, password: passwordField, confirmPassword: z.string() }));

export const changePasswordSchema = passwordsMatch(
  z.object({ currentPassword: z.string().min(1, 'Enter your current password'), password: passwordField, confirmPassword: z.string() }),
);

/** TOTP code or a recovery code, exactly one. */
export const mfaChallengeSchema = z
  .object({ mfaToken: tokenField, code: otpField.optional(), recoveryCode: recoveryCodeField.optional() })
  .refine((v) => Boolean(v.code) !== Boolean(v.recoveryCode), { message: 'Enter a code', path: ['code'] });

export const mfaCodeSchema = z.object({ code: otpField });
export const recoveryCodeSchema = z.object({ recoveryCode: recoveryCodeField });
export const mfaDisableSchema = z.object({ password: z.string().max(256).optional(), code: otpField });

export const updateProfileSchema = z.object({
  firstName: nameField('first name'),
  lastName: nameField('last name'),
  jobTitle: optionalText(),
  phone: optionalText(30),
  country: countryField,
});

export const tenantLookupSchema = z.object({ tenant: slugField });
