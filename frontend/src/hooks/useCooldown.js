import { useCallback, useEffect, useState } from 'react';

/** Countdown for "resend" buttons. */
export function useCooldown(seconds) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  const start = useCallback(() => setRemaining(seconds), [seconds]);
  return { remaining, start, active: remaining > 0 };
}
