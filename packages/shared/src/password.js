import { PASSWORD_MAX, PASSWORD_MIN } from './constants.js';

/** Single source of truth for password rules — rendered in the UI and enforced by the API. */
export const PASSWORD_RULES = Object.freeze([
  { id: 'length', label: `At least ${PASSWORD_MIN} characters`, test: (v) => v.length >= PASSWORD_MIN && v.length <= PASSWORD_MAX },
  { id: 'letter', label: 'At least 1 letter', test: (v) => /[A-Za-z]/.test(v) },
  { id: 'number', label: 'At least 1 number', test: (v) => /\d/.test(v) },
]);

export const failedPasswordRules = (value) => PASSWORD_RULES.filter((rule) => !rule.test(value));
