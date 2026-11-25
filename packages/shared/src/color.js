/**
 * Colour maths for the owner's custom colours (Customize › Colors). Pure functions only — the picker UI, the CSS the app injects and the
 * unit tests all share them. From ONE chosen colour we derive every token a theme needs, in light and dark, with readable text on top.
 */
import { PALETTES } from './palettes.js';

export const HEX_RE = /^#[0-9a-f]{6}$/i;

const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const to255 = (n) => Math.round(clamp(n / 255) * 255);

export const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgbToHex = ([r, g, b]) => `#${[r, g, b].map((c) => to255(c).toString(16).padStart(2, '0')).join('')}`;

/** hex ↔ HSV (h 0–360, s and v 0–1): the model the picker's saturation area and hue slider edit. */
export function hexToHsv(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b); const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
export function hsvToHex({ h, s, v }) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return rgbToHex([f(5) * 255, f(3) * 255, f(1) * 255]);
}

/** `t` = how far from `a` toward `b` (0–1). */
export const mix = (a, b, t) => { const [x, y] = [hexToRgb(a), hexToRgb(b)]; return rgbToHex(x.map((c, i) => c + (y[i] - c) * t)); };

const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrastRatio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

const WHITE = '#ffffff'; const BLACK = '#000000'; const INK = '#101828';
/** Text colour (white or ink) that reads best on `hex`. */
export const readableOn = (hex) => (contrastRatio(hex, WHITE) >= contrastRatio(hex, INK) ? WHITE : INK);

/** Move `hex` toward `toward` until it reaches `ratio` contrast against `against` (for link text). */
const ensureContrast = (hex, against, toward, ratio = 4.5) => { let c = hex; for (let t = 0; t <= 1 && contrastRatio(c, against) < ratio; t += 0.05) c = mix(hex, toward, t); return c; };

const rgba = (hex, a) => `rgb(${hexToRgb(hex).join(' ')} / ${a})`;

/** Accent tokens for the light and dark page from one brand colour. */
export function accentTokens(hex) {
  const light = {
    '--accent': hex, '--accent-hover': mix(hex, BLACK, 0.14), '--accent-soft': mix(hex, WHITE, 0.92), '--accent-ink': readableOn(hex),
    '--link': ensureContrast(hex, WHITE, BLACK), '--ring': mix(hex, WHITE, 0.85),
  };
  const lifted = luminance(hex) < 0.08 ? mix(hex, WHITE, 0.4) : hex; // a very dark brand colour would vanish on a black page
  const dark = {
    '--accent': lifted, '--accent-hover': mix(lifted, WHITE, 0.18), '--accent-soft': mix(lifted, '#181818', 0.86), '--accent-ink': readableOn(lifted),
    '--link': ensureContrast(lifted, '#181818', WHITE), '--ring': rgba(lifted, 0.3),
  };
  return { light, dark };
}

/** Navigation tokens (same in light and dark, like the Navy colour): surface, readable ink, a darker rail card, hover and lines. */
export function navTokens(hex) {
  const ink = readableOn(hex);
  const dark = luminance(hex) < 0.4;
  return {
    '--sidebar': hex, '--sidebar-ink': ink, '--sidebar-muted': mix(ink, hex, 0.35), '--sidebar-line': mix(ink, hex, 0.82), '--sidebar-accent': mix(ink, hex, 0.88),
    '--sidebar-primary': ink, '--sidebar-primary-ink': hex, '--rail': mix(hex, BLACK, dark ? 0.25 : 0.06), '--chrome': hex,
  };
}

/** Every surface and navigation token for one mode of a palette (navigation derives from the same eight colours). */
export function paletteTokens(palette, mode) {
  const c = palette?.[mode];
  if (!c) return null;
  return {
    surfaces: {
      '--bg': c.bg, '--inset': c.inset, '--surface': c.surface, '--surface-2': c.surface2, '--line': c.line, '--line-strong': c.lineStrong,
      '--ink': c.ink, '--muted': c.muted, '--placeholder': c.placeholder,
    },
    nav: {
      '--sidebar': c.sidebar, '--sidebar-ink': c.ink, '--sidebar-muted': c.muted, '--sidebar-line': c.line, '--sidebar-accent': mix(c.sidebar, c.ink, 0.07),
      '--rail': mix(c.sidebar, c.ink, 0.05), '--chrome': c.bg,
    },
  };
}

const rule = (selector, tokens) => `${selector}{${Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(';')}}`;

/** The CSS for whichever custom colours are set. Selectors outrank the organisation-theme blocks; the app injects this in one <style>. */
export function customColorCss({ palette: paletteId, accentHex, navHex } = {}) {
  const out = [];
  const palette = PALETTES.find((p) => p.id === paletteId && p.light);
  if (palette) {
    for (const [mode, prefix] of [['light', 'html:root'], ['dark', 'html:root[data-theme="dark"]']]) {
      const t = paletteTokens(palette, mode);
      out.push(rule(`${prefix}[data-palette="${palette.id}"]`, t.surfaces), rule(`${prefix}[data-palette="${palette.id}"]:not([data-nav-color])`, t.nav));
    }
  }
  const own = accentHex && HEX_RE.test(accentHex) ? accentHex : null; // the owner's colour wins over the palette's
  const accent = own ?? palette?.accent;
  if (accent) {
    out.push(rule('html:root[data-accent="custom"]', accentTokens(accent).light), rule('html:root[data-theme="dark"][data-accent="custom"]', accentTokens(own ?? palette.accentDark ?? accent).dark));
  }
  if (navHex && HEX_RE.test(navHex)) out.push(rule('html:root[data-nav-color="custom"]', navTokens(navHex)));
  return out.join('\n');
}

/** Presets offered in the picker (Untitled UI's 600 shades + neutrals). */
export const COLOR_PRESETS = Object.freeze([
  '#7f56d9', '#444ce7', '#1570ef', '#0ba5ec', '#15b79e', '#12b76a', '#eaaa08', '#ef6820', '#f04438', '#ee46bc', '#f63d68', '#344054', '#101828', '#00072d',
]);
