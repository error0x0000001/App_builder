import { Section } from '../../../components/ui/Card.jsx';
import { ThemePicker } from '../../../components/workspace/ThemePicker.jsx';

export default function ThemesPage() {
  return (
    <Section title="Theme" description="The colour theme for everyone in this workspace. Light and dark mode stay a personal choice.">
      <ThemePicker />
    </Section>
  );
}
