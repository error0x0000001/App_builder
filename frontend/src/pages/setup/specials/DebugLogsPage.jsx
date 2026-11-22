import { useState } from 'react';
import { Tabs } from '../../../components/ui/Tabs.jsx';
import SetupListPage from '../SetupListPage.jsx';

const TABS = [{ id: 'debug-log-entries', label: 'Debug logs' }, { id: 'debug-trace-flags', label: 'Trace flags' }];

/** Two lists on one page: captured logs (read-only, can be very large → keyset paged) and the trace flags that control capture. */
export default function DebugLogsPage() {
  const [tab, setTab] = useState(TABS[0].id);
  return (
    <div className="space-y-4">
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Debug logs" />
      <SetupListPage key={tab} pageKey={tab} embedded />
    </div>
  );
}
