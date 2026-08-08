import { describe, expect, it } from 'vitest';

import {
  addCalendarPeriod,
  localDateTimeParts,
  reminderDeliveryTime,
  reminderOccurrenceAt,
  zonedDateTimeToUtc,
} from '../src/reminder-schedule.js';

describe('reminder scheduling', () => {
  it('preserves calendar anchors instead of drifting after a short month', () => {
    expect(addCalendarPeriod('2028-01-31', 'month', 1)).toBe('2028-02-29');
    expect(addCalendarPeriod('2028-01-31', 'month', 2)).toBe('2028-03-31');
    expect(addCalendarPeriod('2028-02-29', 'year', 1)).toBe('2029-02-28');
    expect(addCalendarPeriod('2028-02-29', 'year', 4)).toBe('2032-02-29');
  });

  it('converts application-local dates into precise UTC instants', () => {
    const instant = zonedDateTimeToUtc('2026-08-06', '09:30', 'Asia/Shanghai');
    expect(instant.toISOString()).toBe('2026-08-06T01:30:00.000Z');
    expect(localDateTimeParts(instant, 'Asia/Shanghai')).toEqual({
      date: '2026-08-06',
      time: '09:30',
    });
  });

  it('keeps recurring local wall time across daylight-saving offsets', () => {
    const schedule = {
      anchorDate: '2026-02-08',
      anchorTime: '09:00',
      timeZone: 'America/New_York',
      recurrenceKind: 'recurring' as const,
      frequency: 'month' as const,
      recurrenceInterval: 1,
      endsOn: '2026-04-08',
      occurrenceLimit: null,
    };

    expect(reminderOccurrenceAt(schedule, 0)?.toISOString()).toBe(
      '2026-02-08T14:00:00.000Z',
    );
    expect(reminderOccurrenceAt(schedule, 1)?.toISOString()).toBe(
      '2026-03-08T13:00:00.000Z',
    );
    expect(reminderOccurrenceAt(schedule, 2)?.toISOString()).toBe(
      '2026-04-08T13:00:00.000Z',
    );
    expect(reminderOccurrenceAt(schedule, 3)).toBeNull();
  });

  it('rejects local times skipped by daylight-saving changes', () => {
    expect(() => zonedDateTimeToUtc('2026-03-08', '02:30', 'America/New_York')).toThrow(
      /does not exist/u,
    );
  });

  it('honors occurrence limits and computes lead delivery instants', () => {
    const schedule = {
      anchorDate: '2026-08-01',
      anchorTime: '10:00',
      timeZone: 'Asia/Shanghai',
      recurrenceKind: 'recurring' as const,
      frequency: 'week' as const,
      recurrenceInterval: 2,
      endsOn: null,
      occurrenceLimit: 2,
    };
    const second = reminderOccurrenceAt(schedule, 1);
    expect(second?.toISOString()).toBe('2026-08-15T02:00:00.000Z');
    expect(reminderOccurrenceAt(schedule, 2)).toBeNull();
    expect(reminderDeliveryTime(second as Date, 1_440).toISOString()).toBe(
      '2026-08-14T02:00:00.000Z',
    );
  });
});
