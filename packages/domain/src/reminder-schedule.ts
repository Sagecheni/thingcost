export type ReminderFrequency = 'day' | 'week' | 'month' | 'year';

export interface ReminderSchedule {
  anchorDate: string;
  anchorTime: string;
  timeZone: string;
  recurrenceKind: 'once' | 'recurring';
  frequency: ReminderFrequency | null;
  recurrenceInterval: number | null;
  endsOn: string | null;
  occurrenceLimit: number | null;
}

export interface LocalDateTimeParts {
  date: string;
  time: string;
}

interface ParsedDate {
  year: number;
  month: number;
  day: number;
}

function parseDate(value: string): ParsedDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) throw new RangeError(`Invalid ISO date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid ISO date: ${value}`);
  }
  return { year, month, day };
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/u.exec(value);
  if (!match) throw new RangeError(`Invalid local time: ${value}`);
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addCalendarPeriod(
  anchorDate: string,
  frequency: ReminderFrequency,
  amount: number,
): string {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError('Calendar period amount must be a non-negative safe integer.');
  }
  const anchor = parseDate(anchorDate);

  if (frequency === 'day' || frequency === 'week') {
    const date = new Date(
      Date.UTC(
        anchor.year,
        anchor.month - 1,
        anchor.day + amount * (frequency === 'week' ? 7 : 1),
      ),
    );
    return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  if (frequency === 'month') {
    const zeroBasedMonth = anchor.month - 1 + amount;
    const year = anchor.year + Math.floor(zeroBasedMonth / 12);
    const month = ((zeroBasedMonth % 12) + 12) % 12;
    return formatDate(
      year,
      month + 1,
      Math.min(anchor.day, daysInMonth(year, month + 1)),
    );
  }

  const year = anchor.year + amount;
  return formatDate(
    year,
    anchor.month,
    Math.min(anchor.day, daysInMonth(year, anchor.month)),
  );
}

export function localDateTimeParts(instant: Date, timeZone: string): LocalDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = value('year');
  const month = value('month');
  const day = value('day');
  const hour = value('hour');
  const minute = value('minute');
  if (!year || !month || !day || !hour || !minute) {
    throw new RangeError(`Unable to resolve local time in ${timeZone}.`);
  }
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

export function zonedDateTimeToUtc(
  localDate: string,
  localTime: string,
  timeZone: string,
): Date {
  const date = parseDate(localDate);
  const time = parseTime(localTime);
  const targetAsUtc = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    time.hour,
    time.minute,
  );
  let guess = targetAsUtc;

  for (let index = 0; index < 5; index += 1) {
    const rendered = localDateTimeParts(new Date(guess), timeZone);
    const renderedDate = parseDate(rendered.date);
    const renderedTime = parseTime(rendered.time);
    const renderedAsUtc = Date.UTC(
      renderedDate.year,
      renderedDate.month - 1,
      renderedDate.day,
      renderedTime.hour,
      renderedTime.minute,
    );
    const correction = targetAsUtc - renderedAsUtc;
    if (correction === 0) {
      return new Date(guess);
    }
    guess += correction;
  }

  const finalParts = localDateTimeParts(new Date(guess), timeZone);
  if (finalParts.date !== localDate || finalParts.time !== localTime) {
    throw new RangeError(
      `Local time ${localDate} ${localTime} does not exist in ${timeZone}.`,
    );
  }
  return new Date(guess);
}

export function reminderOccurrenceAt(
  schedule: ReminderSchedule,
  sequence: number,
): Date | null {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new RangeError('Reminder sequence must be a non-negative safe integer.');
  }
  if (schedule.recurrenceKind === 'once' && sequence > 0) return null;
  if (schedule.occurrenceLimit !== null && sequence >= schedule.occurrenceLimit)
    return null;

  let localDate = schedule.anchorDate;
  if (sequence > 0) {
    if (schedule.frequency === null || schedule.recurrenceInterval === null) {
      throw new RangeError('Recurring reminders require a frequency and interval.');
    }
    localDate = addCalendarPeriod(
      schedule.anchorDate,
      schedule.frequency,
      schedule.recurrenceInterval * sequence,
    );
  }
  if (schedule.endsOn !== null && localDate > schedule.endsOn) return null;
  return zonedDateTimeToUtc(localDate, schedule.anchorTime, schedule.timeZone);
}

export function reminderDeliveryTime(dueAt: Date, leadMinutes: number): Date {
  if (!Number.isSafeInteger(leadMinutes) || leadMinutes < 0) {
    throw new RangeError('Lead minutes must be a non-negative safe integer.');
  }
  return new Date(dueAt.getTime() - leadMinutes * 60_000);
}
