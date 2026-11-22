import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Section } from '../../../components/ui/Card.jsx';
import SetupListPage from '../SetupListPage.jsx';

/** Object Manager / Schema Builder: objects on top; pick one to manage its fields (fields are children of the object record). */
export default function ObjectManagerPage() {
  const [object, setObject] = useState(null);
  return (
    <div className="space-y-5">
      <SetupListPage pageKey="object-manager-objects" embedded onOpen={(row) => setObject(row)} />
      {object ? (
        <Section
          title={`${object.label} — fields`}
          action={<Button size="sm" variant="ghost" onClick={() => setObject(null)}>Close</Button>}
        >
          <SetupListPage key={object.id} pageKey="object-manager-fields" embedded parentId={object.id} createDefaults={{ object: object.label }} />
        </Section>
      ) : <Alert tone="info">Select an object to see and edit its fields.</Alert>}
    </div>
  );
}
