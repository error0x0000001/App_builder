import { Section } from '../../../components/ui/Card.jsx';
import { ThemePicker } from '../../../components/tenant/ThemePicker.jsx';

export default function ThemesPage() {
  return (
    <Section title="Theme" description="The colour theme for everyone in this tenant. Light and dark mode stay a personal choice.">
      <ThemePicker />
    </Section>
  );
}
