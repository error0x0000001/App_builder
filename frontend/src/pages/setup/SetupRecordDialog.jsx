import { recordFormFields, recordFormSchema } from '@app/shared';
import { useQueryClient } from '@tanstack/react-query';
import { setupApi } from '../../api/endpoints.js';
import { invalidateSetupData } from './invalidate.js';
import { RecordDialog } from './RecordDialog.jsx';

/** Create / edit one Setup record. Fields and validation come from the shared definition, so the server enforces the same rules. */
export function SetupRecordDialog({ pageKey, collection, title, mode, record, defaults, parentId, onClose }) {
  const queryClient = useQueryClient();
  const save = async (values) => {
    if (mode === 'edit') await setupApi.updateRecord(pageKey, record.id, values);
    else await setupApi.createRecord(pageKey, parentId ? { ...values, parentId } : values);
    await invalidateSetupData(queryClient);
  };
  return <RecordDialog title={title} fields={recordFormFields(collection, mode)} schema={recordFormSchema(collection, mode)} values={mode === 'edit' ? record : defaults} onSubmit={save} onClose={onClose} />;
}
