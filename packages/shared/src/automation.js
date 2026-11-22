/**
 * Rule collections the engine executes. Each is a normal Setup list; these extra fields (stored in the record's data)
 * are what make a rule do something. A rule without its action fields is inert and ignored.
 */
export const OPERATORS = Object.freeze(['equals', 'not equals', 'contains', 'starts with', 'greater than', 'less than', 'is blank']);
const f = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
const CRITERIA = [f('criteria_field', 'When field (leave empty = every record)'), f('criteria_operator', 'Operator', 'select', { options: OPERATORS }), f('criteria_value', 'Value')];
const WORKFLOW = [
  ...CRITERIA,
  f('action_type', 'Then', 'select', { options: ['Field update', 'Email alert', 'Create task'] }),
  f('action_field', 'Field to update / email recipient (address or field)'),
  f('action_value', 'New value / message / task subject'),
];
const ACTIVE = (key) => ({ key, value: 'Active' });

export const RULE_COLLECTIONS = Object.freeze({
  'workflow-rules': { kind: 'workflow', objectColumn: 'object', active: ACTIVE('active'), fields: WORKFLOW, triggerColumn: 'evaluation_criteria' },
  'process-builder': { kind: 'workflow', objectColumn: 'object', active: ACTIVE('status'), fields: WORKFLOW },
  flows: { kind: 'workflow', objectColumn: 'object', active: ACTIVE('status'), fields: [f('object', 'Object'), ...WORKFLOW] },
  'lead-assignment-rules': { kind: 'assignment', object: 'Lead', active: ACTIVE('active'), fields: [...CRITERIA, f('assign_to', 'Assign to (member email)')] },
  'case-assignment-rules': { kind: 'assignment', object: 'Case', active: ACTIVE('active'), fields: [...CRITERIA, f('assign_to', 'Assign to (member email)')] },
  'lead-auto-response-rules': { kind: 'autoResponse', object: 'Lead', active: ACTIVE('active'), fields: [...CRITERIA, f('email_subject', 'Email subject'), f('email_body', 'Email body', 'textarea')] },
  'case-auto-response-rules': { kind: 'autoResponse', object: 'Case', active: ACTIVE('active'), fields: [...CRITERIA, f('email_subject', 'Email subject'), f('email_body', 'Email body', 'textarea')] },
  'matching-rules': { kind: 'matching', objectColumn: 'object', active: ACTIVE('status'), fields: [f('match_field', 'Records match when this field is equal')] },
  'duplicate-rules': { kind: 'duplicate', objectColumn: 'object', active: ACTIVE('status'), fields: [f('match_field', 'Match field (or leave empty to use the matching rule)'), f('duplicate_action', 'When a duplicate is found', 'select', { options: ['Block', 'Alert'] })] },
  'approval-processes': { kind: 'approval', objectColumn: 'object', active: ACTIVE('status'), fields: [...CRITERIA, f('approver', 'Approver (member email)')] },
  'escalation-rules': { kind: 'escalation', object: 'Case', active: ACTIVE('active'), fields: [...CRITERIA, f('escalate_after_hours', 'Escalate after (hours open)'), f('assign_to', 'Escalate to (member email)')] },
});

/** Non-rule collections that carry extra fields the platform reads. */
const OTHER_EXTRAS = {
  'business-hours': [f('start_time', 'Opens (HH:MM, 24 h)'), f('end_time', 'Closes (HH:MM, 24 h)'), f('working_days', 'Working days (e.g. Mon,Tue,Wed,Thu,Fri)')],
};

export const ruleExtraFields = (collectionKey) => RULE_COLLECTIONS[collectionKey]?.fields ?? OTHER_EXTRAS[collectionKey] ?? [];
