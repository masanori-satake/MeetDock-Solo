import * as vscode from 'vscode';
import { MeetingManager } from './meetingManager';
import { parseMeetingText } from './parser';
import { RecurrenceType } from './types';
import { parseDateTimeInput } from './dateTimeInput';

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
  let defaultTimeStr = '';
  if (parsed.startTime) {
    const yyyy = parsed.startTime.getFullYear();
    const mm = String(parsed.startTime.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.startTime.getDate()).padStart(2, '0');
    const hh = String(parsed.startTime.getHours()).padStart(2, '0');
    const min = String(parsed.startTime.getMinutes()).padStart(2, '0');
    defaultTimeStr = `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  } else {
    const now = new Date();
    // Default to top of the next hour
    now.setHours(now.getHours() + 1, 0, 0, 0);
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    defaultTimeStr = `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }

  const inputTimeStr = await vscode.window.showInputBox({
    prompt: '開始日時を入力してください (形式: YYYY-MM-DD HH:mm または HH:mm)',
    value: defaultTimeStr,
    validateInput: (val) => parseDateTimeInput(val).error
  });

  if (!inputTimeStr) {
    return; // User canceled
  }

  const parsedTime = parseDateTimeInput(inputTimeStr);
  if (parsedTime.date === null) {
    vscode.window.showErrorMessage(parsedTime.error);
    return;
  }
  const finalStartTime = parsedTime.date;

  // Prompt for Recurrence Selection QuickPick
  const recurrenceItems: { label: string; description: string; type: RecurrenceType }[] = [
    { label: '単発 (Once)', description: '今回のみ (デフォルト)', type: 'once' },
    { label: '毎週 (Weekly)', description: '毎週同じ曜日に繰り返し', type: 'weekly' },
    { label: '平日 (Weekdays)', description: '月曜〜金曜日に繰り返し', type: 'weekdays' }
  ];

  const selectedRecurrence = await vscode.window.showQuickPick(recurrenceItems, {
    placeHolder: '繰り返し設定を選択してください'
  });

  const recurrence: RecurrenceType = selectedRecurrence ? selectedRecurrence.type : 'once';

  const newMeeting = {
    id: String(Date.now()) + Math.random().toString(36).substring(2, 7),
    title: inputTitle.trim(),
    url: inputUrl.trim(),
    startTime: finalStartTime.toISOString(),
    recurrence
  };

  await meetingManager.addMeeting(newMeeting);
  vscode.window.showInformationMessage(`MeetDock: ミーティング「${newMeeting.title}」を保存しました。`);
}
