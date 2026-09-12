import * as vscode from 'vscode';
import { MeetingManager } from './meetingManager';
import { Meeting } from './types';

const MEETING_DURATION_MS = 30 * 60 * 1000;
/** How far ahead to include meetings in the rotation (currently 5 minutes). */
const REMINDER_WINDOW_MS = 5 * 60 * 1000;
/** How often to rotate the status bar display when multiple meetings are relevant. */
const ROTATION_INTERVAL_MS = 5000;

export class ReminderService {
  private statusBarItem: vscode.StatusBarItem;
  private meetingManager: MeetingManager;
  private updateTimer: NodeJS.Timeout | undefined;
  private rotationTimer: NodeJS.Timeout | undefined;
  /** Currently relevant meetings (ongoing or within REMINDER_WINDOW_MS). */
  private currentRelevantMeetings: Meeting[] = [];
  /** Index into currentRelevantMeetings for status bar rotation. */
  private rotationIndex: number = 0;

  constructor(
    meetingManager: MeetingManager,
    private readonly now: () => Date = () => new Date()
  ) {
    this.meetingManager = meetingManager;
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'meetdock-solo.selectMeeting';
    this.statusBarItem.show();

    this.meetingManager.onDidChangeMeetings(() => {
      this.update();
    });
  }

  public start(): void {
    this.update();
    // Check every 10 seconds for expirations and reminders
    this.updateTimer = setInterval(() => {
      this.update();
    }, 10000);
    // Rotate status bar display every 5 seconds (only active when multiple meetings are relevant)
    this.rotationTimer = setInterval(() => {
      if (this.currentRelevantMeetings.length > 1) {
        this.rotationIndex = (this.rotationIndex + 1) % this.currentRelevantMeetings.length;
        this.updateStatusBar();
      }
    }, ROTATION_INTERVAL_MS);
  }

  public stop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }
    this.statusBarItem.dispose();
  }

  public dispose(): void {
    this.stop();
  }

  public async update(): Promise<void> {
    // Process any expired/completed meetings
    await this.meetingManager.processExpirations();

    // Get all currently relevant meetings (ongoing or starting within REMINDER_WINDOW_MS)
    const newRelevantMeetings = this.meetingManager.getRelevantMeetings(REMINDER_WINDOW_MS);

    // If the list composition changed (e.g. a meeting was added/deleted), reset rotation index
    // so we never reference a stale or out-of-bounds entry.
    const prevIds = this.currentRelevantMeetings.map(m => m.id).join(',');
    const newIds = newRelevantMeetings.map(m => m.id).join(',');
    if (prevIds !== newIds) {
      this.rotationIndex = 0;
    }
    this.currentRelevantMeetings = newRelevantMeetings;

    // Fire reminders for every relevant meeting individually
    await this.checkReminders(this.currentRelevantMeetings);

    // Refresh status bar
    this.updateStatusBar();
  }

  private updateStatusBar(): void {
    const meetings = this.currentRelevantMeetings;
    const total = meetings.length;

    if (total === 0) {
      // No relevant meetings — show the next upcoming meeting as a plain countdown
      const nextMeeting = this.meetingManager.getNextMeeting();
      if (!nextMeeting) {
        this.statusBarItem.text = `$(calendar) Teams: 予定なし`;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.tooltip = '登録された Teams ミーティングはありません。';
        return;
      }

      const now = this.now();
      const startTime = new Date(nextMeeting.startTime);
      const diffMs = startTime.getTime() - now.getTime();
      const diffMinutes = Math.floor(diffMs / (60 * 1000));
      const timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

      let remainingText: string;
      if (diffMinutes >= 60) {
        const hours = Math.floor(diffMinutes / 60);
        const mins = diffMinutes % 60;
        remainingText = `${hours}h${mins}m`;
      } else {
        remainingText = `${diffMinutes}m`;
      }
      this.statusBarItem.text = `$(calendar) Next Teams: ${timeStr} (in ${remainingText})`;
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.tooltip = `次回会議: ${nextMeeting.title}\n開始時刻: ${timeStr}`;
      return;
    }

    // Guard: clamp rotationIndex in case a meeting was deleted between the rotation tick and now
    if (this.rotationIndex >= total) {
      this.rotationIndex = 0;
    }

    const meeting = meetings[this.rotationIndex];
    const now = this.now();
    const startTime = new Date(meeting.startTime);
    const endTime = meeting.endTime ? new Date(meeting.endTime) : new Date(startTime.getTime() + MEETING_DURATION_MS);
    const diffMs = startTime.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / (60 * 1000));

    const timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    // Show [n/total] suffix only when there are multiple relevant meetings
    const indexSuffix = total > 1 ? ` [${this.rotationIndex + 1}/${total}]` : '';

    if (now >= startTime && now < endTime) {
      // Meeting is currently ongoing ("開催中")
      this.statusBarItem.text = `$(broadcast) ${meeting.title} (開催中)${indexSuffix}`;
      this.statusBarItem.color = undefined; // 文字色はデフォルトに戻す
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
      this.statusBarItem.tooltip = `開催中: ${meeting.title}\nクリックしてミーティング一覧を開く`;
    } else if (diffMs > 0 && diffMinutes < 1) {
      // Less than 1 minute until start — red/error background
      this.statusBarItem.text = `$(calendar) ${timeStr} ${meeting.title} (まもなく開始)${indexSuffix}`;
      this.statusBarItem.color = undefined;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      this.statusBarItem.tooltip = `まもなく開始: ${meeting.title}\n開始時刻: ${timeStr}`;
    } else if (diffMs > 0 && diffMinutes <= 5) {
      // 5 minutes or less until start — yellow/warning background
      this.statusBarItem.text = `$(calendar) ${timeStr} ${meeting.title} (in ${diffMinutes}m)${indexSuffix}`;
      this.statusBarItem.color = undefined;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.statusBarItem.tooltip = `次回会議: ${meeting.title}\n開始時刻: ${timeStr}`;
    }
  }

  private async checkReminders(meetings: Meeting[]): Promise<void> {
    const now = this.now();
    for (const meeting of meetings) {
      const startTime = new Date(meeting.startTime);
      const diffMs = startTime.getTime() - now.getTime();
      await this.checkMeetingReminder(meeting, diffMs, now, startTime);
    }
  }

  private async checkMeetingReminder(
    meeting: Meeting,
    diffMs: number,
    now: Date,
    startTime: Date
  ): Promise<void> {
    // 5-minute reminder (fires once per meeting via notified5m flag)
    if (diffMs <= 5 * 60 * 1000 && diffMs > 0 && !meeting.notified5m) {
      meeting.notified5m = true;
      await this.meetingManager.updateMeeting(meeting);

      const timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      const joinBtn = 'Teamsに参加';
      vscode.window.showInformationMessage(
        `【5分前リマインダー】「${meeting.title}」が ${timeStr} に開始します。`,
        joinBtn
      ).then(selection => {
        if (selection === joinBtn) {
          vscode.env.openExternal(vscode.Uri.parse(meeting.url));
        }
      });
    }

    // Start-time modal notification (fires once per meeting via notifiedStart flag)
    if (diffMs <= 0 && (now.getTime() - startTime.getTime()) < 2 * 60 * 1000 && !meeting.notifiedStart) {
      meeting.notifiedStart = true;
      await this.meetingManager.updateMeeting(meeting);

      const joinBtn = 'Teamsに参加';
      vscode.window.showInformationMessage(
        `ミーティング「${meeting.title}」の時間になりました！`,
        { modal: true },
        joinBtn
      ).then(selection => {
        if (selection === joinBtn) {
          vscode.env.openExternal(vscode.Uri.parse(meeting.url));
        }
      });
    }
  }
}
