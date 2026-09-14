import * as vscode from 'vscode';
import { Meeting, RecurrenceByDay } from './types';
import { addZonedDays, getDaysInMonth, getZonedDateParts } from './dateTime';

const STORAGE_KEY = 'meetdock-solo.meetings';
// Fallback duration when a meeting has no explicit endTime
const MEETING_DURATION_MS = 30 * 60 * 1000;

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
  let candidate = addZonedDays(startTime, Math.max(0, thresholdDay - startDay - 1), timeZone);

  // A Gregorian calendar repeats every 400 years. If no candidate is found in that span,
  // the parsed rule cannot produce an occurrence supported by this recurrence model.
  for (let dayOffset = 0; dayOffset <= 366 * 400; dayOffset++) {
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
    return rawData;
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
  public async processExpirations(): Promise<boolean> {
    const meetings = this.getMeetings();
    const now = new Date();
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
  public getSortedMeetings(): Meeting[] {
    const now = new Date();
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
  public getNextMeeting(): Meeting | undefined {
    const sorted = this.getSortedMeetings();
    const now = new Date();
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
  public getRelevantMeetings(withinMs: number): Meeting[] {
    const sorted = this.getSortedMeetings();
    const now = new Date();
    return sorted.filter(m => {
      const start = new Date(m.startTime);
      const end = getMeetingEndTime(m);
      const diffMs = start.getTime() - now.getTime();
      return now < end && diffMs <= withinMs;
    });
  }
}
