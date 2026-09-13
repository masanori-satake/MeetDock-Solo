import * as vscode from 'vscode';
import { MeetingManager } from './meetingManager';
import { Meeting, RecurrenceType } from './types';
import { parseMeetingText } from './parser';
import { isValidTeamsUrl } from './urlValidator';

function formatDuration(start: Date, end: Date): string {
  const durationMs = Math.max(0, end.getTime() - start.getTime());
  const totalMinutes = Math.floor(durationMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours}時間${minutes}分`;
  } else if (hours > 0) {
    return `${hours}時間`;
  } else {
    return `${minutes}分`;
  }
}

export class MeetingTreeItem extends vscode.TreeItem {
  public readonly meeting: Meeting;

  constructor(meeting: Meeting) {
    const startTimeDate = new Date(meeting.startTime);
    const endTimeDate = meeting.endTime
      ? new Date(meeting.endTime)
      : new Date(startTimeDate.getTime() + 30 * 60 * 1000);

    const startHHmm = startTimeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const endHHmm = endTimeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = `${startTimeDate.getMonth() + 1}/${startTimeDate.getDate()}`;
    const durationStr = formatDuration(startTimeDate, endTimeDate);

    let recurrenceSuffix = '';
    if (meeting.recurrence === 'weekly') {
      recurrenceSuffix = ' [毎週]';
    } else if (meeting.recurrence === 'weekdays') {
      recurrenceSuffix = ' [平日]';
    }

    const organizerStr = meeting.organizer ? ` [主催: ${meeting.organizer}]` : '';

    super(meeting.title, vscode.TreeItemCollapsibleState.Collapsed);

    this.meeting = meeting;
    this.description = `${dateStr} ${startHHmm}-${endHHmm} (${durationStr})${organizerStr}${recurrenceSuffix}`;
    this.tooltip = `会議名: ${meeting.title}\n時間: ${startTimeDate.toLocaleString()} - ${endHHmm} (${durationStr})${meeting.organizer ? `\n主催者: ${meeting.organizer}` : ''}\n繰り返し: ${meeting.recurrence}\nURL: ${meeting.url}`;

    const iconName = meeting.recurrence === 'once' ? 'calendar' : 'sync';
    this.iconPath = new vscode.ThemeIcon(iconName);
    this.contextValue = 'meetingItem';
  }
}

export class MeetingDetailItem extends vscode.TreeItem {
  constructor(label: string, iconName: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(iconName);
    this.contextValue = 'meetingDetailItem';
  }
}

export class MeetingTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.TreeDragAndDropController<vscode.TreeItem> {
  dropMimeTypes = ['text/plain', 'text/html', 'text/uri-list'];
  dragMimeTypes = [];

  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private meetingManager: MeetingManager) {
    this.meetingManager.onDidChangeMeetings(() => {
      this.refresh();
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (!element) {
      const meetings = this.meetingManager.getSortedMeetings();
      return meetings.map(m => new MeetingTreeItem(m));
    }

    if (element instanceof MeetingTreeItem) {
      const m = element.meeting;
      const start = new Date(m.startTime);
      const end = m.endTime ? new Date(m.endTime) : new Date(start.getTime() + 30 * 60 * 1000);
      const durationStr = formatDuration(start, end);

      const items: vscode.TreeItem[] = [];

      // 1. Time & Duration detail item
      const yyyy = start.getFullYear();
      const mm = String(start.getMonth() + 1).padStart(2, '0');
      const dd = String(start.getDate()).padStart(2, '0');
      const startHHmm = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      const endHHmm = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      items.push(new MeetingDetailItem(`時間: ${yyyy}/${mm}/${dd} ${startHHmm} - ${endHHmm} (${durationStr})`, 'clock'));

      // 2. Organizer detail item (if present)
      if (m.organizer) {
        items.push(new MeetingDetailItem(`主催者: ${m.organizer}`, 'person'));
      }

      // 3. Recurrence detail item
      let recStr = '単発 (1回のみ)';
      if (m.recurrence === 'weekly') {
        recStr = '繰り返し (毎週)';
      } else if (m.recurrence === 'weekdays') {
        recStr = '繰り返し (平日)';
      }
      const recIcon = m.recurrence === 'once' ? 'calendar' : 'sync';
      items.push(new MeetingDetailItem(`繰り返し: ${recStr}`, recIcon));

      return items;
    }

    return [];
  }

  async handleDrop(target: vscode.TreeItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    let droppedText = '';

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
        validateInput: (val) => isValidTeamsUrl(val.trim()) ? null : '有効な Teams URL を入力してください。'
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

      if (parsed.startTime && parsed.endTime) {
        const duration = parsed.endTime.getTime() - parsed.startTime.getTime();
        while (new Date(st.getTime() + duration).getTime() <= now.getTime()) {
          st.setDate(st.getDate() + 1);
        }
      } else {
        while (st.getTime() + 30 * 60 * 1000 <= now.getTime()) {
          st.setDate(st.getDate() + 1);
        }
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

      if (parsed.startTime && parsed.endTime) {
        const duration = parsed.endTime.getTime() - parsed.startTime.getTime();
        while (new Date(finalStartTime.getTime() + duration).getTime() <= now.getTime()) {
          finalStartTime.setDate(finalStartTime.getDate() + 1);
        }
      } else {
        while (finalStartTime.getTime() + 30 * 60 * 1000 <= now.getTime()) {
          finalStartTime.setDate(finalStartTime.getDate() + 1);
        }
      }
    } else {
      return;
    }

    const defaultRecurrence = parsed.recurrence || 'once';
    const recurrenceItems: { label: string; description: string; type: RecurrenceType }[] = [
      { label: defaultRecurrence === 'once' ? '単発 (Once) [パース結果]' : '単発 (Once)', description: '今回のみ', type: 'once' },
      { label: defaultRecurrence === 'weekly' ? '毎週 (Weekly) [パース結果]' : '毎週 (Weekly)', description: '毎週同じ曜日に繰り返し', type: 'weekly' },
      { label: defaultRecurrence === 'weekdays' ? '平日 (Weekdays) [パース結果]' : '平日 (Weekdays)', description: '月曜〜金曜日に繰り返し', type: 'weekdays' }
    ];

    if (defaultRecurrence !== 'once') {
      const idx = recurrenceItems.findIndex(item => item.type === defaultRecurrence);
      if (idx > 0) {
        const [item] = recurrenceItems.splice(idx, 1);
        recurrenceItems.unshift(item);
      }
    }

    const selectedRecurrence = await vscode.window.showQuickPick(recurrenceItems, {
      placeHolder: '繰り返し設定を選択してください'
    });

    if (!selectedRecurrence) {
      return;
    }

    const recurrence: RecurrenceType = selectedRecurrence.type;
    const validationNow = new Date();
    if (parsed.startTime && parsed.endTime) {
      const duration = parsed.endTime.getTime() - parsed.startTime.getTime();
      while (new Date(finalStartTime.getTime() + duration).getTime() <= validationNow.getTime()) {
        finalStartTime.setDate(finalStartTime.getDate() + 1);
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
      recurrence,
      organizer: parsed.organizer,
      meetingId: parsed.meetingId,
      passcode: parsed.passcode,
      isEnterprise: parsed.isEnterprise,
    };

    await this.meetingManager.addMeeting(newMeeting);
    vscode.window.showInformationMessage(`MeetDock: 「${newMeeting.title}」を登録しました。`);
  }
}
