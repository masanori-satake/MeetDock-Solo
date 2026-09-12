import * as vscode from 'vscode';
import { MeetingManager } from './meetingManager';
import { Meeting } from './types';

const MEETING_DURATION_MS = 30 * 60 * 1000;

export class ReminderService {
  private statusBarItem: vscode.StatusBarItem;
  private meetingManager: MeetingManager;
  private timer: NodeJS.Timeout | undefined;

  constructor(meetingManager: MeetingManager) {
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
    // Check every 10 seconds
    this.timer = setInterval(() => {
      this.update();
    }, 10000);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.statusBarItem.dispose();
  }

  public dispose(): void {
    this.stop();
  }

  public async update(): Promise<void> {
    // Process any expired/completed meetings
    await this.meetingManager.processExpirations();

    const nextMeeting = this.meetingManager.getNextMeeting();
    if (!nextMeeting) {
      this.statusBarItem.text = `$(calendar) Teams: 予定なし`;
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.tooltip = '登録された Teams ミーティングはありません。';
      return;
    }

    const now = new Date();
    const startTime = new Date(nextMeeting.startTime);
    const endTime = new Date(startTime.getTime() + MEETING_DURATION_MS);
    const diffMs = startTime.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / (60 * 1000));
    const diffSeconds = Math.floor(diffMs / 1000);

    const timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    if (now >= startTime && now <= endTime) {
      // Meeting is currently ongoing ("開催中")
      this.statusBarItem.text = `$(broadcast) Teams: ${nextMeeting.title} (開催中)`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.statusBarItem.tooltip = `開催中: ${nextMeeting.title}\nクリックしてミーティング一覧を開く`;
    } else if (diffMinutes <= 1 && diffMs > 0) {
      // Less than 1 minute remaining -> warning background / red text
      this.statusBarItem.text = `$(calendar) Next Teams: ${timeStr} (まもなく開始)`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      this.statusBarItem.tooltip = `まもなく開始: ${nextMeeting.title}\n開始時刻: ${timeStr}`;
    } else if (diffMinutes <= 5 && diffMs > 0) {
      // 5 minutes or less
      this.statusBarItem.text = `$(calendar) Next Teams: ${timeStr} (in ${diffMinutes}m)`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.statusBarItem.tooltip = `次回会議: ${nextMeeting.title}\n開始時刻: ${timeStr}`;
    } else {
      // Normal countdown
      let remainingText = '';
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
    }

    // Trigger Reminders
    await this.checkReminders(nextMeeting, diffMs, now, startTime);
  }

  private async checkReminders(meeting: Meeting, diffMs: number, now: Date, startTime: Date): Promise<void> {
    // 5 minutes reminder (when remaining time is <= 5 minutes and > 0, and not notified yet)
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

    // Meeting Start Time modal dialog notification (when time has arrived/passed within 2 minutes, and not notified yet)
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
