import * as vscode from 'vscode';
import { MeetingManager } from './meetingManager';
import { parseMeetingText } from './parser';
import { Meeting, RecurrenceType } from './types';

/**
 * Prompts for meeting details parsed from the clipboard and saves the meeting.
 */
export async function addFromClipboardCommand(meetingManager: MeetingManager): Promise<void> {
  const clipboardText = await vscode.env.clipboard.readText();
  if (!clipboardText || !clipboardText.trim()) {
    vscode.window.showWarningMessage('クリップボードにテキストが存在しません。');
    return;
  }

  const parsed = parseMeetingText(clipboardText);

  // Prompt for Teams URL
  const inputUrl = await vscode.window.showInputBox({
    prompt: 'Microsoft Teams ミーティングURLを入力または確認してください',
    value: parsed.url || '',
    placeHolder: 'https://teams.microsoft.com/l/meetup-join/...',
    validateInput: (value) => {
      if (!value || !value.trim()) {
        return 'URLは必須です。';
      }
      if (!/^https:\/\/teams\.(microsoft|live)\.com\//i.test(value.trim())) {
        return '有効な Microsoft Teams URL を入力してください。';
      }
      return null;
    }
  });

  if (!inputUrl) {
    return; // User canceled
  }

  // Prompt for Meeting Title
  const inputTitle = await vscode.window.showInputBox({
    prompt: 'ミーティングのタイトルを入力してください',
    value: parsed.title || 'Teams Meeting',
    placeHolder: '例: 定例ミーティング'
  });

  if (!inputTitle) {
    return; // User canceled
  }

  // Prompt for Start Time
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
      finalStartTime = new Date(year, month, day, hour, minute, 0);
    } else {
      finalStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
    }

    while (finalStartTime.getTime() + 30 * 60 * 1000 <= now.getTime()) {
      finalStartTime.setDate(finalStartTime.getDate() + 1);
    }
  } else {
    vscode.window.showErrorMessage('開始日時の解析に失敗しました。');
    return;
  }

  // Prompt for Recurrence Selection QuickPick
  const recurrenceItems: { label: string; description: string; type: RecurrenceType }[] = [
    { label: '単発 (Once)', description: '今回のみ (デフォルト)', type: 'once' },
    { label: '毎週 (Weekly)', description: '毎週同じ曜日に繰り返し', type: 'weekly' },
    { label: '平日 (Weekdays)', description: '月曜〜金曜日に繰り返し', type: 'weekdays' }
  ];

  const selectedRecurrence = await vscode.window.showQuickPick(recurrenceItems, {
    placeHolder: '繰り返し設定を選択してください'
  });

  if (!selectedRecurrence) {
    return; // User canceled
  }

  const recurrence: RecurrenceType = selectedRecurrence.type;
  const validationNow = new Date();
  while (finalStartTime.getTime() + 30 * 60 * 1000 <= validationNow.getTime()) {
    finalStartTime.setDate(finalStartTime.getDate() + 1);
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
    title: inputTitle.trim(),
    url: inputUrl.trim(),
    startTime: finalStartTime.toISOString(),
    endTime: finalEndTime?.toISOString(),
    recurrence
  };

  await meetingManager.addMeeting(newMeeting);
  vscode.window.showInformationMessage(`MeetDock: ミーティング「${newMeeting.title}」を保存しました。`);
}
