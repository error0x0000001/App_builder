import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { businessHoursBetween, parseHoliday, parseHoursConfig } from '../src/modules/automation/businessHours.js';

const cfg = parseHoursConfig({ time_zone: 'UTC' }); // Mon–Fri 09:00–17:00
const at = (s) => new Date(s);

describe('business hours', () => {
  it('counts only working hours across a weekend', () => {
    // Fri 16:00 → Mon 10:00 = 1h on Friday + 1h on Monday
    assert.equal(businessHoursBetween(at('2026-11-20T16:00:00Z'), at('2026-11-23T10:00:00Z'), cfg), 2);
    assert.equal(businessHoursBetween(at('2026-11-21T10:00:00Z'), at('2026-11-22T20:00:00Z'), cfg), 0, 'a weekend is zero');
    assert.equal(businessHoursBetween(at('2026-11-23T00:00:00Z'), at('2026-11-23T23:59:00Z'), cfg), 8, 'a full working day is 8h');
  });
  it('skips holidays, one-off and recurring', () => {
    const oneOff = [parseHoliday({ date: '11/23/2026', recurring: 'No' })];
    assert.equal(businessHoursBetween(at('2026-11-20T16:00:00Z'), at('2026-11-23T10:00:00Z'), cfg, oneOff), 1);
    const recurring = [parseHoliday({ date: '11/23/2020', recurring: 'Yes' })];
    assert.equal(businessHoursBetween(at('2026-11-20T16:00:00Z'), at('2026-11-23T10:00:00Z'), cfg, recurring), 1);
    assert.equal(businessHoursBetween(at('2026-11-20T16:00:00Z'), at('2026-11-23T10:00:00Z'), cfg, [parseHoliday({ date: '11/23/2020', recurring: 'No' })]), 2, 'a one-off holiday from another year is ignored');
  });
  it('respects the time zone', () => {
    const la = parseHoursConfig({ time_zone: 'America/Los_Angeles' }); // UTC-8 in November: 09:00 PT = 17:00Z
    assert.equal(businessHoursBetween(at('2026-11-25T16:00:00Z'), at('2026-11-25T19:00:00Z'), la), 2, '08:00–11:00 PT = 2 working hours');
    const india = parseHoursConfig({ time_zone: 'Asia/Kolkata', start_time: '10:00', end_time: '18:00', working_days: 'Mon,Tue,Wed,Thu,Fri' });
    assert.equal(businessHoursBetween(at('2026-11-23T04:30:00Z'), at('2026-11-23T08:30:00Z'), india), 4, '10:00–14:00 IST');
  });
});
