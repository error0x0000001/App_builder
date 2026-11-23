/**
 * Whole-UI colour palettes (Customize › Theme presets › "Whole-app palettes"). Unlike the brand colours (navigation + accent), a palette
 * restyles the page, cards, borders and text in BOTH light and dark. Each mode lists the eight surface colours; everything else
 * (navigation, hover, rail, accent tokens) is derived in color.js. `accent` is the palette's brand colour, `accentDark` its dark-mode variant (the owner can still override both).
 * `default` has no overrides: the built-in Untitled UI look. Add a palette = one entry here (it then appears as a preset).
 */
export const PALETTES = Object.freeze([
  { id: 'default', label: 'Untitled' },
  {
    id: 'claude', label: 'Claude', accent: '#c96442', accentDark: '#d97757',
    light: { bg: '#f0eee6', inset: '#faf9f5', surface: '#ffffff', surface2: '#f5f4ed', line: '#e8e6dc', lineStrong: '#d8d5c8', ink: '#141413', muted: '#5e5d59', placeholder: '#87867f', sidebar: '#f5f4ed' },
    dark: { bg: '#1f1e1d', inset: '#262624', surface: '#30302e', surface2: '#3a3a37', line: '#3d3d3a', lineStrong: '#4d4c48', ink: '#faf9f5', muted: '#b0aea5', placeholder: '#87867f', sidebar: '#1f1e1d' },
  },
  {
    id: 'github', label: 'GitHub', accent: '#0969da', accentDark: '#2f81f6',
    light: { bg: '#f6f8fa', inset: '#ffffff', surface: '#ffffff', surface2: '#f6f8fa', line: '#d8dee4', lineStrong: '#d0d7de', ink: '#1f2328', muted: '#59636e', placeholder: '#818b98', sidebar: '#f6f8fa' },
    dark: { bg: '#010409', inset: '#0d1117', surface: '#161b22', surface2: '#21262d', line: '#30363d', lineStrong: '#484f58', ink: '#e6edf3', muted: '#9198a1', placeholder: '#6e7681', sidebar: '#010409' },
  },
  {
    id: 'linear', label: 'Linear', accent: '#5e6ad2', accentDark: '#7c85ff',
    light: { bg: '#f4f5f8', inset: '#ffffff', surface: '#ffffff', surface2: '#f7f8fa', line: '#e6e8ec', lineStrong: '#d5d8de', ink: '#1b1c1f', muted: '#62666d', placeholder: '#8a8f98', sidebar: '#f4f5f8' },
    dark: { bg: '#08090a', inset: '#101113', surface: '#17181b', surface2: '#1d1e22', line: '#26282d', lineStrong: '#34363c', ink: '#f7f8f8', muted: '#9a9fa8', placeholder: '#62666d', sidebar: '#0b0c0e' },
  },
  {
    id: 'notion', label: 'Notion', accent: '#2383e2', accentDark: '#529cca',
    light: { bg: '#f7f6f3', inset: '#ffffff', surface: '#ffffff', surface2: '#f7f6f3', line: '#e9e9e7', lineStrong: '#dcdcd9', ink: '#37352f', muted: '#6b6a66', placeholder: '#9b9a97', sidebar: '#f7f6f3' },
    dark: { bg: '#202020', inset: '#191919', surface: '#252525', surface2: '#2f2f2f', line: '#373737', lineStrong: '#464646', ink: '#ebebea', muted: '#a0a0a0', placeholder: '#737373', sidebar: '#202020' },
  },
  {
    id: 'vercel', label: 'Vercel', accent: '#000000', accentDark: '#ededed',
    light: { bg: '#fafafa', inset: '#ffffff', surface: '#ffffff', surface2: '#fafafa', line: '#ebebeb', lineStrong: '#d4d4d4', ink: '#000000', muted: '#666666', placeholder: '#8f8f8f', sidebar: '#ffffff' },
    dark: { bg: '#000000', inset: '#000000', surface: '#0a0a0a', surface2: '#111111', line: '#242424', lineStrong: '#333333', ink: '#ededed', muted: '#a1a1a1', placeholder: '#707070', sidebar: '#000000' },
  },
  {
    id: 'nord', label: 'Nord', accent: '#5e81ac', accentDark: '#88c0d0',
    light: { bg: '#e5e9f0', inset: '#eceff4', surface: '#ffffff', surface2: '#eceff4', line: '#d8dee9', lineStrong: '#c2cad8', ink: '#2e3440', muted: '#4c566a', placeholder: '#7b88a1', sidebar: '#e5e9f0' },
    dark: { bg: '#242933', inset: '#2e3440', surface: '#3b4252', surface2: '#434c5e', line: '#4c566a', lineStrong: '#5b6579', ink: '#eceff4', muted: '#d8dee9', placeholder: '#8f9bb3', sidebar: '#242933' },
  },
]);
