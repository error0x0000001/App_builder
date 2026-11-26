import { useQuery } from '@tanstack/react-query';
import { objectsApi } from '../../../api/endpoints.js';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Input } from '../../../components/ui/Input.jsx';
import { Tag } from '../../../components/ui/Tag.jsx';
import { FormField } from '../../../components/ui/FormField.jsx';
import { useState } from 'react';
import { Icon } from '../../../components/ui/Icon.jsx';

/** Field-type registry, operators, effects… served by the backend; the whole configuration UI is generated from it. */
export const useObjectsMeta = () => useQuery({ queryKey: ['objects-meta'], queryFn: objectsApi.meta, staleTime: Infinity });

export const newId = () => Math.random().toString(36).slice(2, 10);

/** One list of readable problems from an API error (zod issues or { path: message }). */
export function errorLines(error) {
  const d = error?.details;
  if (Array.isArray(d)) return d.map((i) => `${i.field}: ${i.message}`);
  if (d && typeof d === 'object') return Object.values(d).map(String);
  return [error?.message ?? 'Something went wrong'];
}
export function ErrorBox({ error }) {
  if (!error) return null;
  const lines = errorLines(error);
  return <Alert tone="error">{lines.length === 1 ? lines[0] : <ul className="list-disc pl-4">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}</Alert>;
}

/** Type a value and press Enter (or comma) to add it as a tag. */
export function TagsInput({ label, hint, value = [], onChange, placeholder = 'Type and press Enter', disabled }) {
  const [text, setText] = useState('');
  const add = () => { const v = text.trim(); if (v && !value.includes(v)) onChange([...value, v]); setText(''); };
  return (
    <FormField id={undefined} label={label} hint={hint}>
      <div className="space-y-2">
        {value.length > 0 && <div className="flex flex-wrap gap-1.5">{value.map((v) => <Tag key={v} onClose={disabled ? undefined : () => onChange(value.filter((x) => x !== v))} closeLabel={`Remove ${v}`}>{v}</Tag>)}</div>}
        <Input aria-label={label ?? 'Add a value'} placeholder={placeholder} disabled={disabled} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} onBlur={add} />
      </div>
    </FormField>
  );
}

/** A section that opens and closes (our own — no browser disclosure element). */
export function Disclosure({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="text-sm">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded font-semibold text-link outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Icon name={open ? 'chevron-down' : 'chevron-right'} className="size-4" />{title}
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}
