import { z } from 'zod';
import { COUNTRIES, OTP_LENGTH, PASSWORD_MAX, TEAM_SIZES } from '../constants.js';
import { failedPasswordRules } from '../password.js';
import { SLUG_PATTERN, isReservedSlug } from '../slug.js';

/** Reusable field schemas. Every form/endpoint composes these — never redefine them. */
export const emailField = z.string().trim().toLowerCase().min(1, 'Enter your email').email('Enter a valid email address').max(254);

export const passwordField = z
  .string()
  .max(PASSWORD_MAX)
  .superRefine((value, ctx) => {
    const failed = failedPasswordRules(value);
    if (failed.length) ctx.addIssue({ code: 'custom', message: 'Your password doesn’t meet the requirements.' });
  });

/** Adds the "passwords must match" rule to any schema with password + confirmPassword. */
export const passwordsMatch = (schema) =>
  schema.refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords don’t match.' });

export const nameField = (label) => z.string().trim().min(1, `Enter your ${label}`).max(80);
export const optionalText = (max = 80) =>
  z.string().trim().max(max).optional().transform((v) => v || undefined);
export const optionalChoice = (values) =>
  z.enum(values).optional().or(z.literal('').transform(() => undefined));

export const otpField = z.string().trim().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Enter all ${OTP_LENGTH} digits`);
export const recoveryCodeField = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/, 'Enter a valid recovery code');
export const tokenField = z.string().trim().min(20).max(1024); // link tokens and signed JWTs
export const uuidField = z.string().uuid();

export const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SLUG_PATTERN, 'Use 3–40 letters, numbers or hyphens')
  .refine((s) => !isReservedSlug(s), 'This name is reserved');

export const teamSizeField = optionalChoice(TEAM_SIZES);
export const countryField = optionalChoice(COUNTRIES);
export const acceptTermsField = z.literal(true, { errorMap: () => ({ message: 'You must agree to the terms to continue.' }) });
