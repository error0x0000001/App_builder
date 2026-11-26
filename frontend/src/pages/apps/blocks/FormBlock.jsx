import { ObjectForm } from '../../../components/fields/ObjectForm.jsx';
import { BlockFrame } from './BlockFrame.jsx';

/** A form (or a filter form): the object's fields, resolved by the server as you type. */
export default function FormBlock({ block, onSettings }) {
  const s = block.settings; const keys = block.fields.map((f) => f.fieldKey);
  if (!block.object) return <BlockFrame block={block} onSettings={onSettings}><p className="text-sm text-muted">Choose an object for this form in its settings.</p></BlockFrame>;
  return (
    <BlockFrame block={block} onSettings={onSettings} footerActions>
      {keys.length === 0 ? <p className="text-sm text-muted">Choose the fields to show in the settings.</p>
        : <ObjectForm objectId={block.object.id} mode={block.kind === 'form' ? (s.mode ?? 'create') : 'create'} fieldKeys={keys} columns={block.kind === 'filter' ? Math.min(keys.length, 3) : (s.columns ?? 1)} footer={false} />}
    </BlockFrame>
  );
}
