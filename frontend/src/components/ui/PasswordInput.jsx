import { forwardRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { Input } from './Input.jsx';

/** Password input with a show/hide toggle and Caps Lock warning. */
export const PasswordInput = forwardRef(function PasswordInput({ hint, onKeyUp, ...rest }, ref) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  return (
    <Input
      ref={ref}
      type={visible ? 'text' : 'password'}
      hint={capsLock ? 'Caps Lock is on.' : hint}
      onKeyUp={(event) => { setCapsLock(event.getModifierState?.('CapsLock') ?? false); onKeyUp?.(event); }}
      suffix={
        <button type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible} aria-label={visible ? 'Hide password' : 'Show password'} className="grid size-6 place-items-center rounded text-muted hover:text-ink">
          <Icon name={visible ? 'eye-off' : 'eye'} />
        </button>
      }
      {...rest}
    />
  );
});
