import * as vscode from 'vscode';
import { MeetingManager } from './meetingManager';
import { parseMeetingText } from './parser';
import { parseIcsContent } from './icsParser';
import { Meeting, RecurrenceType } from './types';
import { isValidTeamsUrl } from './urlValidator';
import { t } from './i18n';
import { addZonedDays, createDateInTimeZone, getZonedDateParts } from './dateTime';
import { readIcsFile } from './icsContentReader';

function parseIntegerInput(value: string, min: number, max = Number.MAX_SAFE_INTEGER): number | undefined {
  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function isCalendarDate(year: number, month: number, day: number, timeZone?: string): boolean {
  const date = createDateInTimeZone(year, month, day, 12, 0, 0, 0, timeZone);
  const parts = getZonedDateParts(date, timeZone);
  return parts.year === year && parts.month === month && parts.day === day;
}

/**
 * Prompts for meeting details parsed from the clipboard and saves the meeting.
 */
export async function addFromClipboardCommand(meetingManager: MeetingManager): Promise<void> {
  const clipboardText = await vscode.env.clipboard.readText();
  if (!clipboardText || !clipboardText.trim()) {
    vscode.window.showWarningMessage(t.clipboardEmpty());
    return;
  }

  const parsed = parseMeetingText(clipboardText);

  // Prompt for Teams URL
  const inputUrl = await vscode.window.showInputBox({
    prompt: t.urlPrompt(),
    value: parsed.url || '',
    placeHolder: t.urlPlaceholder(),
    validateInput: (value) => {
      if (!value || !value.trim()) {
        return t.urlRequired();
      }
      if (!isValidTeamsUrl(value.trim())) {
        return t.urlInvalid();
      }
      return null;
    }
  });

  if (!inputUrl) {
    return; // User canceled
  }

  // Prompt for Meeting Title
  const inputTitle = await vscode.window.showInputBox({
    prompt: t.titlePrompt(),
    value: parsed.title || 'Teams Meeting',
    placeHolder: t.titlePlaceholder(),
    validateInput: (value) => {
      const trimmed = value ? value.trim() : '';
      if (trimmed.length > 200) {
        return t.titleTooLong();
      }
      return null;
    }
  });

  if (!inputTitle) {
    return; // User canceled
  }

  // Prompt for Start Time
  const now = new Date();
  let defaultTimeStr = '';
  if (parsed.startTime) {
    let st = new Date(parsed.startTime.getTime());
    while (st.getTime() + 30 * 60 * 1000 <= now.getTime()) {
      st = addZonedDays(st, 1, parsed.timeZone);
    }
    const startParts = getZonedDateParts(st, parsed.timeZone);
    const yyyy = startParts.year;
    const mm = String(startParts.month + 1).padStart(2, '0');
    const dd = String(startParts.day).padStart(2, '0');
    const hh = String(startParts.hour).padStart(2, '0');
    const min = String(startParts.minute).padStart(2, '0');
    defaultTimeStr = `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  } else {
    const defaultDate = new Date(now.getTime());
    // Default to top of the next hour
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
    return; // User canceled
  }

  // Parse specified start time string
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

    while (finalStartTime.getTime() + 30 * 60 * 1000 <= now.getTime()) {
      finalStartTime = addZonedDays(finalStartTime, 1, parsed.timeZone);
    }
  } else {
    vscode.window.showErrorMessage(t.timeParseError());
    return;
  }

  // Prompt for Recurrence Selection QuickPick
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
    return; // User canceled
  }

  const recurrence: RecurrenceType = selectedRecurrence.type;
  const validationNow = new Date();
  while (finalStartTime.getTime() + 30 * 60 * 1000 <= validationNow.getTime()) {
    finalStartTime = addZonedDays(finalStartTime, 1, parsed.timeZone);
  }
  if (recurrence === 'weekdays') {
    while ([0, 6].includes(getZonedDateParts(finalStartTime, parsed.timeZone).dayOfWeek)) {
      finalStartTime = addZonedDays(finalStartTime, 1, parsed.timeZone);
    }
  }

  let finalEndTime: Date | undefined;
  if (parsed.startTime && parsed.endTime) {
    const duration = parsed.endTime.getTime() - parsed.startTime.getTime();
    finalEndTime = new Date(finalStartTime.getTime() + duration);
  } else if (parsed.endTime) {
    finalEndTime = parsed.endTime;
  }

  const selectedStartParts = getZonedDateParts(finalStartTime, parsed.timeZone);

  const recurrenceFields: Partial<Meeting> = recurrence === 'once'
    ? {}
    : {
        recurrenceInterval: parsed.recurrenceInterval ?? 1,
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

  const newMeeting: Meeting = {
    id: String(Date.now()) + Math.random().toString(36).substring(2, 7),
    title: inputTitle.trim(),
    url: inputUrl.trim(),
    startTime: finalStartTime.toISOString(),
    endTime: finalEndTime?.toISOString(),
    timeZone: parsed.timeZone,
    recurrence,
    organizer: parsed.organizer,
    meetingId: parsed.meetingId,
    passcode: parsed.passcode,
    isEnterprise: parsed.isEnterprise,
    ...recurrenceFields,
  };

  await meetingManager.addMeeting(newMeeting);
  vscode.window.showInformationMessage(t.meetingSaved(newMeeting.title));
}

/**
 * Prompts user to select an .ics or calendar file from disk and imports contained meetings.
 */
export async function addFromFileCommand(meetingManager: MeetingManager): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      'Calendar Files (*.ics)': ['ics', 'ical'],
      'All Files': ['*']
    },
    openLabel: 'インポート'
  });

  if (!uris || uris.length === 0) {
    return;
  }

  const fileUri = uris[0];
  let fileContent = '';
  try {
    fileContent = await readIcsFile(fileUri.fsPath);
  } catch {
    vscode.window.showErrorMessage(t.icsErrorParseFailed());
    return;
  }

  if (!fileContent || !fileContent.trim()) {
    vscode.window.showWarningMessage(t.icsWarningNoEvents());
    return;
  }

  const now = new Date();
  const isIcs = /BEGIN:VCALENDAR/i.test(fileContent) || /BEGIN:VEVENT/i.test(fileContent);

  if (isIcs) {
    try {
      const parsedMeetings = parseIcsContent(fileContent, now);
      if (parsedMeetings.length === 0) {
        vscode.window.showWarningMessage(t.icsWarningNoEvents());
        return;
      }

      let addedCount = 0;
      let missingUrlCount = 0;
      const existingMeetings = meetingManager.getMeetings();
      const newMeetings: Meeting[] = [];
      const knownOccurrences = existingMeetings
        .filter(m => m.uid)
        .map(m => ({ uid: m.uid, startTime: m.startTime }));

      for (const info of parsedMeetings) {
        if (!info.url || !isValidTeamsUrl(info.url)) {
          missingUrlCount++;
          continue;
        }

        const duration = info.startTime && info.endTime
          ? info.endTime.getTime() - info.startTime.getTime()
          : 30 * 60 * 1000;
        const startTime = (info.startTime || now).toISOString();
        const existingOccurrence = info.uid
          ? knownOccurrences.some(m => m.uid === info.uid && m.startTime === startTime)
          : undefined;
        if (existingOccurrence) {
          continue;
        }

        const newMeeting: Meeting = {
          id: String(Date.now()) + Math.random().toString(36).substring(2, 7),
          title: info.title || 'Teams Meeting',
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

        newMeetings.push(newMeeting);
        if (newMeeting.uid) {
          knownOccurrences.push({ uid: newMeeting.uid, startTime: newMeeting.startTime });
        }
        addedCount++;
      }

      if (newMeetings.length > 0) {
        await meetingManager.saveMeetings([...existingMeetings, ...newMeetings]);
      }

      if (addedCount > 0) {
        vscode.window.showInformationMessage(t.icsSuccess(addedCount));
      } else if (missingUrlCount > 0) {
        vscode.window.showWarningMessage(t.icsWarningNoUrl());
      } else {
        vscode.window.showInformationMessage(t.icsAlreadyRegistered());
      }
    } catch {
      vscode.window.showErrorMessage(t.icsErrorParseFailed());
    }
  } else {
    vscode.window.showWarningMessage(t.icsWarningNoEvents());
  }
}

/**
 * Allows editing the recurrence pattern and details of an existing meeting.
 */
/**
 * Prompts user for confirmation and deletes a meeting from storage.
 */
export async function deleteMeetingCommand(meetingManager: MeetingManager, item?: any): Promise<void> {
  let meeting: Meeting | undefined = item?.meeting || (item?.id && item?.title ? item : undefined);

  if (!meeting) {
    const sortedMeetings = meetingManager.getSortedMeetings();
    if (sortedMeetings.length === 0) {
      vscode.window.showInformationMessage(t.noMeetingsToDelete());
      return;
    }

    type MeetingQuickPickItem = vscode.QuickPickItem & { meeting: Meeting };
    const items: MeetingQuickPickItem[] = sortedMeetings.map(m => {
      const start = new Date(m.startTime);
      const timeStr = start.toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
      return {
        label: `$(trash) ${m.title}`,
        description: `${timeStr} (${m.recurrence})`,
        meeting: m
      };
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: t.selectMeetingToDeletePlaceholder()
    });

    if (!selected) {
      return;
    }
    meeting = selected.meeting;
  }

  const confirm = await vscode.window.showWarningMessage(
    t.deleteConfirm(meeting.title),
    { modal: true },
    t.deleteBtn()
  );

  if (confirm === t.deleteBtn()) {
    await meetingManager.removeMeeting(meeting.id);
    vscode.window.showInformationMessage(t.meetingDeleted(meeting.title));
  }
}

export async function editRecurrenceCommand(meetingManager: MeetingManager, target?: any): Promise<void> {
  let meeting: Meeting | undefined = undefined;

  if (target) {
    if (target.meeting) {
      meeting = target.meeting;
    } else if (target.id && target.title) {
      meeting = target as Meeting;
    }
  }

  if (!meeting) {
    const sortedMeetings = meetingManager.getSortedMeetings();
    if (sortedMeetings.length === 0) {
      vscode.window.showInformationMessage(t.noMeetingsToEditRecurrence());
      return;
    }

    type MeetingQuickPickItem = vscode.QuickPickItem & { meeting: Meeting };
    const items: MeetingQuickPickItem[] = sortedMeetings.map(m => {
      const start = new Date(m.startTime);
      const timeStr = start.toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
      return {
        label: `$(sync) ${m.title}`,
        description: `${timeStr} (${m.recurrence})`,
        meeting: m
      };
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: t.selectMeetingPlaceholder()
    });

    if (!selected) {
      return;
    }
    meeting = selected.meeting;
  }

  // 1. Prompt for Recurrence Pattern
  const currentRecurrence = meeting.recurrence || 'once';
  const recurrenceItems: { label: string; description: string; type: RecurrenceType }[] = [
    { label: t.recurrenceOnceLabel(currentRecurrence === 'once'), description: t.recurrenceOnceDesc(), type: 'once' },
    { label: t.recurrenceDailyLabel(currentRecurrence === 'daily'), description: t.recurrenceDailyDesc(), type: 'daily' },
    { label: t.recurrenceWeeklyLabel(currentRecurrence === 'weekly'), description: t.recurrenceWeeklyDesc(), type: 'weekly' },
    { label: t.recurrenceWeekdaysLabel(currentRecurrence === 'weekdays'), description: t.recurrenceWeekdaysDesc(), type: 'weekdays' },
    { label: t.recurrenceMonthlyLabel(currentRecurrence === 'monthly'), description: t.recurrenceMonthlyDesc(), type: 'monthly' },
    { label: t.recurrenceYearlyLabel(currentRecurrence === 'yearly'), description: t.recurrenceYearlyDesc(), type: 'yearly' }
  ];

  if (currentRecurrence !== 'once') {
    const idx = recurrenceItems.findIndex(item => item.type === currentRecurrence);
    if (idx > 0) {
      const [item] = recurrenceItems.splice(idx, 1);
      recurrenceItems.unshift(item);
    }
  }

  const selectedRecurrence = await vscode.window.showQuickPick(recurrenceItems, {
    placeHolder: t.recurrencePlaceholder(),
    title: t.editRecurrenceTitle(meeting.title)
  });

  if (!selectedRecurrence) {
    return; // User canceled
  }

  const newRecurrence = selectedRecurrence.type;
  const startTime = new Date(meeting.startTime);
  const startParts = getZonedDateParts(startTime, meeting.timeZone);

  let newInterval: number | undefined = undefined;
  let newDaysOfWeek: number[] | undefined = undefined;
  let newDayOfMonth: number | undefined = undefined;
  let newMonthOfYear: number | undefined = undefined;
  let newDayOfYear: number | undefined = undefined;
  let newEndDate: string | undefined = undefined;

  // Helper for End Date input
  const promptEndDate = async (): Promise<string | null | undefined> => {
    let defaultEndDateStr = '';
    if (meeting!.recurrenceEndDate) {
      const edParts = getZonedDateParts(new Date(meeting!.recurrenceEndDate), meeting!.timeZone);
      const edY = edParts.year;
      const edM = String(edParts.month + 1).padStart(2, '0');
      const edD = String(edParts.day).padStart(2, '0');
      defaultEndDateStr = `${edY}-${edM}-${edD}`;
    }

    const inputEndDate = await vscode.window.showInputBox({
      prompt: t.endDatePrompt(),
      value: defaultEndDateStr,
      validateInput: (val) => {
        if (!val || !val.trim()) {
          return null; // Empty means no end date
        }
        const match = val.trim().match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
        if (!match) {
          return t.endDateInvalid();
        }

        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        if (!isCalendarDate(year, month, day, meeting!.timeZone)) {
          return t.endDateInvalid();
        }
        return null;
      }
    });

    if (inputEndDate === undefined) {
      return undefined; // Canceled
    }

    if (!inputEndDate.trim()) {
      return null; // No end date
    }

    const [yStr, mStr, dStr] = inputEndDate.trim().split('-');
    const year = Number(yStr);
    const month = Number(mStr) - 1;
    const day = Number(dStr);
    return createDateInTimeZone(year, month, day, 23, 59, 59, 999, meeting!.timeZone).toISOString();
  };

  if (newRecurrence === 'daily') {
    // Prompt interval
    const inputInterval = await vscode.window.showInputBox({
      prompt: t.intervalPrompt(t.intervalUnitDays()),
      value: String(meeting.recurrenceInterval || 1),
      validateInput: (val) => {
        return parseIntegerInput(val, 1) === undefined ? t.intervalInvalid() : null;
      }
    });
    if (!inputInterval) { return; }
    newInterval = Number(inputInterval.trim());

    const endDateResult = await promptEndDate();
    if (endDateResult === undefined) { return; }
    newEndDate = endDateResult || undefined;

  } else if (newRecurrence === 'weekly') {
    // Prompt interval
    const inputInterval = await vscode.window.showInputBox({
      prompt: t.intervalPrompt(t.intervalUnitWeeks()),
      value: String(meeting.recurrenceInterval || 1),
      validateInput: (val) => {
        return parseIntegerInput(val, 1) === undefined ? t.intervalInvalid() : null;
      }
    });
    if (!inputInterval) { return; }
    newInterval = Number(inputInterval.trim());

    // Prompt days of week
    const currentDays = meeting.daysOfWeek || [startParts.dayOfWeek];
    const dayLabels = [
      { day: 0, label: '日曜日 (Sun)' },
      { day: 1, label: '月曜日 (Mon)' },
      { day: 2, label: '火曜日 (Tue)' },
      { day: 3, label: '水曜日 (Wed)' },
      { day: 4, label: '木曜日 (Thu)' },
      { day: 5, label: '金曜日 (Fri)' },
      { day: 6, label: '土曜日 (Sat)' },
    ];

    type DayQuickPickItem = vscode.QuickPickItem & { day: number };
    const dayItems: DayQuickPickItem[] = dayLabels.map(d => ({
      label: d.label,
      picked: currentDays.includes(d.day),
      day: d.day
    }));

    const selectedDays = await vscode.window.showQuickPick(dayItems, {
      canPickMany: true,
      placeHolder: t.daysOfWeekPrompt(),
    });

    if (!selectedDays || selectedDays.length === 0) {
      if (selectedDays) {
        vscode.window.showWarningMessage(t.daysOfWeekRequired());
      }
      return;
    }
    newDaysOfWeek = selectedDays.map(d => d.day).sort((a, b) => a - b);

    const endDateResult = await promptEndDate();
    if (endDateResult === undefined) { return; }
    newEndDate = endDateResult || undefined;

  } else if (newRecurrence === 'weekdays') {
    const endDateResult = await promptEndDate();
    if (endDateResult === undefined) { return; }
    newEndDate = endDateResult || undefined;

  } else if (newRecurrence === 'monthly') {
    // Prompt interval
    const inputInterval = await vscode.window.showInputBox({
      prompt: t.intervalPrompt(t.intervalUnitMonths()),
      value: String(meeting.recurrenceInterval || 1),
      validateInput: (val) => {
        return parseIntegerInput(val, 1) === undefined ? t.intervalInvalid() : null;
      }
    });
    if (!inputInterval) { return; }
    newInterval = Number(inputInterval.trim());

    // Prompt day of month
    const inputDayOfMonth = await vscode.window.showInputBox({
      prompt: t.dayOfMonthPrompt(),
      value: String(meeting.dayOfMonth || startParts.day),
      validateInput: (val) => {
        return parseIntegerInput(val, 1, 31) === undefined ? t.dayOfMonthInvalid() : null;
      }
    });
    if (!inputDayOfMonth) { return; }
    newDayOfMonth = Number(inputDayOfMonth.trim());

    const endDateResult = await promptEndDate();
    if (endDateResult === undefined) { return; }
    newEndDate = endDateResult || undefined;

  } else if (newRecurrence === 'yearly') {
    // Prompt interval
    const inputInterval = await vscode.window.showInputBox({
      prompt: t.intervalPrompt(t.intervalUnitYears()),
      value: String(meeting.recurrenceInterval || 1),
      validateInput: (val) => {
        return parseIntegerInput(val, 1) === undefined ? t.intervalInvalid() : null;
      }
    });
    if (!inputInterval) { return; }
    newInterval = Number(inputInterval.trim());

    // Prompt month of year
    const inputMonth = await vscode.window.showInputBox({
      prompt: t.monthOfYearPrompt(),
      value: String(meeting.monthOfYear || startParts.month + 1),
      validateInput: (val) => {
        return parseIntegerInput(val, 1, 12) === undefined ? t.monthOfYearInvalid() : null;
      }
    });
    if (!inputMonth) { return; }
    newMonthOfYear = Number(inputMonth.trim());

    // Prompt day of year
    const inputDay = await vscode.window.showInputBox({
      prompt: t.dayOfMonthPrompt(),
      value: String(meeting.dayOfYear || meeting.dayOfMonth || startParts.day),
      validateInput: (val) => {
        const day = parseIntegerInput(val, 1, 31);
        return day === undefined
          || newMonthOfYear === undefined
          || !isCalendarDate(2000, newMonthOfYear - 1, day, meeting!.timeZone)
          ? t.dayOfMonthInvalid()
          : null;
      }
    });
    if (!inputDay) { return; }
    newDayOfYear = Number(inputDay.trim());

    const endDateResult = await promptEndDate();
    if (endDateResult === undefined) { return; }
    newEndDate = endDateResult || undefined;
  }

  const updatedMeeting: Meeting = {
    ...meeting,
    recurrence: newRecurrence,
    recurrenceInterval: newInterval,
    daysOfWeek: newDaysOfWeek,
    dayOfMonth: newDayOfMonth,
    monthOfYear: newMonthOfYear,
    dayOfYear: newDayOfYear,
    recurrenceEndDate: newEndDate,
    // Clear complex ICAL rules when explicitly updating via UI
    recurrenceByDay: undefined,
    recurrenceByMonthDay: undefined,
    recurrenceByMonth: undefined,
    recurrenceBySetPos: undefined,
  };

  await meetingManager.updateMeeting(updatedMeeting);
  vscode.window.showInformationMessage(t.recurrenceUpdated(updatedMeeting.title));
}
