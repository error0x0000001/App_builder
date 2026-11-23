import { UI_PRESETS, accentTokens, navTokens } from '@app/shared';
import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { Sheet } from '../components/ui/Sheet.jsx';
import { cn } from '../lib/cn.js';

const DEFAULT_NAV = { '--sidebar': '#ffffff', '--sidebar-ink': '#101828', '--rail': '#f2f4f7', '--sidebar-line': '#eaecf0' };
const DEFAULT_ACCENT = '#7f56d9';

/** Does the workspace currently look like this preset? (Only the colour options are compared.) */
export const matchesPreset = (preset, ui) => ['navColor', 'navHex', 'accentHex'].every((key) => (ui[key] ?? null) === (preset.ui[key] ?? null));

/** A tiny mock of the app (rail, panel, page with a button) painted with the preset's own derived colours. */
function PresetPreview({ preset }) {
  const nav = preset.ui.navHex ? navTokens(preset.ui.navHex) : DEFAULT_NAV;
  const accent = accentTokens(preset.ui.accentHex ?? DEFAULT_ACCENT).light['--accent'];
  const bar = (w, tone = 0.28) => <span className="block h-1.5 rounded-full" style={{ width: w, background: nav['--sidebar-ink'], opacity: tone }} />;
  return (
    <span className="flex h-24 overflow-hidden rounded-lg border border-line bg-[#f9fafb]" aria-hidden="true">
      <span className="m-1 w-4 shrink-0 rounded-md" style={{ background: nav['--rail'] }} />
      <span className="flex w-16 shrink-0 flex-col gap-2 px-2 pt-3" style={{ background: nav['--sidebar'] }}>
        {bar('70%', 0.9)}{bar('90%')}{bar('60%')}{bar('80%')}
      </span>
      <span className="flex flex-1 flex-col gap-2 p-3">
        <span className="ml-auto h-4 w-10 rounded" style={{ background: accent }} />
        <span className="block h-1.5 w-3/4 rounded-full bg-[#d0d5dd]" />
        <span className="block h-1.5 w-1/2 rounded-full bg-[#eaecf0]" />
        <span className="block h-1.5 w-2/3 rounded-full bg-[#eaecf0]" />
      </span>
    </span>
  );
}

/**
 * "Theme presets": a second sheet stacked on top of Customize with every complete colour look. One click applies the preset's colours
 * (navigation + accent) for the whole workspace; layout and style are left as they are. The list is the shared UI_PRESETS registry.
 */
export function ThemePresetsSheet({ open, onClose }) {
  const { ui, updateUi } = useAuth();
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);

  const apply = async (preset) => {
    setError(null); setPending(preset.id);
    try { await updateUi(preset.ui); } catch (e) { setError(e.message); } finally { setPending(null); }
  };

  return (
    <Sheet open={open} onClose={onClose} level={1} width="w-[26rem]" title="Theme presets" description="Pick a complete colour look. It applies to everyone in this workspace; you can still fine-tune the colours afterwards.">
      {error && <Alert tone="error">{error}</Alert>}
      <div role="radiogroup" aria-label="Theme presets" className="grid grid-cols-2 gap-3">
        {UI_PRESETS.map((preset) => {
          const selected = matchesPreset(preset, ui);
          return (
            <button
              key={preset.id} type="button" role="radio" aria-checked={selected} disabled={pending !== null} onClick={() => apply(preset)}
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
    </Sheet>
  );
}
