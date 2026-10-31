import * as vscode from 'vscode';
import { getNextOccurrence, MeetingManager } from './meetingManager';
import { Meeting, RecurrenceType } from './types';
import { parseMeetingText } from './parser';
import { parseIcsContent } from './icsParser';
import { getTeamsChatUrl, isValidTeamsUrl } from './urlValidator';
import { t, MeetingStatusState } from './i18n';
import { addZonedDays, createDateInTimeZone, getZonedDateParts } from './dateTime';
import { decodeIcsBytes, IcsContentTooLargeError, readIcsFile } from './icsContentReader';

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
  constructor(label: string, iconName: string, command?: vscode.Command, contextValue: string = 'meetingDetailItem') {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(iconName);
    this.contextValue = contextValue;
    if (command) {
      this.command = command;
    }
  }
}

async function readDataTransferFile(file: vscode.DataTransferFile): Promise<string> {
  if (file.uri && file.uri.scheme === 'file') {
    try {
      return await readIcsFile(file.uri.fsPath);
    } catch (error) {
      if (error instanceof IcsContentTooLargeError) {
        throw error;
      }
      // fallback to file.data()
    }
  }
  const bytes = await file.data();
  return decodeIcsBytes(bytes);
}

export class MeetingTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.TreeDragAndDropController<vscode.TreeItem> {
  dropMimeTypes = ['files', 'text/calendar', 'text/x-vcalendar', 'application/ics', 'text/plain', 'text/html', 'text/uri-list'];
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
    const now = this.now();
    const meetings = this.meetingManager.getSortedMeetings(now);
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
    const now = this.now();
    const meetings = this.meetingManager.getSortedMeetings(now);
    this.lastStatusStates = new Map(meetings.map(m => [m.id, getMeetingStatusState(m, now)]));
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (!element) {
      const currentDate = this.now();
      const meetings = this.meetingManager.getSortedMeetings(currentDate);
      if (meetings.length === 0) {
        const dropHintItem = new vscode.TreeItem(
          t.dropZoneHint(),
          vscode.TreeItemCollapsibleState.None
        );
        dropHintItem.iconPath = new vscode.ThemeIcon('file-add');
        dropHintItem.tooltip = t.dropZoneTooltip();
        dropHintItem.contextValue = 'emptyDropHintItem';
        return [dropHintItem];
      }
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
      items.push(new MeetingDetailItem(
        t.recurrenceLabel(m),
        recIcon,
        {
          command: 'meetdock-solo.editRecurrence',
          title: t.editRecurrenceCommandTitle(),
          arguments: [m]
        },
        'recurrenceDetailItem'
      ));

      return items;
    }

    return [];
  }

  async handleDrop(target: vscode.TreeItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    // 1. Collect all dropped files (from 'files' mime and dataTransfer iteration)
    type FileCandidate = {
      key: string;
      name: string;
      isIcs: boolean;
      getContent: () => Promise<string>;
    };

    const candidates: FileCandidate[] = [];
    const seenCandidateKeys = new Set<string>();

    const getCandidateKey = (uri?: vscode.Uri, name?: string): string => {
      if (uri) {
        return uri.scheme === 'file' ? uri.fsPath : uri.toString();
      }
      return name ? `name:${name}` : `anon:${Math.random()}`;
    };

    const addDataTransferFile = (file: vscode.DataTransferFile) => {
      const key = getCandidateKey(file.uri, file.name);
      if (seenCandidateKeys.has(key)) {
        return;
      }
      seenCandidateKeys.add(key);

      const fileName = (file.name || file.uri?.fsPath || '').toLowerCase();
      const isIcs = fileName.endsWith('.ics') || fileName.endsWith('.ical');
      candidates.push({
        key,
        name: file.name || file.uri?.fsPath || 'unknown',
        isIcs,
        getContent: async () => readDataTransferFile(file)
      });
    };

    const filesItem = dataTransfer.get('files');
    if (filesItem) {
      const file = filesItem.asFile();
      if (file) {
        addDataTransferFile(file);
      }
    }

    if (typeof (dataTransfer as any)[Symbol.iterator] === 'function') {
      try {
        for (const [, item] of dataTransfer) {
          const file = item?.asFile ? item.asFile() : undefined;
          if (file) {
            addDataTransferFile(file);
          }
        }
      } catch {
        // ignore iteration error
      }
    }

    // 2. Check uri-list or text for file URIs
    let uriListText = '';
    const uriItem = dataTransfer.get('text/uri-list');
    if (uriItem) {
      try {
        uriListText = await uriItem.asString();
      } catch {
        // ignore
      }
    }

    // Collect file paths / URIs from text/uri-list if present
    const uriLines = uriListText
      ? uriListText.split(/\r?\n/).map(l => l.trim().replace(/^["']|["']$/g, '')).filter(l => Boolean(l) && !l.startsWith('#'))
      : [];

    for (const line of uriLines) {
      let filePath = line;
      let uriKey = line;
      if (line.startsWith('file://')) {
        try {
          const parsedUri = vscode.Uri.parse(line);
          filePath = parsedUri.fsPath;
          uriKey = filePath;
        } catch {
          filePath = line.replace(/^file:\/\//i, '');
          uriKey = filePath;
        }
      }

      if (!seenCandidateKeys.has(uriKey)) {
        seenCandidateKeys.add(uriKey);
        const lowerPath = filePath.toLowerCase();
        const isIcs = lowerPath.endsWith('.ics') || lowerPath.endsWith('.ical');
        candidates.push({
          key: uriKey,
          name: filePath,
          isIcs,
          getContent: async () => readIcsFile(filePath)
        });
      }
    }

    const isFileDrop = candidates.length > 0;

    if (isFileDrop) {
      const totalFileCount = candidates.length;
      const icsCandidates = candidates.filter(c => c.isIcs);

      if (totalFileCount > 0 && icsCandidates.length === 0) {
        vscode.window.showWarningMessage(t.icsNoIcsFilesFound(totalFileCount));
        return;
      }

      const now = this.now();
      const existingMeetings = this.meetingManager.getMeetings();
      const knownUidStarts = new Set(
        existingMeetings.filter(m => m.uid).map(m => `${m.uid}__${m.startTime}`)
      );
      const knownTitleStartUrls = new Set(
        existingMeetings.map(m => `${m.title}__${m.startTime}__${m.url}`)
      );

      const meetingsToAdd: Meeting[] = [];
      let missingUrlCount = 0;
      let parseFailedCount = 0;
      let noEventsCount = 0;

      for (const icsCandidate of icsCandidates) {
        let content = '';
        try {
          content = await icsCandidate.getContent();
        } catch {
          parseFailedCount++;
          continue;
        }

        if (!content || !content.trim()) {
          noEventsCount++;
          continue;
        }

        try {
          const parsedMeetings = parseIcsContent(content, now);
          if (parsedMeetings.length === 0) {
            noEventsCount++;
            continue;
          }

          let fileAddedAny = false;
          let fileMissingUrl = 0;

          for (const info of parsedMeetings) {
            if (!info.url || !isValidTeamsUrl(info.url)) {
              fileMissingUrl++;
              continue;
            }

            const duration = info.startTime && info.endTime
              ? info.endTime.getTime() - info.startTime.getTime()
              : 30 * 60 * 1000;
            const startTime = (info.startTime || now).toISOString();
            const title = info.title || 'Teams Meeting';

            // Duplicate checks:
            // 1. With UID: matches uid and startTime
            if (info.uid) {
              if (knownUidStarts.has(`${info.uid}__${startTime}`)) {
                continue;
              }
            } else {
              // 2. Without UID: fallback matches title, startTime, and url
              if (knownTitleStartUrls.has(`${title}__${startTime}__${info.url}`)) {
                continue;
              }
            }

            const newMeeting: Meeting = {
              id: String(Date.now()) + Math.random().toString(36).substring(2, 7),
              title,
              url: info.url,
              startTime,
              endTime: info.endTime ? info.endTime.toISOString() : new Date((info.startTime || now).getTime() + duration).toISOString(),
              timeZone: info.timeZone,
              recurrence: info.recurrence || 'once',
              recurrenceInterval: info.recurrenceInterval,
              daysOfWeek: info.daysOfWeek,
              dayOfMonth: info.dayOfMonth,
              monthOfYear: info.monthOfYear,
              dayOfYear: info.dayOfYear,
              recurrenceByDay: info.recurrenceByDay,
              recurrenceByMonthDay: info.recurrenceByMonthDay,
              recurrenceByMonth: info.recurrenceByMonth,
              recurrenceBySetPos: info.recurrenceBySetPos,
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

            meetingsToAdd.push(newMeeting);
            if (newMeeting.uid) {
              knownUidStarts.add(`${newMeeting.uid}__${startTime}`);
            }
            knownTitleStartUrls.add(`${title}__${startTime}__${info.url}`);
            fileAddedAny = true;
          }

          if (!fileAddedAny && fileMissingUrl > 0) {
            missingUrlCount++;
          }
        } catch {
          parseFailedCount++;
        }
      }

      // Add all gathered meetings to MeetingManager individually
      let totalAddedCount = 0;
      let saveFailedCount = 0;

      for (const meeting of meetingsToAdd) {
        try {
          await this.meetingManager.addMeeting(meeting);
          totalAddedCount++;
        } catch {
          saveFailedCount++;
        }
      }

      // Notifications
      if (totalAddedCount > 0) {
        vscode.window.showInformationMessage(
          t.icsMultiFileSuccess(totalFileCount, icsCandidates.length, totalAddedCount)
        );
        if (parseFailedCount > 0) {
          vscode.window.showWarningMessage(t.icsPartialFailureWarning(parseFailedCount));
        }
        if (saveFailedCount > 0) {
          vscode.window.showWarningMessage(t.icsSaveFailureWarning(saveFailedCount));
        }
      } else if (parseFailedCount > 0) {
        vscode.window.showErrorMessage(t.icsErrorParseFailed());
      } else if (saveFailedCount > 0) {
        vscode.window.showErrorMessage(t.icsSaveFailureWarning(saveFailedCount));
      } else if (missingUrlCount > 0) {
        vscode.window.showWarningMessage(t.icsWarningNoUrl());
      } else if (noEventsCount > 0) {
        vscode.window.showWarningMessage(t.icsWarningNoEvents());
      } else {
        vscode.window.showInformationMessage(t.icsAlreadyRegistered());
      }
      return;
    }

    // 3. Fallback for raw text / single calendar text drop
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
        } else if (uriItem) {
          droppedText = await uriItem.asString();
        }
      }
    }

    if (!droppedText || !droppedText.trim()) {
      return;
    }

    // If droppedText contains raw BEGIN:VCALENDAR or BEGIN:VEVENT
    let icsContent = droppedText;
    const cleanText = droppedText.trim().replace(/^["']|["']$/g, '');
    if (/^file:\/\//i.test(cleanText) || cleanText.endsWith('.ics')) {
      const lines = droppedText.split(/\r?\n/).map(l => l.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      for (const line of lines) {
        let filePath = line;
        if (line.startsWith('file://')) {
          try {
            filePath = vscode.Uri.parse(line).fsPath;
          } catch {
            filePath = line.replace(/^file:\/\//i, '');
          }
        }
        if (filePath.endsWith('.ics')) {
          try {
            icsContent = await readIcsFile(filePath);
            break;
          } catch {
            // ignore
          }
        }
      }
    }

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
        const existingMeetings = this.meetingManager.getMeetings();
        const knownUidStarts = new Set(
          existingMeetings.filter(m => m.uid).map(m => `${m.uid}__${m.startTime}`)
        );
        const knownTitleStartUrls = new Set(
          existingMeetings.map(m => `${m.title}__${m.startTime}__${m.url}`)
        );

        for (const info of parsedMeetings) {
          if (!info.url || !isValidTeamsUrl(info.url)) {
            missingUrlCount++;
            continue;
          }

          const duration = info.startTime && info.endTime
            ? info.endTime.getTime() - info.startTime.getTime()
            : 30 * 60 * 1000;
          const startTime = (info.startTime || now).toISOString();
          const title = info.title || 'Teams Meeting';

          if (info.uid) {
            if (knownUidStarts.has(`${info.uid}__${startTime}`)) {
              continue;
            }
          } else {
            if (knownTitleStartUrls.has(`${title}__${startTime}__${info.url}`)) {
              continue;
            }
          }

          const newMeeting: Meeting = {
            id: String(Date.now()) + Math.random().toString(36).substring(2, 7),
            title,
            url: info.url,
            startTime,
            endTime: info.endTime ? info.endTime.toISOString() : new Date((info.startTime || now).getTime() + duration).toISOString(),
            timeZone: info.timeZone,
            recurrence: info.recurrence || 'once',
            recurrenceInterval: info.recurrenceInterval,
            daysOfWeek: info.daysOfWeek,
            dayOfMonth: info.dayOfMonth,
            monthOfYear: info.monthOfYear,
            dayOfYear: info.dayOfYear,
            recurrenceByDay: info.recurrenceByDay,
            recurrenceByMonthDay: info.recurrenceByMonthDay,
            recurrenceByMonth: info.recurrenceByMonth,
            recurrenceBySetPos: info.recurrenceBySetPos,
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

          try {
            await this.meetingManager.addMeeting(newMeeting);
            if (newMeeting.uid) {
              knownUidStarts.add(`${newMeeting.uid}__${startTime}`);
            }
            knownTitleStartUrls.add(`${title}__${startTime}__${info.url}`);
            addedCount++;
          } catch {
            // ignore save error
          }
        }

        if (addedCount > 0) {
          vscode.window.showInformationMessage(t.icsMultiFileSuccess(1, 1, addedCount));
        } else if (missingUrlCount > 0) {
          vscode.window.showWarningMessage(t.icsWarningNoUrl());
        } else {
          vscode.window.showInformationMessage(t.icsAlreadyRegistered());
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
