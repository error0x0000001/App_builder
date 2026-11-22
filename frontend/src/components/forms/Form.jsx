import { FormProvider } from 'react-hook-form';
import { Alert } from '../ui/Alert.jsx';

/** Provides form context to bound fields and renders the form-level error. */
export function Form({ form, onSubmit, error, children, className = 'space-y-4' }) {
  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className={className}>
        {error && <Alert tone="error">{error}</Alert>}
        {children}
      </form>
    </FormProvider>
  );
}
