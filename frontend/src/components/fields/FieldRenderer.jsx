import { objectsApi } from '../../api/endpoints.js';
import { ColorPicker } from '../ui/ColorPicker.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';
import { Icon } from '../ui/Icon.jsx';
import { Input } from '../ui/Input.jsx';
import { PasswordInput } from '../ui/PasswordInput.jsx';
import { Select } from '../ui/Select.jsx';
import { Switch } from '../ui/Switch.jsx';
import { Textarea } from '../ui/Textarea.jsx';
import { FormField } from '../ui/FormField.jsx';
import { LineItemsGrid } from './LineItemsGrid.jsx';
import { RemotePicker } from './pickers.jsx';
import { Checklist, Rating, RichTextEditor, SignaturePad, Slider, StatusPath, TimerField, UploadField } from './widgets.jsx';

const blank = (v) => v === null || v === undefined;
const text = (v) => (blank(v) ? '' : String(v));
const numberOrBlank = (raw) => (raw === '' ? undefined : Number(raw));

/**
 * Renders ONE field from its definition and the state the server resolved for it. It decides nothing: visibility, required, read-only,
 * options and errors all arrive in `state`; changes go out through `onChange`. Booleans are always switches; there are no browser controls.
 *
 *   field   – the definition (GET /objects/:id)      state – this field's entry from POST /objects/:id/evaluate
 *   value   – what the person typed                  objectId – for server-side option search
 */
export function FieldRenderer({ field, state = {}, value, onChange, onBlur, objectId, showErrors = false, compact = false, parentValues, context }) {
  const s = field.settings ?? {};
  const shown = state.computed || state.autofilled === 'rule' ? state.value : blank(value) ? state.value : value;
  const disabled = Boolean(state.readOnly);
  const error = showErrors && state.errors?.length ? state.errors[0].message : undefined;
  const hint = compact ? undefined : [field.helpText, ...(state.messages ?? [])].filter(Boolean).join(' · ') || undefined;
  const required = Boolean(state.required);
  const label = compact ? undefined : (field.encrypted ? <span className="inline-flex items-center gap-1.5">{field.label}<Icon name="lock" className="size-3.5" /></span> : field.label);
  const common = { id: `f-${field.id}`, label, hint, error, required, disabled, onBlur };
  const set = (v) => onChange?.(v);
  const options = (field.type === 'picklist' ? (s.values ?? []).filter((v) => v.active !== false).map((v) => ({ value: v.value, label: v.label })) : []).filter((o) => !state.options || state.options.includes(o.value));
  const load = (q) => objectsApi.options(objectId, field.id, { q, limit: 20 });
  const wrap = (node) => <FormField id={common.id} label={label} hint={hint} error={error} required={required}>{node}</FormField>;

  switch (field.type) {
    case 'text': case 'barcode': return <Input {...common} value={text(shown)} maxLength={s.maxLength} onChange={(e) => set(e.target.value)} prefix={field.type === 'barcode' ? <Icon name="qr-code" className="size-4" /> : undefined} />;
    case 'email': return <Input {...common} type="email" inputMode="email" value={text(shown)} onChange={(e) => set(e.target.value)} prefix={<Icon name="mail" className="size-4" />} />;
    case 'phone': return <Input {...common} type="tel" inputMode="tel" placeholder={s.format} value={text(shown)} onChange={(e) => set(e.target.value)} prefix={<Icon name="phone" className="size-4" />} />;
    case 'url': return <Input {...common} inputMode="url" placeholder="https://" value={text(shown)} onChange={(e) => set(e.target.value)} prefix={<Icon name="link" className="size-4" />} />;
    case 'ip_address': return <Input {...common} inputMode="text" value={text(shown)} onChange={(e) => set(e.target.value)} prefix={<Icon name="globe" className="size-4" />} />;
    case 'long_text': return <Textarea {...common} rows={s.rows ?? 4} maxLength={s.maxLength} value={text(shown)} onChange={(e) => set(e.target.value)} />;
    case 'html': return (
      <div className="space-y-2">
        <Textarea {...common} rows={6} className="font-mono text-xs" value={text(shown)} onChange={(e) => set(e.target.value)} />
        {s.mode === 'display' && shown && <iframe title={`${field.label} preview`} sandbox="" srcDoc={String(shown)} className="h-32 w-full rounded-(--ctl-r) border border-line bg-white" />}
      </div>
    );
    case 'rich_text': return wrap(<RichTextEditor label={field.label} value={text(shown)} formats={s.formats ?? []} disabled={disabled} invalid={Boolean(error)} onChange={set} />);
    case 'number': case 'decimal': return <Input {...common} inputMode={field.type === 'number' ? 'numeric' : 'decimal'} value={text(shown)} onChange={(e) => set(e.target.value)} />;
    case 'percent': return <Input {...common} inputMode="decimal" suffix={<span>%</span>} value={text(shown)} onChange={(e) => set(e.target.value)} />;
    case 'currency': return <Input {...common} inputMode="decimal" prefix={<span className="text-xs font-semibold">{s.currencyCode ?? 'USD'}</span>} value={text(shown)} onChange={(e) => set(e.target.value)} />;
    case 'checkbox': return <Switch id={common.id} label={compact ? '' : field.label} description={hint} checked={Boolean(shown)} disabled={disabled} onChange={(e) => set(e.target.checked)} />;
    case 'date': return <DatePicker {...common} value={text(shown)} onChange={set} />;
    case 'date_time': {
      const [d = '', t = ''] = text(shown).split('T');
      const join = (date, time) => (date ? `${date}T${time || '00:00'}:00` : '');
      return wrap(<div className="grid grid-cols-[1fr_7rem] gap-2"><DatePicker id={common.id} disabled={disabled} value={d} onChange={(v) => set(join(v, t.slice(0, 5)))} /><Input aria-label={`${field.label} time`} placeholder="HH:MM" disabled={disabled} value={t.slice(0, 5)} onChange={(e) => set(join(d, e.target.value))} /></div>);
    }
    case 'time': return <Input {...common} placeholder="HH:MM" value={text(shown)} onChange={(e) => set(e.target.value)} prefix={<Icon name="clock" className="size-4" />} />;
    case 'duration': return <Input {...common} inputMode="numeric" suffix={<span>{s.unit ?? 'hours'}</span>} value={text(shown)} onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))} />;
    case 'picklist': return <Select {...common} options={options} placeholder="Select…" value={text(shown)} onChange={set} />;
    case 'multi_picklist': case 'tags': case 'many_to_many': case 'user': case 'lookup': case 'master_detail':
      return <RemotePicker {...common} cacheKey={`${objectId}:${field.id}`} load={load} multiple={['multi_picklist', 'tags', 'many_to_many'].includes(field.type)} allowFree={field.type === 'tags' && s.freeEntry !== false} value={shown} onChange={set} placeholder={field.type === 'user' ? 'Choose a person' : 'Select…'} />;
    case 'polymorphic': return wrap(<div className="grid grid-cols-[10rem_1fr] gap-2"><Select aria-label="Object" options={s.targets ?? []} placeholder="Object" value={shown?.object ?? ''} disabled={disabled} onChange={(o) => set({ object: o, id: undefined })} /><Input aria-label="Record id" placeholder="Record" disabled value={text(shown?.id)} /></div>);
    case 'status_path': return wrap(<StatusPath stages={(s.stages ?? []).filter((x) => !state.options || state.options.includes(x.value))} value={shown} disabled={disabled} onChange={set} />);
    case 'rating': return wrap(<Rating label={field.label} value={shown} scale={Number(s.scale ?? 5)} icon={s.icon} disabled={disabled} onChange={set} />);
    case 'slider': return wrap(<Slider label={field.label} value={shown} min={s.min} max={s.max} step={s.step} unit={s.unit} disabled={disabled} onChange={set} />);
    case 'colour': return wrap(<ColorPicker label={field.label} value={shown || null} presets={s.presets?.length ? s.presets : undefined} onChange={set} />);
    case 'checklist': return wrap(<Checklist value={shown} disabled={disabled} allowReorder={s.allowReorder} showProgress={s.showProgress} onChange={set} />);
    case 'timer': return wrap(<TimerField value={shown} disabled={disabled} allowManual={s.allowManual} onChange={set} />);
    case 'file': return wrap(<UploadField label={field.label} value={shown} multiple={Boolean(s.multiple)} accept={s.allowedTypes?.map((t) => (t.includes('/') ? t : `.${t.replace(/^\./, '')}`)).join(',')} disabled={disabled} onChange={set} />);
    case 'photo': return wrap(<UploadField label={field.label} value={shown} accept="image/*" disabled={disabled} onChange={set} />);
    case 'signature': return wrap(<SignaturePad value={shown} disabled={disabled} onChange={set} />);
    case 'password': return <PasswordInput {...common} autoComplete="off" value={text(shown)} onChange={(e) => set(e.target.value)} />;
    case 'address': {
      const a = shown ?? {}; const part = (k) => (e) => set({ ...a, [k]: e.target.value });
      return wrap(<div className="grid grid-cols-2 gap-2"><Input aria-label="Street" placeholder="Street" className="col-span-2" disabled={disabled} value={text(a.street)} onChange={part('street')} /><Input aria-label="City" placeholder="City" disabled={disabled} value={text(a.city)} onChange={part('city')} /><Input aria-label="State" placeholder="State" disabled={disabled} value={text(a.state)} onChange={part('state')} /><Input aria-label="Postal code" placeholder="Postal code" disabled={disabled} value={text(a.postal)} onChange={part('postal')} /><Input aria-label="Country" placeholder="Country" disabled={disabled} value={text(a.country)} onChange={part('country')} /></div>);
    }
    case 'location': {
      const l = shown ?? {};
      return wrap(<div className="grid grid-cols-2 gap-2"><Input aria-label="Latitude" placeholder="Latitude" inputMode="decimal" disabled={disabled} value={text(l.lat)} onChange={(e) => set({ ...l, lat: numberOrBlank(e.target.value) })} /><Input aria-label="Longitude" placeholder="Longitude" inputMode="decimal" disabled={disabled} value={text(l.lng)} onChange={(e) => set({ ...l, lng: numberOrBlank(e.target.value) })} /></div>);
    }
    case 'line_items': return wrap(<LineItemsGrid field={field} value={shown} disabled={disabled} onChange={set} parentValues={parentValues} context={context} />);
    case 'formula': case 'rollup': case 'auto_number': return <Input {...common} readOnly disabled value={text(shown)} prefix={<Icon name="lock" className="size-4" />} />;
    default: return <Input {...common} value={text(shown)} onChange={(e) => set(e.target.value)} />;
  }
}
