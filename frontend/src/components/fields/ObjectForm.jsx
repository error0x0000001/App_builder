import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { objectsApi } from '../../api/endpoints.js';
import { Alert } from '../ui/Alert.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { FieldRenderer } from './FieldRenderer.jsx';

const useDebounced = (value, ms) => { const [v, setV] = useState(value); useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]); return v; };

/**
 * All the fields of an object as a form. It keeps what was typed, asks the server to resolve every field for those values
 * (POST /objects/:id/evaluate) and renders the answer. It contains no rules of its own.
 */
export function ObjectForm({ objectId, mode = 'create', as, onResult }) {
  const object = useQuery({ queryKey: ['object', objectId], queryFn: () => objectsApi.get(objectId) });
  const [values, setValues] = useState({});
  const [original, setOriginal] = useState({});
  const [touched, setTouched] = useState(new Set());
  const [checked, setChecked] = useState(false);
  useEffect(() => { setOriginal(mode === 'edit' ? values : {}); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const body = useDebounced(useMemo(() => ({ values, original: mode === 'edit' ? original : undefined, context: { mode, device: 'desktop' }, as }), [values, original, mode, as]), 250);
  const result = useQuery({ queryKey: ['evaluate', objectId, JSON.stringify(body)], queryFn: () => objectsApi.evaluate(objectId, body), placeholderData: keepPreviousData, enabled: Boolean(object.data) });
  useEffect(() => { if (result.data) onResult?.(result.data); }, [result.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (object.isPending) return <div className="grid place-items-center py-10"><Spinner className="size-5" /></div>;
  if (object.isError) return <Alert tone="error">{object.error.message}</Alert>;
  const fields = object.data.fields.filter((f) => f.active);
  const sections = [...new Set(fields.map((f) => f.section || ''))];
  const state = result.data?.fields ?? {};
  return (
    <div className="space-y-5">
      {result.data?.recordErrors?.map((e) => <Alert key={e.code} tone="error">{e.message}</Alert>)}
      {fields.length === 0 && <p className="text-sm text-muted">This object has no fields yet.</p>}
      {sections.map((section) => (
        <div key={section} className="space-y-4">
          {section && <h3 className="border-b border-line pb-1 text-sm font-semibold text-ink">{section}</h3>}
          {fields.filter((f) => (f.section || '') === section).map((f) => state[f.key]?.visible === false ? null : (
            <FieldRenderer key={f.id} field={f} objectId={objectId} state={state[f.key]} value={values[f.key]} showErrors={checked || touched.has(f.key)} parentValues={values} context={{ mode }}
              onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} onBlur={() => setTouched((t) => new Set(t).add(f.key))} />
          ))}
        </div>
      ))}
      {fields.length > 0 && (
        <div className="flex items-center gap-3 border-t border-line pt-3 text-sm">
          <button type="button" onClick={() => setChecked(true)} className="font-semibold text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">Check all fields</button>
          <span className={result.data?.valid ? 'text-success' : 'text-muted'}>{result.data ? (result.data.valid ? 'Everything is valid' : 'Some fields need attention') : 'Checking…'}</span>
        </div>
      )}
    </div>
  );
}
