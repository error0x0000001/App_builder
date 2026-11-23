/**
 * Full-colour glyphs (not theme-coloured line icons) for the global-search scopes and document rows — the colourful "app icons" row of the
 * search design. 24px grid; each is decorative (`aria-hidden`), the label next to it names it.
 */
const base = { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' };

/** All: four colourful shapes. */
export const AppsColorIcon = ({ className = 'size-5' }) => (
  <svg {...base} className={className}>
    <circle cx="7.5" cy="7.5" r="4.5" fill="#4285f4" /><rect x="13" y="3" width="8" height="9" rx="2.5" fill="#ea4335" />
    <rect x="3" y="13" width="9" height="8" rx="2.5" fill="#fbbc04" /><circle cx="16.5" cy="16.5" r="4.5" fill="#34a853" />
  </svg>
);

/** Navigation: a blue compass with a red/white needle. */
export const CompassColorIcon = ({ className = 'size-5' }) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="10" fill="#3b82f6" /><circle cx="12" cy="12" r="7.6" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1" />
    <path d="M16.6 7.4l-3.4 5.8-2.4-2.4z" fill="#ef4444" /><path d="M7.4 16.6l3.4-5.8 2.4 2.4z" fill="#ffffff" /><circle cx="12" cy="12" r="1" fill="#1d4ed8" />
  </svg>
);

/** Records: a database stack in violet, indigo, blue and cyan. */
export const RecordsColorIcon = ({ className = 'size-5' }) => (
  <svg {...base} className={className}>
    <path d="M4 14v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4z" fill="#06b6d4" /><path d="M4 10v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4z" fill="#3b82f6" />
    <path d="M4 6v4c0 1.7 3.6 3 8 3s8-1.3 8-3V6z" fill="#6366f1" /><ellipse cx="12" cy="6" rx="8" ry="3" fill="#a78bfa" />
  </svg>
);

/** Documents: a page with a folded corner and text lines; `color` tints it per kind of document. */
export const DocumentColorIcon = ({ className = 'size-5', color = '#3b82f6' }) => (
  <svg {...base} className={className}>
    <path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill={color} /><path d="M14 2v5h5z" fill="#ffffff" fillOpacity="0.45" />
    <rect x="7.5" y="11" width="9" height="1.6" rx="0.8" fill="#ffffff" /><rect x="7.5" y="14.5" width="9" height="1.6" rx="0.8" fill="#ffffff" /><rect x="7.5" y="18" width="5.5" height="1.6" rx="0.8" fill="#ffffff" />
  </svg>
);
