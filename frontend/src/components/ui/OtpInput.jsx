import { useRef } from 'react';
import { cn } from '../../lib/cn.js';

/** Segmented one-time-code entry with auto-advance, backspace navigation and paste support. */
export function OtpInput({ value = '', onChange, length = 6, error, autoFocus = false, label = 'Verification code', disabled }) {
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const emit = (next) => onChange(next.join('').slice(0, length));
  const focus = (i) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  const handleInput = (i, raw) => {
    const typed = raw.replace(/\D/g, '');
    if (!typed) return;
    const next = [...digits];
    typed.split('').slice(0, length - i).forEach((char, offset) => { next[i + offset] = char; });
    emit(next);
    focus(i + typed.length);
  };

  const handleKeyDown = (i, event) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = [...digits];
      if (next[i]) next[i] = ''; else if (i > 0) { next[i - 1] = ''; focus(i - 1); }
      emit(next);
    } else if (event.key === 'ArrowLeft') focus(i - 1);
    else if (event.key === 'ArrowRight') focus(i + 1);
  };

  return (
    <div>
      <div role="group" aria-label={label} className="flex justify-center gap-2">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            value={digit}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            autoFocus={autoFocus && i === 0}
            maxLength={length}
            disabled={disabled}
            aria-label={`${label}, digit ${i + 1}`}
            aria-invalid={Boolean(error) || undefined}
            onChange={(e) => handleInput(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={(e) => e.target.select()}
            className={cn(
              'h-13 w-11 rounded-lg border bg-surface text-center text-2xl text-ink outline-none transition focus:border-link focus:ring-4 focus:ring-ring sm:w-12',
              error ? 'border-danger' : 'border-line-strong',
            )}
          />
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-center text-xs text-danger">{error}</p>}
    </div>
  );
}
