import * as vscode from 'vscode';
import { MeetingManager } from './meetingManager';
import { Meeting, RecurrenceType } from './types';
import { parseMeetingText } from './parser';
import { isValidTeamsUrl } from './urlValidator';
import { t } from './i18n';

function formatDuration(start: Date, end: Date): string {
  const durationMs = Math.max(0, end.getTime() - start.getTime());
  const totalMinutes = Math.floor(durationMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return t.duration(hours, minutes);
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

    const recurrenceSuffix = t.recurrenceSuffix(meeting.recurrence);
    const organizerStr = meeting.organizer ? t.organizerSuffix(meeting.organizer) : '';

    super(meeting.title, vscode.TreeItemCollapsibleState.Collapsed);

    this.meeting = meeting;
    this.description = `${dateStr} ${startHHmm}-${endHHmm} (${durationStr})${organizerStr}${recurrenceSuffix}`;
    const yyyy = startTimeDate.getFullYear();
    const mm = String(startTimeDate.getMonth() + 1).padStart(2, '0');
    const dd = String(startTimeDate.getDate()).padStart(2, '0');
    this.tooltip = `${meeting.title}\n${t.timeLabel(yyyy, mm, dd, startHHmm, endHHmm, durationStr)}${meeting.organizer ? `\n${t.organizerLabel(meeting.organizer)}` : ''}\n${t.recurrenceLabel(meeting.recurrence)}\nURL: ${meeting.url}`;

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
      items.push(new MeetingDetailItem(t.timeLabel(yyyy, mm, dd, startHHmm, endHHmm, durationStr), 'clock'));

      // 2. Organizer detail item (if present)
      if (m.organizer) {
        items.push(new MeetingDetailItem(t.organizerLabel(m.organizer), 'person'));
      }

      // 3. Recurrence detail item
      const recIcon = m.recurrence === 'once' ? 'calendar' : 'sync';
      items.push(new MeetingDetailItem(t.recurrenceLabel(m.recurrence), recIcon));

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
        prompt: t.urlPrompt(),
        placeHolder: t.urlPlaceholder(),
        validateInput: (val) => isValidTeamsUrl(val.trim()) ? null : t.urlInvalid()
      });
      if (!inputUrl) {
        return;
      }
      finalUrl = inputUrl.trim();
    }

    let finalTitle = parsed.title;
    const inputTitle = await vscode.window.showInputBox({
      prompt: t.titlePrompt(),
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
      prompt: t.timePrompt(),
      value: defaultTimeStr,
      validateInput: (val) => {
        if (!val || !val.trim()) {
          return t.timeRequired();
        }
        const timeRegex = /^(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s+)?(\d{1,2}):(\d{2})$/;
        if (!timeRegex.test(val.trim())) {
          return t.timeInvalid();
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
      { label: t.recurrenceOnceLabel(defaultRecurrence === 'once'), description: t.recurrenceOnceDesc(), type: 'once' },
      { label: t.recurrenceWeeklyLabel(defaultRecurrence === 'weekly'), description: t.recurrenceWeeklyDesc(), type: 'weekly' },
      { label: t.recurrenceWeekdaysLabel(defaultRecurrence === 'weekdays'), description: t.recurrenceWeekdaysDesc(), type: 'weekdays' }
    ];

    if (defaultRecurrence !== 'once') {
      const idx = recurrenceItems.findIndex(item => item.type === defaultRecurrence);
      if (idx > 0) {
        const [item] = recurrenceItems.splice(idx, 1);
        recurrenceItems.unshift(item);
      }
    }

    const selectedRecurrence = await vscode.window.showQuickPick(recurrenceItems, {
      placeHolder: t.recurrencePlaceholder()
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
    vscode.window.showInformationMessage(t.meetingSaved(newMeeting.title));
  }
}
