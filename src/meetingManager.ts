import * as vscode from 'vscode';
import { Meeting } from './types';

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

function getStartOfWeek(d: Date): Date {
  const res = new Date(d);
  res.setHours(0, 0, 0, 0);
  res.setDate(res.getDate() - res.getDay()); // Sunday
  return res;
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

  const interval = meeting.recurrenceInterval && meeting.recurrenceInterval > 0 ? meeting.recurrenceInterval : 1;

  let candidate = new Date(startTime.getTime());

  if (meeting.recurrence === 'daily') {
    while (candidate.getTime() + duration < now.getTime()) {
      candidate.setDate(candidate.getDate() + interval);
    }
  } else if (meeting.recurrence === 'weekdays') {
    while (candidate.getTime() + duration < now.getTime() || candidate.getDay() === 0 || candidate.getDay() === 6) {
      candidate.setDate(candidate.getDate() + 1);
    }
  } else if (meeting.recurrence === 'weekly') {
    const daysOfWeek = meeting.daysOfWeek && meeting.daysOfWeek.length > 0
      ? meeting.daysOfWeek
      : [startTime.getDay()];

    const initialWeekStart = getStartOfWeek(startTime);

    while (true) {
      const isPast = candidate.getTime() + duration < now.getTime();
      const currWeekStart = getStartOfWeek(candidate);
      const diffWeeks = Math.round((currWeekStart.getTime() - initialWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
      const isCorrectWeek = interval <= 1 || (diffWeeks % interval === 0);
      const isCorrectDay = daysOfWeek.includes(candidate.getDay());

      if (!isPast && isCorrectWeek && isCorrectDay) {
        break;
      }

      candidate.setDate(candidate.getDate() + 1);
    }
  } else if (meeting.recurrence === 'monthly') {
    const targetDay = meeting.dayOfMonth || startTime.getDate();
    const initialYear = startTime.getFullYear();
    const initialMonth = startTime.getMonth();
    let monthStep = 0;

    while (candidate.getTime() + duration < now.getTime()) {
      monthStep += interval;
      const totalMonths = initialMonth + monthStep;
      const nextYear = initialYear + Math.floor(totalMonths / 12);
      const nextMonth = totalMonths % 12;

      const daysInMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
      const clampedDay = Math.min(targetDay, daysInMonth);

      candidate = new Date(nextYear, nextMonth, clampedDay, startTime.getHours(), startTime.getMinutes(), startTime.getSeconds(), startTime.getMilliseconds());
    }
  } else if (meeting.recurrence === 'yearly') {
    const targetMonth = meeting.monthOfYear ? meeting.monthOfYear - 1 : startTime.getMonth();
    const targetDay = meeting.dayOfYear || meeting.dayOfMonth || startTime.getDate();
    const initialYear = startTime.getFullYear();
    let yearStep = 0;

    while (candidate.getTime() + duration < now.getTime()) {
      yearStep += interval;
      const nextYear = initialYear + yearStep;
      const daysInMonth = new Date(nextYear, targetMonth + 1, 0).getDate();
      const clampedDay = Math.min(targetDay, daysInMonth);

      candidate = new Date(nextYear, targetMonth, clampedDay, startTime.getHours(), startTime.getMinutes(), startTime.getSeconds(), startTime.getMilliseconds());
    }
  }

  if (seriesEnd && candidate.getTime() > seriesEnd.getTime()) {
    return null;
  }

  return candidate;
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
    const activeMeetings: Meeting[] = [];

    for (const meeting of rawMeetings) {
      const startTime = new Date(meeting.startTime);
      const endTime = getMeetingEndTime(meeting);
      const duration = endTime.getTime() - startTime.getTime();

      if (now > endTime) {
        hasChanges = true;
        const nextStart = getNextOccurrence(meeting, now);
        if (nextStart) {
          activeMeetings.push({
            ...meeting,
            startTime: nextStart.toISOString(),
            endTime: new Date(nextStart.getTime() + duration).toISOString(),
            notified5m: false,
            notifiedStart: false,
          });
        }
      } else {
        activeMeetings.push(meeting);
      }
    }

    if (hasChanges) {
      this.saveMeetings(activeMeetings).catch(error => {
        console.error('Failed to save expired meeting updates.', error);
      });
    }

    return activeMeetings.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
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
