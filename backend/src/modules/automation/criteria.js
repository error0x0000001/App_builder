import { fieldKey } from '@app/shared';

const num = (v) => (v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : null);

/** Evaluates one rule's criteria (field / operator / value) against record data. No field = matches every record. */
export function matchesCriteria(rule, data) {
  const field = rule.data.criteria_field;
  if (!field) return true;
  const actual = data[fieldKey(field)];
  const op = rule.data.criteria_operator || 'equals';
  const wanted = rule.data.criteria_value ?? '';
  const a = actual == null ? '' : String(actual).toLowerCase();
  const w = String(wanted).toLowerCase();
  switch (op) {
    case 'equals': return a === w;
    case 'not equals': return a !== w;
    case 'contains': return a.includes(w);
    case 'starts with': return a.startsWith(w);
    case 'greater than': return num(actual) !== null && num(wanted) !== null && num(actual) > num(wanted);
    case 'less than': return num(actual) !== null && num(wanted) !== null && num(actual) < num(wanted);
    case 'is blank': return a === '';
    default: return false;
  }
}
