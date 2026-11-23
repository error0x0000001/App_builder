/** Stable 0–359 hue for a string (the same person → the same colour everywhere). */
export const hueOf = (text) => { let h = 0; for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) % 360; return h; };
