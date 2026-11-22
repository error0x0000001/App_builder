/** Stable 0–359 hue for a string (same person → same colour everywhere). */
export const hueOf = (text) => { let h = 0; for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) % 360; return h; };
/** One hue per kind of search result / scope. */
export const KIND_HUE = { record: 250, person: 340, config: 65, setting: 65, page: 160, all: 285, recent: 285 };
