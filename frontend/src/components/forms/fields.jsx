import { Controller, get, useController, useFormContext } from 'react-hook-form';
import { Button } from '../ui/Button.jsx';
import { Checkbox } from '../ui/Checkbox.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';
import { Input } from '../ui/Input.jsx';
import { OtpInput } from '../ui/OtpInput.jsx';
import { PasswordInput } from '../ui/PasswordInput.jsx';
import { PasswordRules } from '../ui/PasswordRules.jsx';
import { Select } from '../ui/Select.jsx';
import { Switch } from '../ui/Switch.jsx';
import { Textarea } from '../ui/Textarea.jsx';

/** Form-bound wrappers: register the control and surface its validation error. Presentation stays in ui/*. */
const useField = (name) => {
  const { register, formState: { errors } } = useFormContext();
  return { ...register(name), error: get(errors, name)?.message };
};

export const TextField = ({ name, ...rest }) => <Input {...useField(name)} {...rest} />;
export const PasswordField = ({ name, ...rest }) => <PasswordInput {...useField(name)} {...rest} />;
/** Controlled by react-hook-form: our Select reports the picked value, not a DOM event. */
function useControlled(name) {
  const { control } = useFormContext();
  const { field, fieldState } = useController({ name, control });
  return { ref: field.ref, name: field.name, value: field.value ?? '', onChange: field.onChange, onBlur: field.onBlur, error: fieldState.error?.message };
}
export const SelectField = ({ name, ...rest }) => <Select {...useControlled(name)} {...rest} />;
export const DateField = ({ name, ...rest }) => <DatePicker {...useControlled(name)} {...rest} />;
export const SwitchField = ({ name, ...rest }) => <Switch {...useField(name)} {...rest} />;
export const TextareaField = ({ name, ...rest }) => <Textarea {...useField(name)} {...rest} />;
export const CheckboxField = ({ name, ...rest }) => <Checkbox {...useField(name)} {...rest} />;

export function OtpField({ name, ...rest }) {
  const { control } = useFormContext();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => <OtpInput value={field.value ?? ''} onChange={field.onChange} error={fieldState.error?.message} {...rest} />}
    />
  );
}

/** Password with the live requirements checklist beneath it. */
export function NewPasswordField({ name = 'password', label = 'Password', ...rest }) {
  const { watch } = useFormContext();
  return (
    <div className="space-y-2">
      <PasswordField name={name} label={label} autoComplete="new-password" {...rest} />
      <PasswordRules value={watch(name) ?? ''} />
    </div>
  );
}

export function SubmitButton({ children, ...rest }) {
  const { formState: { isSubmitting } } = useFormContext();
  return <Button type="submit" loading={isSubmitting} {...rest}>{children}</Button>;
}
