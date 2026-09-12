import * as vscode from 'vscode';
import { MeetingManager } from './meetingManager';
import { Meeting, RecurrenceType } from './types';
import { parseMeetingText } from './parser';

export class MeetingTreeItem extends vscode.TreeItem {
  public readonly meeting: Meeting;

  constructor(meeting: Meeting) {
    const startTimeDate = new Date(meeting.startTime);
    const timeStr = startTimeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = `${startTimeDate.getMonth() + 1}/${startTimeDate.getDate()}`;

    let recurrenceSuffix = '';
    if (meeting.recurrence === 'weekly') {
      recurrenceSuffix = ' [毎週]';
    } else if (meeting.recurrence === 'weekdays') {
      recurrenceSuffix = ' [平日]';
    }

    super(meeting.title, vscode.TreeItemCollapsibleState.None);

    this.meeting = meeting;
    this.description = `${dateStr} ${timeStr}${recurrenceSuffix}`;
    this.tooltip = `${meeting.title}\n開始時刻: ${startTimeDate.toLocaleString()}\nURL: ${meeting.url}\n繰り返し: ${meeting.recurrence}`;
    this.iconPath = new vscode.ThemeIcon('calendar');
    this.contextValue = 'meetingItem';
  }
}

export class MeetingTreeDataProvider implements vscode.TreeDataProvider<MeetingTreeItem>, vscode.TreeDragAndDropController<MeetingTreeItem> {
  dropMimeTypes = ['text/plain', 'text/html', 'text/uri-list'];
  dragMimeTypes = [];

  private _onDidChangeTreeData = new vscode.EventEmitter<MeetingTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private meetingManager: MeetingManager) {
    this.meetingManager.onDidChangeMeetings(() => {
      this.refresh();
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: MeetingTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: MeetingTreeItem): vscode.ProviderResult<MeetingTreeItem[]> {
    if (element) {
      return [];
    }
    const meetings = this.meetingManager.getSortedMeetings();
    return meetings.map(m => new MeetingTreeItem(m));
  }

  async handleDrop(target: MeetingTreeItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    let droppedText = '';

    // Check html first, then text/plain, then text/uri-list
    const htmlItem = dataTransfer.get('text/html');
    if (htmlItem) {
      droppedText = await htmlItem.asString();
    } else {
      const textItem = dataTransfer.get('text/plain');
      if (textItem) {
        droppedText = await textItem.asString();
      } else {
        const uriItem = dataTransfer.get('text/uri-list');
        if (uriItem) {
          droppedText = await uriItem.asString();
        }
      }
    }

    if (!droppedText || !droppedText.trim()) {
      return;
    }

    const parsed = parseMeetingText(droppedText);

    let finalUrl = parsed.url;
    if (!finalUrl) {
      const inputUrl = await vscode.window.showInputBox({
        prompt: 'Microsoft Teams ミーティングURLが見つかりませんでした。入力してください。',
        placeHolder: 'https://teams.microsoft.com/l/meetup-join/...',
        validateInput: (val) => /^https:\/\/teams\.(microsoft|live)\.com\//i.test(val.trim()) ? null : '有効な Teams URL を入力してください。'
      });
      if (!inputUrl) {
        return;
      }
      finalUrl = inputUrl.trim();
    }

    let finalTitle = parsed.title;
    const inputTitle = await vscode.window.showInputBox({
      prompt: 'ミーティングタイトルを確認・編集してください',
      value: finalTitle || 'Teams Meeting'
    });
    if (!inputTitle) {
      return;
    }
    finalTitle = inputTitle.trim();

    const now = new Date();
    let defaultTimeStr = '';
    if (parsed.startTime) {
      const st = new Date(parsed.startTime.getTime());
      while (st.getTime() + 30 * 60 * 1000 <= now.getTime()) {
        st.setDate(st.getDate() + 1);
      }
      const yyyy = st.getFullYear();
      const mm = String(st.getMonth() + 1).padStart(2, '0');
      const dd = String(st.getDate()).padStart(2, '0');
      const hh = String(st.getHours()).padStart(2, '0');
      const min = String(st.getMinutes()).padStart(2, '0');
      defaultTimeStr = `${yyyy}-${mm}-${dd} ${hh}:${min}`;
    } else {
      const defaultDate = new Date(now.getTime());
      defaultDate.setHours(defaultDate.getHours() + 1, 0, 0, 0);
      const yyyy = defaultDate.getFullYear();
      const mm = String(defaultDate.getMonth() + 1).padStart(2, '0');
      const dd = String(defaultDate.getDate()).padStart(2, '0');
      const hh = String(defaultDate.getHours()).padStart(2, '0');
      const min = String(defaultDate.getMinutes()).padStart(2, '0');
      defaultTimeStr = `${yyyy}-${mm}-${dd} ${hh}:${min}`;
    }

    const inputTimeStr = await vscode.window.showInputBox({
      prompt: '開始日時を入力してください (形式: YYYY-MM-DD HH:mm または HH:mm)',
      value: defaultTimeStr,
      validateInput: (val) => {
        if (!val || !val.trim()) {
          return '開始日時は必須です。';
        }
        const timeRegex = /^(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s+)?(\d{1,2}):(\d{2})$/;
        if (!timeRegex.test(val.trim())) {
          return '正しい日時形式 (例: 2026-04-01 14:00 または 14:00) で入力してください。';
        }
        return null;
      }
    });
    if (!inputTimeStr) {
      return;
    }

    const timeMatch = inputTimeStr.trim().match(/^(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s+)?(\d{1,2}):(\d{2})$/);
    let finalStartTime: Date;

    if (timeMatch) {
      const hour = parseInt(timeMatch[4], 10);
      const minute = parseInt(timeMatch[5], 10);

      if (timeMatch[1] && timeMatch[2] && timeMatch[3]) {
        const year = parseInt(timeMatch[1], 10);
        const month = parseInt(timeMatch[2], 10) - 1;
        const day = parseInt(timeMatch[3], 10);
        finalStartTime = new Date(year, month, day, hour, minute, 0);
      } else {
        finalStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
      }

      while (finalStartTime.getTime() + 30 * 60 * 1000 <= now.getTime()) {
        finalStartTime.setDate(finalStartTime.getDate() + 1);
      }
    } else {
      return;
    }

    // QuickPick for recurrence
    const recurrenceItems: { label: string; description: string; type: RecurrenceType }[] = [
      { label: '単発 (Once)', description: '今回のみ (デフォルト)', type: 'once' },
      { label: '毎週 (Weekly)', description: '毎週同じ曜日に繰り返し', type: 'weekly' },
      { label: '平日 (Weekdays)', description: '月曜〜金曜日に繰り返し', type: 'weekdays' }
    ];

    const selectedRecurrence = await vscode.window.showQuickPick(recurrenceItems, {
      placeHolder: '繰り返し設定を選択してください'
    });

    if (!selectedRecurrence) {
      return;
    }

    const recurrence: RecurrenceType = selectedRecurrence.type;
    const validationNow = new Date();
    if (parsed.endTime) {
      if (parsed.startTime) {
        const duration = parsed.endTime.getTime() - parsed.startTime.getTime();
        while (new Date(finalStartTime.getTime() + duration).getTime() <= validationNow.getTime()) {
          finalStartTime.setDate(finalStartTime.getDate() + 1);
        }
      } else {
        while (parsed.endTime.getTime() <= validationNow.getTime()) {
          finalStartTime.setDate(finalStartTime.getDate() + 1);
          parsed.endTime.setDate(parsed.endTime.getDate() + 1);
        }
      }
    } else {
      while (finalStartTime.getTime() + 30 * 60 * 1000 <= validationNow.getTime()) {
        finalStartTime.setDate(finalStartTime.getDate() + 1);
      }
    }

    if (recurrence === 'weekdays') {
      while (finalStartTime.getDay() === 0 || finalStartTime.getDay() === 6) {
        finalStartTime.setDate(finalStartTime.getDate() + 1);
      }
    }

    let finalEndTime: Date | undefined;
    if (parsed.startTime && parsed.endTime) {
      const duration = parsed.endTime.getTime() - parsed.startTime.getTime();
      finalEndTime = new Date(finalStartTime.getTime() + duration);
    } else if (parsed.endTime) {
      finalEndTime = parsed.endTime;
    }

    const newMeeting: Meeting = {
      id: String(Date.now()) + Math.random().toString(36).substring(2, 7),
      title: finalTitle,
      url: finalUrl,
      startTime: finalStartTime.toISOString(),
      endTime: finalEndTime?.toISOString(),
      recurrence
    };

    await this.meetingManager.addMeeting(newMeeting);
    vscode.window.showInformationMessage(`MeetDock: 「${newMeeting.title}」を登録しました。`);
  }
}
