import { Alert } from '../../components/ui/Alert.jsx';

const COPY = {
  stored: ['Saved, but not used yet', 'These values are saved, versioned and audited, but no feature in Quelli reads them yet.'],
  recorded: ['Recorded only', 'Requests here are logged. The tool behind this page is not built, so nothing else happens.'],
  external: ['External product', 'This page configures a product Quelli does not include. Requests are logged; nothing else happens.'],
  notEnabled: ['Not enabled', 'The feature behind this dashboard does not exist in Quelli.'],
};

/** Says plainly when a page is configuration-only, so no page can look more capable than it is. `partial` pages list what is still stored-only. */
export function StatusBanner({ status }) {
  if (!status) return null;
  if (status.level === 'partial') return <Alert tone="info" title="Partly enforced">{status.note}</Alert>;
  const copy = COPY[status.level];
  return copy ? <Alert tone="warning" title={copy[0]}>{copy[1]}</Alert> : null;
}
