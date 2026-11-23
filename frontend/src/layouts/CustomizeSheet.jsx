import { UI_DEFAULTS, UI_OPTIONS, UI_PRESETS } from '@app/shared';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { Button } from '../components/ui/Button.jsx';
import { ColorPicker } from '../components/ui/ColorPicker.jsx';
import { RadioCardGroup } from '../components/ui/RadioCardGroup.jsx';
import { SegmentedControl } from '../components/ui/SegmentedControl.jsx';
import { Sheet } from '../components/ui/Sheet.jsx';
import { Icon } from '../components/ui/Icon.jsx';
import { ThemePicker } from '../components/workspace/ThemePicker.jsx';
import { applyCustomColors } from '../lib/customColors.js';
import { useCustomize } from './CustomizeContext.jsx';
import { matchesPreset, ThemePresetsSheet } from './ThemePresetsSheet.jsx';

const swatch = (colors) => (
  <span className="flex shrink-0 overflow-hidden rounded-md border border-line" aria-hidden="true">
    {colors.map((color) => <span key={color} className="size-6" style={{ background: color }} />)}
  </span>
);

/** One registry option → its control. Add a `type` here when a new kind of option is needed. */
function OptionControl({ option, value, onChange, onPreview }) {
  if (option.type === 'color') {
    return (
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><ColorPicker label={option.label} value={value} onChange={onPreview} onCommit={onChange} placeholder="Using the preset" /></div>
        {value && <Button size="sm" variant="neutral" onClick={() => onChange(null)}>Clear</Button>}
      </div>
    );
  }
  if (option.type === 'swatch') {
    return <RadioCardGroup columns="grid-cols-2" name={`ui-${option.key}`} label={option.label} value={value} onChange={onChange} options={option.options.map((o) => ({ value: o.value, label: o.label, preview: swatch(o.colors) }))} />;
  }
  return <SegmentedControl label={option.label} value={value} onChange={onChange} options={option.options} />;
}

/**
 * The workspace owner's "Customize" sheet. Everything here is generated from the shared UI_OPTIONS registry (plus the
 * workspace colour theme), applied live, and saved to the workspace in the database for every member. Only owners see it.
 */
export function CustomizeSheet() {
  const { open, close } = useCustomize();
  const { ui, updateUi } = useAuth();
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);

  useEffect(() => { if (!saved) return undefined; const t = setTimeout(() => setSaved(false), 2000); return () => clearTimeout(t); }, [saved]);

  const change = async (patch) => {
    setError(null);
    try { await updateUi(patch); setSaved(true); } catch (e) { setError(e.message); }
  };

  const preview = (key) => (hex) => applyCustomColors({ ...ui, [key]: hex }); // live while dragging; saved on release
  const groups = Map.groupBy(UI_OPTIONS.filter((o) => !o.hidden), (o) => o.group); // hidden options (the palette) are set from Theme presets
  const control = (option) => (
    <div key={option.key} className="space-y-1.5">
      <p className="text-sm font-medium text-ink">{option.label}</p>
      <OptionControl option={option} value={ui[option.key]} onChange={(value) => change({ [option.key]: value })} onPreview={preview(option.key)} />
      {option.description && <p className="text-xs text-muted">{option.description}</p>}
    </div>
  );
  return (
    <Sheet
      open={open} onClose={close} title="Customize" description="Changes apply to everyone in this workspace and are saved automatically."
      footer={(
        <div className="flex items-center justify-between gap-3">
          <span role="status" className="text-xs text-muted">{saved ? 'Saved' : ''}</span>
          <Button size="sm" variant="neutral" onClick={() => change(UI_DEFAULTS)}>Reset to defaults</Button>
        </div>
      )}
    >
      {error && <Alert tone="error">{error}</Alert>}
      {[...groups].map(([group, options]) => (
        <section key={group} className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{group}</h3>
          {group === 'Colors' && (
            <button type="button" onClick={() => setPresetsOpen(true)} aria-haspopup="dialog" className="flex h-12 w-full items-center gap-3 rounded-xl border border-line-strong bg-surface px-3 text-left outline-none hover:bg-surface-2 focus-visible:ring-4 focus-visible:ring-ring">
              <Icon name="sliders" className="size-5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">Theme presets</span><span className="block truncate text-xs text-muted">{UI_PRESETS.find((p) => matchesPreset(p, ui))?.label ?? 'Custom colours'} · browse {UI_PRESETS.length} looks</span></span>
              <Icon name="chevron-right" className="size-4 shrink-0 text-muted" />
            </button>
          )}
          {options.filter((o) => !o.afterTheme).map(control)}
          {group === 'Colors' && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-ink">Accent colour</p>
              <ThemePicker columns="grid-cols-2" />
            </div>
          )}
          {options.filter((o) => o.afterTheme).map(control)}
        </section>
      ))}
      <ThemePresetsSheet open={presetsOpen} onClose={() => setPresetsOpen(false)} />
    </Sheet>
  );
}
