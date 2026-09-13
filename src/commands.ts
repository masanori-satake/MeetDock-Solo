import * as vscode from 'vscode';
import { MeetingManager } from './meetingManager';
import { parseMeetingText } from './parser';
import { Meeting, RecurrenceType } from './types';
import { isValidTeamsUrl } from './urlValidator';
import { t } from './i18n';
import { addZonedDays, createDateInTimeZone, getZonedDateParts } from './dateTime';

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
    placeHolder: t.titlePlaceholder()
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
  };

  await meetingManager.addMeeting(newMeeting);
  vscode.window.showInformationMessage(t.meetingSaved(newMeeting.title));
}
