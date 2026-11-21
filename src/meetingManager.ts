import * as vscode from 'vscode';
import { Meeting, RecurrenceByDay } from './types';
import { addZonedDays, createDateInTimeZone, getDaysInMonth, getZonedDateParts, normalizeTimeZone, ZonedDateParts } from './dateTime';
import { isValidTeamsUrl } from './urlValidator';

const STORAGE_KEY = 'meetdock-solo.meetings';
// Fallback duration when a meeting has no explicit endTime
const MEETING_DURATION_MS = 30 * 60 * 1000;
// Upper bound for the forward day-by-day scan in getNextOccurrence (used
// for daily, weekly and weekdays rules): about 10 years of candidate days.
// A rule that cannot produce an occurrence within this span is treated as
// having no next occurrence, instead of scanning the full 400-year
// Gregorian cycle day by day and blocking the extension host.
const MAX_OCCURRENCE_SCAN_DAYS = 366 * 10;
// Upper bound for the period-by-period search used for monthly and yearly
// rules: one full 400-year Gregorian cycle. The calendar pattern repeats
// every 400 years, so a rule with no occurrence within a full cycle (e.g.
// an unreachable BYMONTH/BYMONTHDAY combination such as February 31) can
// never produce one. Enumerating each period's candidate days directly
// keeps the work proportional to the number of periods while still
// reaching long-interval occurrences (e.g. a yearly rule with interval 11)
// that fall outside the day-by-day scan span above.
const MAX_OCCURRENCE_SCAN_YEARS = 400;
const VALID_RECURRENCE_TYPES = new Set(['once', 'daily', 'weekly', 'weekdays', 'monthly', 'yearly']);
// Bounds applied when reading meetings back from storage. Stored data can
// be corrupted or hand-edited, and the periodic timer re-reads it on every
// tick, so values outside the ranges the parsers and UI can produce are
// treated as corrupt and the item is dropped instead of being allowed to
// throw (e.g. an invalid timeZone makes Intl.DateTimeFormat raise a
// RangeError) or to drive unbounded recurrence work.
const MAX_STORED_TITLE_LENGTH = 1000;
const MAX_STORED_RECURRENCE_INTERVAL = 1000;

function isValidIsoDateString(val: unknown): val is string {
  if (typeof val !== 'string') {
    return false;
  }
  const date = new Date(val);
  return !isNaN(date.getTime()) && date.toISOString() === val;
}

function isIntInRange(val: unknown, min: number, max: number): val is number {
  return typeof val === 'number' && Number.isInteger(val) && val >= min && val <= max;
}

function isValidStoredTimeZone(val: unknown): boolean {
  return val === undefined || (typeof val === 'string' && normalizeTimeZone(val) !== undefined);
}

function isValidIntArray(val: unknown, min: number, max: number, maxLength: number, excludeZero = false): boolean {
  return val === undefined || (
    Array.isArray(val) &&
    val.length <= maxLength &&
    val.every(n => isIntInRange(n, min, max) && (!excludeZero || n !== 0))
  );
}

function isValidRecurrenceByDay(val: unknown): boolean {
  return val === undefined || (
    Array.isArray(val) &&
    val.length <= 14 &&
    val.every(entry =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      isIntInRange((entry as RecurrenceByDay).day, 0, 6) &&
      ((entry as RecurrenceByDay).setpos === undefined || isIntInRange((entry as RecurrenceByDay).setpos, -366, 366))
    )
  );
}

/**
 * Returns the effective end time of a meeting.
 * Uses meeting.endTime if present; otherwise falls back to startTime + 30 minutes.
 */
function getMeetingEndTime(meeting: Meeting): Date {
  if (meeting.endTime) {
    return new Date(meeting.endTime);
  }
  return new Date(new Date(meeting.startTime).getTime() + MEETING_DURATION_MS);
}

function getCalendarDayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month, day) / (24 * 60 * 60 * 1000));
}

function resolveMonthDay(value: number, daysInMonth: number): number | undefined {
  const day = value > 0 ? value : daysInMonth + value + 1;
  return day >= 1 && day <= daysInMonth ? day : undefined;
}

function getOrdinalWeekday(year: number, month: number, weekday: number, position: number): number | undefined {
  const daysInMonth = getDaysInMonth(year, month);
  if (position > 0) {
    const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const day = 1 + ((weekday - firstWeekday + 7) % 7) + (position - 1) * 7;
    return day <= daysInMonth ? day : undefined;
  }
  if (position < 0) {
    const lastWeekday = new Date(Date.UTC(year, month, daysInMonth)).getUTCDay();
    const day = daysInMonth - ((lastWeekday - weekday + 7) % 7) + (position + 1) * 7;
    return day >= 1 ? day : undefined;
  }
  return undefined;
}

function applySetPositions<T>(values: T[], positions: number[] | undefined): T[] {
  if (!positions || positions.length === 0) {
    return values;
  }
  const selected: T[] = [];
  for (const position of positions) {
    const index = position > 0 ? position - 1 : values.length + position;
    if (index >= 0 && index < values.length) {
      selected.push(values[index]);
    }
  }
  return selected;
}

function matchesByDay(year: number, month: number, day: number, rules: RecurrenceByDay[]): boolean {
  const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
  return rules.some(rule => {
    if (rule.day !== weekday) {
      return false;
    }
    return rule.setpos === undefined || getOrdinalWeekday(year, month, rule.day, rule.setpos) === day;
  });
}

function getMonthCandidateDays(
  meeting: Meeting,
  year: number,
  month: number,
  defaultDay: number,
  applyBySetPos: boolean
): number[] {
  const daysInMonth = getDaysInMonth(year, month);
  const byMonthDay = meeting.recurrenceByMonthDay;
  const byDay = meeting.recurrenceByDay;
  let days: number[];

  if (byMonthDay && byMonthDay.length > 0) {
    days = byMonthDay
      .map(value => resolveMonthDay(value, daysInMonth))
      .filter((value): value is number => value !== undefined);
  } else if (byDay && byDay.length > 0) {
    days = [];
    for (const rule of byDay) {
      if (rule.setpos !== undefined) {
        const day = getOrdinalWeekday(year, month, rule.day, rule.setpos);
        if (day !== undefined) {
          days.push(day);
        }
      } else {
        for (let day = 1; day <= daysInMonth; day++) {
          if (new Date(Date.UTC(year, month, day)).getUTCDay() === rule.day) {
            days.push(day);
          }
        }
      }
    }
  } else {
    // Preserve MeetDock's existing behavior for a DTSTART day that is absent in a shorter month.
    days = [Math.min(defaultDay, daysInMonth)];
  }

  if (byMonthDay && byMonthDay.length > 0 && byDay && byDay.length > 0) {
    days = days.filter(day => matchesByDay(year, month, day, byDay));
  }

  const sortedDays = [...new Set(days)].sort((a, b) => a - b);
  return applyBySetPos
    ? applySetPositions(sortedDays, meeting.recurrenceBySetPos)
    : sortedDays;
}

function matchesRecurrenceDate(meeting: Meeting, candidate: Date, startTime: Date): boolean {
  if (candidate.getTime() === startTime.getTime()) {
    return true;
  }

  const interval = meeting.recurrenceInterval && meeting.recurrenceInterval > 0 ? meeting.recurrenceInterval : 1;
  const timeZone = meeting.timeZone;
  const start = getZonedDateParts(startTime, timeZone);
  const current = getZonedDateParts(candidate, timeZone);
  const dayDifference = getCalendarDayNumber(current.year, current.month, current.day)
    - getCalendarDayNumber(start.year, start.month, start.day);
  const monthDifference = (current.year - start.year) * 12 + current.month - start.month;

  if (dayDifference < 0) {
    return false;
  }

  if (meeting.recurrenceByMonth && meeting.recurrenceByMonth.length > 0
      && !meeting.recurrenceByMonth.includes(current.month + 1)) {
    return false;
  }

  if (meeting.recurrence === 'daily') {
    if (dayDifference % interval !== 0) {
      return false;
    }
  } else if (meeting.recurrence === 'weekdays') {
    if (current.dayOfWeek === 0 || current.dayOfWeek === 6) {
      return false;
    }
  } else if (meeting.recurrence === 'weekly') {
    const initialWeekStart = getCalendarDayNumber(start.year, start.month, start.day) - start.dayOfWeek;
    const currentWeekStart = getCalendarDayNumber(current.year, current.month, current.day) - current.dayOfWeek;
    const daysOfWeek = meeting.recurrenceByDay?.map(rule => rule.day)
      ?? meeting.daysOfWeek
      ?? [start.dayOfWeek];
    if (((currentWeekStart - initialWeekStart) / 7) % interval !== 0
        || !daysOfWeek.includes(current.dayOfWeek)) {
      return false;
    }
  } else if (meeting.recurrence === 'monthly') {
    if (monthDifference < 0 || monthDifference % interval !== 0) {
      return false;
    }
    const candidateDays = getMonthCandidateDays(
      meeting,
      current.year,
      current.month,
      meeting.dayOfMonth || start.day,
      true
    );
    if (!candidateDays.includes(current.day)) {
      return false;
    }
  } else if (meeting.recurrence === 'yearly') {
    if ((current.year - start.year) % interval !== 0) {
      return false;
    }
    const months = meeting.recurrenceByMonth && meeting.recurrenceByMonth.length > 0
      ? meeting.recurrenceByMonth.map(month => month - 1)
      : [meeting.monthOfYear ? meeting.monthOfYear - 1 : start.month];
    const defaultDay = meeting.dayOfYear || meeting.dayOfMonth || start.day;
    const candidates = months.flatMap(month => getMonthCandidateDays(meeting, current.year, month, defaultDay, false)
      .map(day => ({ month, day })));
    const selected = applySetPositions(candidates, meeting.recurrenceBySetPos);
    if (!selected.some(value => value.month === current.month && value.day === current.day)) {
      return false;
    }
  }

  if (meeting.recurrence !== 'monthly' && meeting.recurrence !== 'yearly') {
    const byMonthDay = meeting.recurrenceByMonthDay;
    if (byMonthDay && byMonthDay.length > 0) {
      const daysInMonth = getDaysInMonth(current.year, current.month);
      const allowedDays = byMonthDay
        .map(value => resolveMonthDay(value, daysInMonth))
        .filter((value): value is number => value !== undefined);
      if (!allowedDays.includes(current.day)) {
        return false;
      }
    }
    if (meeting.recurrenceByDay && meeting.recurrenceByDay.length > 0
        && !matchesByDay(current.year, current.month, current.day, meeting.recurrenceByDay)) {
      return false;
    }
  }

  return true;
}

export function getNextOccurrence(meeting: Meeting, now: Date): Date | null {
  if (meeting.recurrence === 'once') {
    return null;
  }

  const startTime = new Date(meeting.startTime);
  const endTime = meeting.endTime
    ? new Date(meeting.endTime)
    : new Date(startTime.getTime() + MEETING_DURATION_MS);
  const duration = endTime.getTime() - startTime.getTime();

  let seriesEnd: Date | undefined = undefined;
  if (meeting.recurrenceEndDate) {
    seriesEnd = new Date(meeting.recurrenceEndDate);
  }

  const timeZone = meeting.timeZone;
  const startParts = getZonedDateParts(startTime, timeZone);
  const thresholdParts = getZonedDateParts(new Date(now.getTime() - duration), timeZone);
  const thresholdDay = getCalendarDayNumber(thresholdParts.year, thresholdParts.month, thresholdParts.day);
  const startDay = getCalendarDayNumber(startParts.year, startParts.month, startParts.day);
  const firstCandidate = addZonedDays(startTime, Math.max(0, thresholdDay - startDay - 1), timeZone);

  if (meeting.recurrence === 'monthly' || meeting.recurrence === 'yearly') {
    return getNextMonthlyOrYearlyOccurrence(meeting, {
      startTime,
      duration,
      seriesEnd,
      timeZone,
      startParts,
      firstCandidate,
      now,
    });
  }

  // Scan at most MAX_OCCURRENCE_SCAN_DAYS ahead. If no candidate matches in
  // that span, the rule is treated as having no next occurrence.
  let candidate = firstCandidate;
  for (let dayOffset = 0; dayOffset <= MAX_OCCURRENCE_SCAN_DAYS; dayOffset++) {
    if (seriesEnd && candidate.getTime() > seriesEnd.getTime()) {
      return null;
    }
    if (candidate.getTime() + duration >= now.getTime()
        && matchesRecurrenceDate(meeting, candidate, startTime)) {
      return candidate;
    }
    candidate = addZonedDays(candidate, 1, timeZone);
  }

  return null;
}

interface MonthlyOrYearlySearch {
  startTime: Date;
  duration: number;
  seriesEnd: Date | undefined;
  timeZone: string | undefined;
  startParts: ZonedDateParts;
  firstCandidate: Date;
  now: Date;
}

/**
 * Finds the next occurrence of a monthly or yearly rule by enumerating the
 * candidate days of each period (month or year) directly, instead of
 * scanning day by day. The search covers one full 400-year Gregorian
 * cycle, so long-interval rules still resolve, while a rule that can never
 * match (e.g. February 31) is rejected after a bounded number of periods.
 * Candidate days come from the same helpers matchesRecurrenceDate uses,
 * and every candidate is verified through matchesRecurrenceDate itself.
 */
function getNextMonthlyOrYearlyOccurrence(meeting: Meeting, search: MonthlyOrYearlySearch): Date | null {
  const { startTime, duration, seriesEnd, timeZone, startParts, firstCandidate, now } = search;
  const interval = meeting.recurrenceInterval && meeting.recurrenceInterval > 0 ? meeting.recurrenceInterval : 1;
  const firstParts = getZonedDateParts(firstCandidate, timeZone);
  const firstDayNumber = getCalendarDayNumber(firstParts.year, firstParts.month, firstParts.day);

  const isMatch = (candidate: Date): boolean =>
    candidate.getTime() + duration >= now.getTime()
    && matchesRecurrenceDate(meeting, candidate, startTime);
  const atStartTimeOfDay = (year: number, month: number, day: number): Date =>
    createDateInTimeZone(
      year, month, day,
      startParts.hour, startParts.minute, startParts.second, startParts.millisecond,
      timeZone
    );

  // The first candidate is always eligible on its own: it may be the
  // series start, which counts as an occurrence even when the rule's day
  // pattern would not reproduce that exact date.
  if (seriesEnd && firstCandidate.getTime() > seriesEnd.getTime()) {
    return null;
  }
  if (isMatch(firstCandidate)) {
    return firstCandidate;
  }

  if (meeting.recurrence === 'monthly') {
    const startMonthIndex = startParts.year * 12 + startParts.month;
    const firstMonthIndex = firstParts.year * 12 + firstParts.month;
    const lastMonthIndex = firstMonthIndex + MAX_OCCURRENCE_SCAN_YEARS * 12;
    for (let monthIndex = firstMonthIndex; monthIndex <= lastMonthIndex; monthIndex++) {
      if ((monthIndex - startMonthIndex) % interval !== 0) {
        continue;
      }
      const year = Math.floor(monthIndex / 12);
      const month = monthIndex - year * 12;
      if (meeting.recurrenceByMonth && meeting.recurrenceByMonth.length > 0
          && !meeting.recurrenceByMonth.includes(month + 1)) {
        continue;
      }
      const days = getMonthCandidateDays(meeting, year, month, meeting.dayOfMonth || startParts.day, true);
      for (const day of days) {
        if (getCalendarDayNumber(year, month, day) <= firstDayNumber) {
          continue;
        }
        const candidate = atStartTimeOfDay(year, month, day);
        if (seriesEnd && candidate.getTime() > seriesEnd.getTime()) {
          return null;
        }
        if (isMatch(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }

  const months = meeting.recurrenceByMonth && meeting.recurrenceByMonth.length > 0
    ? meeting.recurrenceByMonth.map(month => month - 1)
    : [meeting.monthOfYear ? meeting.monthOfYear - 1 : startParts.month];
  const defaultDay = meeting.dayOfYear || meeting.dayOfMonth || startParts.day;
  const lastYear = firstParts.year + MAX_OCCURRENCE_SCAN_YEARS;
  for (let year = firstParts.year; year <= lastYear; year++) {
    if ((year - startParts.year) % interval !== 0) {
      continue;
    }
    const yearCandidates = months.flatMap(month =>
      getMonthCandidateDays(meeting, year, month, defaultDay, false)
        .map(day => ({ month, day })));
    const selected = applySetPositions(yearCandidates, meeting.recurrenceBySetPos);
    const ordered = [...selected].sort((a, b) =>
      getCalendarDayNumber(year, a.month, a.day) - getCalendarDayNumber(year, b.month, b.day));
    for (const { month, day } of ordered) {
      if (getCalendarDayNumber(year, month, day) <= firstDayNumber) {
        continue;
      }
      const candidate = atStartTimeOfDay(year, month, day);
      if (seriesEnd && candidate.getTime() > seriesEnd.getTime()) {
        return null;
      }
      if (isMatch(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

export class MeetingManager {
  private context: vscode.ExtensionContext;
  private saveQueue: Promise<void> = Promise.resolve();
  private _onDidChangeMeetings = new vscode.EventEmitter<void>();
  readonly onDidChangeMeetings = this._onDidChangeMeetings.event;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public getMeetings(): Meeting[] {
    const rawData = this.context.globalState.get<Meeting[]>(STORAGE_KEY, []);
    if (!Array.isArray(rawData)) {
      return [];
    }
    return rawData.filter((m): m is Meeting =>
      Boolean(
        m &&
        typeof m === 'object' &&
        typeof m.id === 'string' &&
        typeof m.title === 'string' &&
        m.title.length <= MAX_STORED_TITLE_LENGTH &&
        typeof m.url === 'string' &&
        isValidIsoDateString(m.startTime) &&
        (m.endTime === undefined || isValidIsoDateString(m.endTime)) &&
        (m.recurrenceEndDate === undefined || isValidIsoDateString(m.recurrenceEndDate)) &&
        isValidTeamsUrl(m.url) &&
        (m.recurrence === undefined || VALID_RECURRENCE_TYPES.has(m.recurrence)) &&
        isValidStoredTimeZone(m.timeZone) &&
        (m.recurrenceInterval === undefined || isIntInRange(m.recurrenceInterval, 1, MAX_STORED_RECURRENCE_INTERVAL)) &&
        isValidIntArray(m.daysOfWeek, 0, 6, 14) &&
        isValidRecurrenceByDay(m.recurrenceByDay) &&
        isValidIntArray(m.recurrenceByMonthDay, -31, 31, 62, true) &&
        isValidIntArray(m.recurrenceBySetPos, -366, 366, 62, true) &&
        (m.monthOfYear === undefined || (typeof m.monthOfYear === 'number' && Number.isInteger(m.monthOfYear) && m.monthOfYear >= 1 && m.monthOfYear <= 12)) &&
        (m.recurrenceByMonth === undefined || (Array.isArray(m.recurrenceByMonth) && m.recurrenceByMonth.length <= 12 && m.recurrenceByMonth.every(n => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 12)))
      )
    );
  }

  public async saveMeetings(meetings: Meeting[]): Promise<void> {
    const meetingsSnapshot = [...meetings];
    const precedingSave = this.saveQueue;
    let releaseNextSave!: () => void;
    this.saveQueue = new Promise<void>(resolve => {
      releaseNextSave = resolve;
    });

    try {
      await precedingSave;
      await this.context.globalState.update(STORAGE_KEY, meetingsSnapshot);
      this._onDidChangeMeetings.fire();
    } finally {
      releaseNextSave();
    }
  }

  public async addMeeting(meeting: Meeting): Promise<void> {
    const meetings = this.getMeetings();
    meetings.push(meeting);
    await this.saveMeetings(meetings);
  }

  public async removeMeeting(id: string): Promise<void> {
    const meetings = this.getMeetings();
    const filtered = meetings.filter(m => m.id !== id);
    await this.saveMeetings(filtered);
  }

  public async updateMeeting(meeting: Meeting): Promise<void> {
    const meetings = this.getMeetings();
    const idx = meetings.findIndex(m => m.id === meeting.id);
    if (idx !== -1) {
      meetings[idx] = meeting;
      await this.saveMeetings(meetings);
    }
  }

  /**
   * Process expired meetings and update recurring meetings to their next date.
   * Returns true if any meeting state was changed.
   */
  public async processExpirations(now: Date = new Date()): Promise<boolean> {
    const meetings = this.getMeetings();
    let updated = false;
    const result: Meeting[] = [];

    for (const meeting of meetings) {
      const startTime = new Date(meeting.startTime);
      const endTime = getMeetingEndTime(meeting);
      const duration = endTime.getTime() - startTime.getTime();

      if (now > endTime) {
        updated = true;
        const nextStart = getNextOccurrence(meeting, now);
        if (nextStart) {
          result.push({
            ...meeting,
            startTime: nextStart.toISOString(),
            endTime: new Date(nextStart.getTime() + duration).toISOString(),
            notified5m: false,
            notifiedStart: false,
          });
        }
      } else {
        result.push(meeting);
      }
    }

    if (updated) {
      await this.saveMeetings(result);
    }
    return updated;
  }

  /**
   * Returns sorted active meetings (closest start time first), processing expirations first.
   */
  public getSortedMeetings(now: Date = new Date()): Meeting[] {
    const rawMeetings = this.getMeetings();
    let hasChanges = false;
    const mapped: Array<{ meeting: Meeting; timestamp: number }> = [];

    for (const meeting of rawMeetings) {
      const startTime = new Date(meeting.startTime);
      const endTime = getMeetingEndTime(meeting);
      const duration = endTime.getTime() - startTime.getTime();

      if (now > endTime) {
        hasChanges = true;
        const nextStart = getNextOccurrence(meeting, now);
        if (nextStart) {
          const nextMeeting: Meeting = {
            ...meeting,
            startTime: nextStart.toISOString(),
            endTime: new Date(nextStart.getTime() + duration).toISOString(),
            notified5m: false,
            notifiedStart: false,
          };
          mapped.push({ meeting: nextMeeting, timestamp: nextStart.getTime() });
        }
      } else {
        mapped.push({ meeting, timestamp: startTime.getTime() });
      }
    }

    if (hasChanges) {
      this.saveMeetings(mapped.map(item => item.meeting)).catch(error => {
        console.error('Failed to save expired meeting updates.', error);
      });
    }

    mapped.sort((a, b) => a.timestamp - b.timestamp);
    return mapped.map(item => item.meeting);
  }

  /**
   * Returns the next upcoming meeting or currently ongoing meeting.
   */
  public getNextMeeting(now: Date = new Date()): Meeting | undefined {
    const sorted = this.getSortedMeetings(now);
    for (const m of sorted) {
      const end = getMeetingEndTime(m);
      if (now <= end) {
        return m;
      }
    }
    return undefined;
  }

  /**
   * Returns all meetings that are currently ongoing or starting within withinMs milliseconds,
   * sorted by start time (earliest first).
   */
  public getRelevantMeetings(withinMs: number, now: Date = new Date()): Meeting[] {
    const sorted = this.getSortedMeetings(now);
    return sorted.filter(m => {
      const start = new Date(m.startTime);
      const end = getMeetingEndTime(m);
      const diffMs = start.getTime() - now.getTime();
      return now < end && diffMs <= withinMs;
    });
  }
}
