import { useSearchParams } from 'react-router-dom';
import { Tabs } from '../../../components/ui/Tabs.jsx';
import SetupListPage from '../SetupListPage.jsx';
import SetupFormPage from '../SetupFormPage.jsx';
import { StatusBanner } from '../StatusBanner.jsx';
import { useSetupPage } from '../useSetupPage.js';

const TABS = [{ id: 'users', label: 'Users', icon: 'users' }, { id: 'settings', label: 'Settings', icon: 'sliders' }];

/** Users and User Management Settings are one thing: the people, and the switches that govern how they are managed. The tab lives in the URL (?tab=settings). */
export default function UsersPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'settings' ? 'settings' : 'users';
  const settings = useSetupPage('user-management-settings');
  const choose = (id) => setParams((p) => { const next = new URLSearchParams(p); if (id === 'settings') next.set('tab', 'settings'); else next.delete('tab'); return next; }, { replace: true });
  return (
    <div className="space-y-4">
      <Tabs tabs={TABS} value={tab} onChange={choose} label="Users" />
      {tab === 'users' ? <SetupListPage pageKey="users" embedded /> : (
        <>
          <StatusBanner status={settings.data?.status} />
          <SetupFormPage pageKey="user-management-settings" />
        </>
      )}
    </div>
  );
}
