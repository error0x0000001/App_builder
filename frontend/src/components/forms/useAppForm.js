import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError } from '../../api/http.js';

/**
 * Every form in the app goes through here: shared-schema validation, submit state, and
 * server errors mapped onto fields (VALIDATION_ERROR details) or a form-level alert.
 * `onError(error)` may return true to signal the error was handled (no alert shown).
 */
export function useAppForm({ schema, defaultValues, onSubmit, onError }) {
  const form = useForm({ resolver: zodResolver(schema), defaultValues, mode: 'onTouched' });
  const [formError, setFormError] = useState(null);

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values, form);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (onError?.(error) === true) return;
      const fieldErrors = Array.isArray(error.details) ? error.details.filter((d) => d.field && d.field !== 'body') : [];
      fieldErrors.forEach(({ field, message }) => form.setError(field, { message }));
      if (!fieldErrors.length) setFormError(error.message);
    }
  });

  return { form, submit, formError, setFormError };
}
