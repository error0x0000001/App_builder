import { PALETTES, UI_PRESETS, accentTokens, navTokens, paletteTokens } from '@app/shared';
import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Sheet } from '../components/ui/Sheet.jsx';
import { cn } from '../lib/cn.js';

const BUILT_IN = { '--bg': '#f9fafb', '--inset': '#ffffff', '--surface': '#ffffff', '--line': '#eaecf0', '--line-strong': '#d0d5dd', '--ink': '#101828', '--muted': '#475467' };
const BUILT_IN_NAV = { '--sidebar': '#ffffff', '--sidebar-ink': '#101828', '--rail': '#f2f4f7' };
const BUILT_IN_ACCENT = '#7f56d9';
const KEYS = ['palette', 'navColor', 'navHex', 'accentHex'];
const DEFAULT_FOR = { palette: 'default', navColor: 'default' };

/** Does the organisation currently look like this preset? (Only the colour options are compared.) */
export const matchesPreset = (preset, ui) => KEYS.every((key) => (ui[key] ?? DEFAULT_FOR[key] ?? null) === (preset.ui[key] ?? DEFAULT_FOR[key] ?? null));

/** A tiny mock of the app (rail, panel, page with a card and a button) painted with the preset's own colours, light mode. */
function PresetPreview({ preset }) {
  const palette = PALETTES.find((p) => p.id === preset.ui.palette && p.light);
  const t = palette ? paletteTokens(palette, 'light') : null;
  const page = t?.surfaces ?? BUILT_IN;
  const nav = preset.ui.navHex ? navTokens(preset.ui.navHex) : t?.nav ?? BUILT_IN_NAV;
  const accent = accentTokens(preset.ui.accentHex ?? palette?.accent ?? BUILT_IN_ACCENT).light['--accent'];
  const bar = (w, tone = 0.28) => <span className="block h-1.5 rounded-full" style={{ width: w, background: nav['--sidebar-ink'], opacity: tone }} />;
  return (
    <span className="flex h-24 overflow-hidden rounded-lg border" style={{ background: page['--bg'], borderColor: page['--line'] }} aria-hidden="true">
      <span className="m-1 w-4 shrink-0 rounded-md" style={{ background: nav['--rail'] }} />
      <span className="flex w-14 shrink-0 flex-col gap-2 px-2 pt-3" style={{ background: nav['--sidebar'] }}>
        {bar('70%', 0.9)}{bar('90%')}{bar('60%')}{bar('80%')}
      </span>
      <span className="flex flex-1 flex-col gap-2 p-2.5" style={{ background: page['--inset'] }}>
        <span className="ml-auto h-4 w-10 rounded" style={{ background: accent }} />
        <span className="flex flex-col gap-1.5 rounded-md border p-1.5" style={{ background: page['--surface'], borderColor: page['--line'] }}>
          <span className="block h-1.5 w-3/4 rounded-full" style={{ background: page['--ink'], opacity: 0.75 }} />
          <span className="block h-1.5 w-1/2 rounded-full" style={{ background: page['--muted'], opacity: 0.5 }} />
        </span>
        <span className="block h-1.5 w-2/3 rounded-full" style={{ background: page['--line-strong'] }} />
      </span>
    </span>
  );
}

function PresetGrid({ title, hint, presets, ui, pending, onApply }) {
  return (
    <section className="space-y-2">
      <div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3><p className="mt-0.5 text-xs text-muted">{hint}</p></div>
      <div role="radiogroup" aria-label={title} className="grid grid-cols-2 gap-3">
        {presets.map((preset) => {
          const selected = matchesPreset(preset, ui);
          return (
            <button
              key={preset.id} type="button" role="radio" aria-checked={selected} disabled={pending !== null} onClick={() => onApply(preset)}
              className={cn('flex flex-col gap-2 rounded-xl border p-2 text-left outline-none transition-colors focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-70', selected ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-surface-2')}
            >
              <PresetPreview preset={preset} />
              <span className="flex items-center gap-1.5 px-1">
                <span className="text-sm font-semibold text-ink">{preset.label}</span>
                {selected && <Icon name="check-circle" className="ml-auto size-4 text-link" />}
              </span>
              <span className="px-1 pb-1 text-xs text-muted">{preset.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * "Theme presets": a second sheet stacked on top of Customize. Brand colours recolour the navigation and accent; whole-app palettes
 * (Claude, GitHub, Linear …) restyle the page, cards, borders and text in light and dark too. One click applies a preset for the whole
 * tenant; layout and style are left as they are. The list is the shared UI_PRESETS registry.
 */
export function ThemePresetsSheet({ open, onClose }) {
  const { ui, updateUi } = useAuth();
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);

  const apply = async (preset) => {
    setError(null); setPending(preset.id);
    try { await updateUi(preset.ui); } catch (e) { setError(e.message); } finally { setPending(null); }
  };
  const brand = UI_PRESETS.filter((p) => p.kind !== 'palette');
  const palettes = UI_PRESETS.filter((p) => p.kind === 'palette');

  return (
    <Sheet open={open} onClose={onClose} level={1} width="w-[26rem]" title="Theme presets" description="Pick a complete look for everyone in this organisation. You can still fine-tune the colours afterwards.">
      {error && <Alert tone="error">{error}</Alert>}
      <PresetGrid title="Whole-app palettes" hint="Restyle the page, cards, borders and text, light and dark." presets={palettes} ui={ui} pending={pending} onApply={apply} />
      <PresetGrid title="Brand colours" hint="Recolour the navigation and the accent on the built-in look." presets={brand} ui={ui} pending={pending} onApply={apply} />
    </Sheet>
  );
}
