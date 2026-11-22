import { ActivitySection } from './security/ActivitySection.jsx';
import { ChangePasswordSection } from './security/ChangePasswordSection.jsx';
import { SessionsSection } from './security/SessionsSection.jsx';
import { TwoFactorSection } from './security/TwoFactorSection.jsx';

export default function SecurityPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <ChangePasswordSection />
      <TwoFactorSection />
      <SessionsSection />
      <ActivitySection />
    </div>
  );
}
