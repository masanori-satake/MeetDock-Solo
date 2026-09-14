import * as vscode from 'vscode';
import * as fs from 'fs';
import { getNextOccurrence, MeetingManager } from './meetingManager';
import { Meeting, RecurrenceType } from './types';
import { parseMeetingText } from './parser';
import { parseIcsContent } from './icsParser';
import { getTeamsChatUrl, isValidTeamsUrl } from './urlValidator';
import { t, MeetingStatusState } from './i18n';
import { addZonedDays, createDateInTimeZone, getZonedDateParts } from './dateTime';

function formatDuration(start: Date, end: Date): string {
  const durationMs = Math.max(0, end.getTime() - start.getTime());
  const totalMinutes = Math.floor(durationMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return t.duration(hours, minutes);
}

function isSameCalendarDate(start: Date, end: Date): boolean {
  return start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
    && start.getDate() === end.getDate();
}

function formatEndDateTime(start: Date, end: Date, includeYear: boolean): string {
  const endHHmm = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  if (isSameCalendarDate(start, end)) {
    return endHHmm;
  }

  const endMonth = String(end.getMonth() + 1).padStart(2, '0');
  const endDay = String(end.getDate()).padStart(2, '0');
  return includeYear
    ? `${end.getFullYear()}/${endMonth}/${endDay} ${endHHmm}`
    : `${end.getMonth() + 1}/${end.getDate()} ${endHHmm}`;
}

export function getMeetingStatusState(meeting: Meeting, now: Date = new Date()): MeetingStatusState {
  const start = new Date(meeting.startTime);
  const end = meeting.endTime
    ? new Date(meeting.endTime)
    : new Date(start.getTime() + 30 * 60 * 1000);
  const diffMs = start.getTime() - now.getTime();

  if (now >= start && now < end) {
    return 'ongoing';
  } else if (diffMs > 0 && diffMs < 60 * 1000) {
    return 'startingSoon';
  } else if (diffMs > 0 && diffMs <= 5 * 60 * 1000) {
    return 'warning';
  }
  return 'normal';
}

export class MeetingTreeItem extends vscode.TreeItem {
  public readonly meeting: Meeting;

  constructor(meeting: Meeting, now: Date = new Date()) {
    const startTimeDate = new Date(meeting.startTime);
    const endTimeDate = meeting.endTime
      ? new Date(meeting.endTime)
      : new Date(startTimeDate.getTime() + 30 * 60 * 1000);

    const startHHmm = startTimeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const descriptionEnd = formatEndDateTime(startTimeDate, endTimeDate, false);
    const detailedEnd = formatEndDateTime(startTimeDate, endTimeDate, true);
    const dateStr = `${startTimeDate.getMonth() + 1}/${startTimeDate.getDate()}`;
    const durationStr = formatDuration(startTimeDate, endTimeDate);

    const recurrenceSuffix = t.recurrenceSuffix(meeting);
    const organizerStr = meeting.organizer ? t.organizerSuffix(meeting.organizer) : '';

    const statusState = getMeetingStatusState(meeting, now);
    const statusSuffix = t.statusSuffix(statusState, startTimeDate, now);

    super(meeting.title, vscode.TreeItemCollapsibleState.Collapsed);

    this.meeting = meeting;
    this.description = `${dateStr} ${startHHmm}-${descriptionEnd} (${durationStr})${organizerStr}${recurrenceSuffix}${statusSuffix}`;
    const yyyy = startTimeDate.getFullYear();
    const mm = String(startTimeDate.getMonth() + 1).padStart(2, '0');
    const dd = String(startTimeDate.getDate()).padStart(2, '0');
    this.tooltip = `${meeting.title}\n${t.timeLabel(yyyy, mm, dd, startHHmm, detailedEnd, durationStr)}${meeting.organizer ? `\n${t.organizerLabel(meeting.organizer)}` : ''}\n${t.recurrenceLabel(meeting)}\nURL: ${meeting.url}`;

    if (statusState === 'ongoing') {
      this.iconPath = new vscode.ThemeIcon('radio-tower', new vscode.ThemeColor('charts.green'));
    } else if (statusState === 'startingSoon') {
      this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
    } else if (statusState === 'warning') {
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
    } else {
      const iconName = meeting.recurrence === 'once' ? 'calendar' : 'sync';
      this.iconPath = new vscode.ThemeIcon(iconName);
    }
    const hasChat = getTeamsChatUrl(meeting.url) !== undefined;
    this.contextValue = hasChat ? 'meetingItemWithChat' : 'meetingItem';
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
  dropMimeTypes = ['text/calendar', 'application/ics', 'text/plain', 'text/html', 'text/uri-list'];
  dragMimeTypes = [];

  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private statusTimer: NodeJS.Timeout | undefined;
  private lastStatusStates: Map<string, MeetingStatusState> = new Map();

  constructor(
    private meetingManager: MeetingManager,
    private readonly now: () => Date = () => new Date()
  ) {
    this.meetingManager.onDidChangeMeetings(() => {
      this.refresh();
    });
    this.refresh();
    this.startStatusCheckTimer();
  }

  public startStatusCheckTimer(): void {
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
    }
    this.statusTimer = setInterval(() => {
      this.checkStatusChange();
    }, 10000);
  }

  public stopStatusCheckTimer(): void {
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = undefined;
    }
  }

  public dispose(): void {
    this.stopStatusCheckTimer();
  }

  public checkStatusChange(): void {
    const meetings = this.meetingManager.getSortedMeetings();
    const now = this.now();
    let hasStateChange = false;
    const currentMap = new Map<string, MeetingStatusState>();

    for (const m of meetings) {
      const state = getMeetingStatusState(m, now);
      currentMap.set(m.id, state);

      const prevState = this.lastStatusStates.get(m.id);
      if (prevState !== state) {
        hasStateChange = true;
      }
    }

    if (this.lastStatusStates.size !== currentMap.size) {
      hasStateChange = true;
    }

    this.lastStatusStates = currentMap;

    if (hasStateChange) {
      this.refresh();
    }
  }

  refresh(): void {
    const meetings = this.meetingManager.getSortedMeetings();
    const now = this.now();
    this.lastStatusStates = new Map(meetings.map(m => [m.id, getMeetingStatusState(m, now)]));
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (!element) {
      const meetings = this.meetingManager.getSortedMeetings();
      const currentDate = this.now();
      return meetings.map(m => new MeetingTreeItem(m, currentDate));
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
      const detailedEnd = formatEndDateTime(start, end, true);
      items.push(new MeetingDetailItem(t.timeLabel(yyyy, mm, dd, startHHmm, detailedEnd, durationStr), 'clock'));

      // 2. Organizer detail item (if present)
      if (m.organizer) {
        items.push(new MeetingDetailItem(t.organizerLabel(m.organizer), 'person'));
      }

      // 3. Recurrence detail item
      const recIcon = m.recurrence === 'once' ? 'calendar' : 'sync';
      items.push(new MeetingDetailItem(t.recurrenceLabel(m), recIcon));

      return items;
    }

    return [];
  }

  async handleDrop(target: vscode.TreeItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    let droppedText = '';

    const calItem = dataTransfer.get('text/calendar') || dataTransfer.get('application/ics');
    if (calItem) {
      droppedText = await calItem.asString();
    } else {
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
    }

    if (!droppedText || !droppedText.trim()) {
      return;
    }

    // If droppedText contains file URI(s) or file path, read file content from disk
    let icsContent = droppedText;
    if (/^file:\/\//i.test(droppedText.trim()) || droppedText.trim().endsWith('.ics')) {
      const uriLines = droppedText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of uriLines) {
        let filePath = line;
        if (line.startsWith('file://')) {
          try {
            filePath = vscode.Uri.parse(line).fsPath;
          } catch {
            filePath = line.replace(/^file:\/\//i, '');
          }
        }
        if (filePath.endsWith('.ics') && fs.existsSync(filePath)) {
          try {
            icsContent = fs.readFileSync(filePath, 'utf-8');
            break;
          } catch {
            // ignore failure, fallback to droppedText
          }
        }
      }
    }

    // Check if dropped content is an ICS file format or contains BEGIN:VCALENDAR
    const isIcs = /BEGIN:VCALENDAR/i.test(icsContent) || /BEGIN:VEVENT/i.test(icsContent);
    if (isIcs) {
      try {
        const now = this.now();
        const parsedMeetings = parseIcsContent(icsContent, now);

        if (parsedMeetings.length === 0) {
          vscode.window.showWarningMessage(t.icsWarningNoEvents());
          return;
        }

        let addedCount = 0;
        let missingUrlCount = 0;

        for (const info of parsedMeetings) {
          if (!info.url || !isValidTeamsUrl(info.url)) {
            missingUrlCount++;
            continue;
          }

          const duration = info.startTime && info.endTime
            ? info.endTime.getTime() - info.startTime.getTime()
            : 30 * 60 * 1000;

          const newMeeting: Meeting = {
            id: String(Date.now()) + Math.random().toString(36).substring(2, 7),
            title: info.title || 'Teams Meeting',
            url: info.url,
            startTime: (info.startTime || now).toISOString(),
            endTime: info.endTime ? info.endTime.toISOString() : new Date((info.startTime || now).getTime() + duration).toISOString(),
            timeZone: info.timeZone,
            recurrence: info.recurrence || 'once',
            recurrenceInterval: info.recurrenceInterval,
            daysOfWeek: info.daysOfWeek,
            dayOfMonth: info.dayOfMonth,
            monthOfYear: info.monthOfYear,
            dayOfYear: info.dayOfYear,
            recurrenceEndDate: info.recurrenceEndDate ? info.recurrenceEndDate.toISOString() : undefined,
            organizer: info.organizer,
            meetingId: info.meetingId,
            passcode: info.passcode,
            isEnterprise: info.isEnterprise,
            uid: info.uid,
            sequence: info.sequence,
            status: info.status,
            location: info.location,
            description: info.description,
            attendees: info.attendees,
            alarmMinutes: info.alarmMinutes,
          };

          await this.meetingManager.addMeeting(newMeeting);
          addedCount++;
        }

        if (addedCount > 0) {
          vscode.window.showInformationMessage(t.icsSuccess(addedCount));
        } else if (missingUrlCount > 0) {
          vscode.window.showWarningMessage(t.icsWarningNoUrl());
        }
      } catch (err) {
        vscode.window.showErrorMessage(t.icsErrorParseFailed());
      }
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

    const now = this.now();
    let defaultTimeStr = '';
    if (parsed.startTime) {
      const startParts = getZonedDateParts(parsed.startTime, parsed.timeZone);
      const yyyy = startParts.year;
      const mm = String(startParts.month + 1).padStart(2, '0');
      const dd = String(startParts.day).padStart(2, '0');
      const hh = String(startParts.hour).padStart(2, '0');
      const min = String(startParts.minute).padStart(2, '0');
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
        finalStartTime = createDateInTimeZone(year, month, day, hour, minute, 0, 0, parsed.timeZone);
      } else {
        const nowParts = getZonedDateParts(now, parsed.timeZone);
        finalStartTime = createDateInTimeZone(nowParts.year, nowParts.month, nowParts.day, hour, minute, 0, 0, parsed.timeZone);
      }
    } else {
      return;
    }

    const defaultRecurrence = parsed.recurrence || 'once';
    const recurrenceItems: { label: string; description: string; type: RecurrenceType }[] = [
      { label: t.recurrenceOnceLabel(defaultRecurrence === 'once'), description: t.recurrenceOnceDesc(), type: 'once' },
      { label: t.recurrenceDailyLabel(defaultRecurrence === 'daily'), description: t.recurrenceDailyDesc(), type: 'daily' },
      { label: t.recurrenceWeeklyLabel(defaultRecurrence === 'weekly'), description: t.recurrenceWeeklyDesc(), type: 'weekly' },
      { label: t.recurrenceWeekdaysLabel(defaultRecurrence === 'weekdays'), description: t.recurrenceWeekdaysDesc(), type: 'weekdays' },
      { label: t.recurrenceMonthlyLabel(defaultRecurrence === 'monthly'), description: t.recurrenceMonthlyDesc(), type: 'monthly' },
      { label: t.recurrenceYearlyLabel(defaultRecurrence === 'yearly'), description: t.recurrenceYearlyDesc(), type: 'yearly' }
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
    const validationNow = this.now();
    const duration = parsed.startTime && parsed.endTime
      ? parsed.endTime.getTime() - parsed.startTime.getTime()
      : 30 * 60 * 1000;
    const selectedStartParts = getZonedDateParts(finalStartTime, parsed.timeZone);

    const recurrenceFields: Partial<Meeting> = recurrence === 'once'
      ? {}
      : {
          recurrenceInterval: 1,
          recurrenceEndDate: parsed.recurrenceEndDate?.toISOString(),
          ...(recurrence === 'weekly' ? {
            daysOfWeek: parsed.recurrence === 'weekly' && parsed.daysOfWeek?.length
              ? parsed.daysOfWeek
              : [selectedStartParts.dayOfWeek],
          } : {}),
          ...(recurrence === 'monthly' ? {
            dayOfMonth: parsed.recurrence === 'monthly' && parsed.dayOfMonth
              ? parsed.dayOfMonth
              : selectedStartParts.day,
          } : {}),
          ...(recurrence === 'yearly' ? {
            monthOfYear: parsed.recurrence === 'yearly' && parsed.monthOfYear
              ? parsed.monthOfYear
              : selectedStartParts.month + 1,
            dayOfYear: parsed.recurrence === 'yearly' && parsed.dayOfYear
              ? parsed.dayOfYear
              : selectedStartParts.day,
          } : {}),
        };

    const occurrenceTemplate: Meeting = {
      id: '',
      title: finalTitle,
      url: finalUrl,
      startTime: finalStartTime.toISOString(),
      endTime: new Date(finalStartTime.getTime() + duration).toISOString(),
      timeZone: parsed.timeZone,
      recurrence,
      ...recurrenceFields,
    };

    if (recurrence === 'once') {
      while (finalStartTime.getTime() + duration <= validationNow.getTime()) {
        finalStartTime = addZonedDays(finalStartTime, 1, parsed.timeZone);
      }
    } else {
      const nextOccurrence = getNextOccurrence(occurrenceTemplate, new Date(validationNow.getTime() + 1));
      if (nextOccurrence) {
        finalStartTime = nextOccurrence;
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
      timeZone: parsed.timeZone,
      recurrence,
      ...recurrenceFields,
      organizer: parsed.organizer,
      meetingId: parsed.meetingId,
      passcode: parsed.passcode,
      isEnterprise: parsed.isEnterprise,
    };

    await this.meetingManager.addMeeting(newMeeting);
    vscode.window.showInformationMessage(t.meetingSaved(newMeeting.title));
  }
}
