import { DateField, SelectField } from '../../components/forms/fields.jsx';
import { TIME_OPTIONS } from '../../lib/meetingTime.js';

/** The "when" of a meeting: a date and a time (every 15 minutes), bound to the surrounding form's `date` and `time` fields. */
export const MeetingFields = () => (
  <div className="grid gap-4 sm:grid-cols-2">
    <DateField name="date" label="Date" />
    <SelectField name="time" label="Time" options={TIME_OPTIONS} />
  </div>
);
