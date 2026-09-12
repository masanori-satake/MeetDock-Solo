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

export class MeetingManager {
  private context: vscode.ExtensionContext;
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
    await this.context.globalState.update(STORAGE_KEY, meetings);
    this._onDidChangeMeetings.fire();
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

      if (now > endTime) {
        updated = true;
        if (meeting.recurrence === 'once') {
          // Single meeting expired after completion, remove it
          continue;
        } else if (meeting.recurrence === 'weekly') {
          let nextStart = new Date(startTime.getTime());
          while (now > getMeetingEndTime({ ...meeting, startTime: nextStart.toISOString() })) {
            nextStart.setDate(nextStart.getDate() + 7);
          }
          const duration = endTime.getTime() - startTime.getTime();
          result.push({
            ...meeting,
            startTime: nextStart.toISOString(),
            endTime: new Date(nextStart.getTime() + duration).toISOString(),
            notified5m: false,
            notifiedStart: false,
          });
        } else if (meeting.recurrence === 'weekdays') {
          let nextStart = new Date(startTime.getTime());
          while (now > getMeetingEndTime({ ...meeting, startTime: nextStart.toISOString() })) {
            nextStart.setDate(nextStart.getDate() + 1);
            // Skip weekends (0 = Sunday, 6 = Saturday)
            while (nextStart.getDay() === 0 || nextStart.getDay() === 6) {
              nextStart.setDate(nextStart.getDate() + 1);
            }
          }
          const duration = endTime.getTime() - startTime.getTime();
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
   * Returns sorted active meetings (closest start time first).
   */
  public getSortedMeetings(): Meeting[] {
    const meetings = this.getMeetings();
    return meetings.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
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
      // Include if currently ongoing OR starting within withinMs
      return now < end && diffMs <= withinMs;
    });
  }
}
