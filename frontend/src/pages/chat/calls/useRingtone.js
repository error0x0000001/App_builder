import { useEffect } from 'react';

/** A soft two-tone ring (Web Audio — no audio file to ship) that repeats while `active`. Silent if the browser blocks audio. */
export function useRingtone(active) {
  useEffect(() => {
    if (!active) return undefined;
    let context;
    let timer;
    try {
      context = new (window.AudioContext || window.webkitAudioContext)();
      const beep = (frequency, start, length) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, context.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + length);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(context.currentTime + start);
        oscillator.stop(context.currentTime + start + length + 0.05);
      };
      const ring = () => { beep(880, 0, 0.35); beep(660, 0.45, 0.35); };
      ring();
      timer = setInterval(ring, 2500);
    } catch { /* no audio available */ }
    return () => { clearInterval(timer); context?.close().catch(() => {}); };
  }, [active]);
}
