import * as vscode from 'vscode';

export function isJapanese(): boolean {
  return vscode.env.language.toLowerCase().startsWith('ja');
}

export const t = {
  // TreeView & Details
  timeLabel: (yyyy: number, mm: string, dd: string, startHHmm: string, endHHmm: string, durationStr: string) =>
    isJapanese()
      ? `時間: ${yyyy}/${mm}/${dd} ${startHHmm} - ${endHHmm} (${durationStr})`
      : `Time: ${yyyy}/${mm}/${dd} ${startHHmm} - ${endHHmm} (${durationStr})`,
  organizerLabel: (organizer: string) =>
    isJapanese() ? `主催者: ${organizer}` : `Organizer: ${organizer}`,
  organizerSuffix: (organizer: string) =>
    isJapanese() ? ` [主催: ${organizer}]` : ` [Organizer: ${organizer}]`,
  recurrenceLabel: (type: 'once' | 'weekly' | 'weekdays') => {
    if (type === 'weekly') {
      return isJapanese() ? '繰り返し: 毎週' : 'Recurrence: Weekly';
    }
    if (type === 'weekdays') {
      return isJapanese() ? '繰り返し: 平日' : 'Recurrence: Weekdays';
    }
    return isJapanese() ? '繰り返し: 単発 (1回のみ)' : 'Recurrence: Once';
  },
  recurrenceSuffix: (type: 'once' | 'weekly' | 'weekdays') => {
    if (type === 'weekly') {
      return isJapanese() ? ' [毎週]' : ' [Weekly]';
    }
    if (type === 'weekdays') {
      return isJapanese() ? ' [平日]' : ' [Weekdays]';
    }
    return '';
  },
  duration: (hours: number, minutes: number) => {
    if (isJapanese()) {
      if (hours > 0 && minutes > 0) { return `${hours}時間${minutes}分`; }
      if (hours > 0) { return `${hours}時間`; }
      return `${minutes}分`;
    } else {
      if (hours > 0 && minutes > 0) { return `${hours}h ${minutes}m`; }
      if (hours > 0) { return `${hours}h`; }
      return `${minutes}m`;
    }
  },

  // Commands & Input Prompts
  clipboardEmpty: () => isJapanese() ? 'クリップボードにテキストが存在しません。' : 'Clipboard contains no text.',
  urlPrompt: () => isJapanese() ? 'Microsoft Teams ミーティングURLを入力または確認してください' : 'Enter or verify Microsoft Teams meeting URL',
  urlPlaceholder: () => 'https://teams.microsoft.com/l/meetup-join/...',
  urlRequired: () => isJapanese() ? 'URLは必須です。' : 'URL is required.',
  urlInvalid: () => isJapanese() ? '有効な Microsoft Teams URL を入力してください。' : 'Please enter a valid Microsoft Teams URL.',
  titlePrompt: () => isJapanese() ? 'ミーティングのタイトルを入力してください' : 'Enter meeting title',
  titlePlaceholder: () => isJapanese() ? '例: 定例ミーティング' : 'e.g. Weekly Sync',
  timePrompt: () => isJapanese() ? '開始日時を入力してください (形式: YYYY-MM-DD HH:mm または HH:mm)' : 'Enter start date/time (Format: YYYY-MM-DD HH:mm or HH:mm)',
  timeRequired: () => isJapanese() ? '開始日時は必須です。' : 'Start date/time is required.',
  timeInvalid: () => isJapanese() ? '正しい日時形式 (例: 2026-04-01 14:00 または 14:00) で入力してください。' : 'Please use correct format (e.g. 2026-04-01 14:00 or 14:00).',
  timeParseError: () => isJapanese() ? '開始日時の解析に失敗しました。' : 'Failed to parse start date/time.',
  recurrencePlaceholder: () => isJapanese() ? '繰り返し設定を選択してください' : 'Select recurrence setting',
  recurrenceOnceLabel: (isParsed: boolean) => isJapanese() ? (isParsed ? '単発 (Once) [パース結果]' : '単発 (Once)') : (isParsed ? 'Once [Parsed]' : 'Once'),
  recurrenceOnceDesc: () => isJapanese() ? '今回のみ' : 'One-time meeting',
  recurrenceWeeklyLabel: (isParsed: boolean) => isJapanese() ? (isParsed ? '毎週 (Weekly) [パース結果]' : '毎週 (Weekly)') : (isParsed ? 'Weekly [Parsed]' : 'Weekly'),
  recurrenceWeeklyDesc: () => isJapanese() ? '毎週同じ曜日に繰り返し' : 'Repeats every week',
  recurrenceWeekdaysLabel: (isParsed: boolean) => isJapanese() ? (isParsed ? '平日 (Weekdays) [パース結果]' : '平日 (Weekdays)') : (isParsed ? 'Weekdays [Parsed]' : 'Weekdays'),
  recurrenceWeekdaysDesc: () => isJapanese() ? '月曜〜金曜日に繰り返し' : 'Repeats Monday to Friday',
  meetingSaved: (title: string) => isJapanese() ? `MeetDock: ミーティング「${title}」を保存しました。` : `MeetDock: Saved meeting "${title}".`,
  meetingDeleted: (title: string) => isJapanese() ? `MeetDock: ミーティング「${title}」を削除しました。` : `MeetDock: Deleted meeting "${title}".`,
  noMeetingsPrompt: () => isJapanese() ? '登録された Teams ミーティングはありません。クリップボードから追加しますか？' : 'No registered Teams meetings. Add from clipboard?',
  addBtn: () => isJapanese() ? '追加する' : 'Add',
  selectMeetingPlaceholder: () => isJapanese() ? 'Teams ミーティングを選択してブラウザ/アプリで開きます' : 'Select a Teams meeting to open',

  // Status Bar & Reminders
  noMeetingsStatusBar: () => isJapanese() ? '$(calendar) Teams: 予定なし' : '$(calendar) Teams: No upcoming meetings',
  noMeetingsTooltip: () => isJapanese() ? '登録された Teams ミーティングはありません。' : 'No registered Teams meetings.',
  nextMeetingTooltip: (title: string, timeStr: string) => isJapanese() ? `次回会議: ${title}\n開始時刻: ${timeStr}` : `Next meeting: ${title}\nStart time: ${timeStr}`,
  nextMeetingStatus: (timeStr: string, remainingText: string) => isJapanese() ? `$(calendar) 次の Teams: ${timeStr} (${remainingText}後)` : `$(calendar) Next Teams: ${timeStr} (in ${remainingText})`,
  remainingTime: (diffMinutes: number) => {
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return isJapanese()
      ? (hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`)
      : (hours > 0 ? `${hours}h${minutes}m` : `${minutes}m`);
  },
  ongoingStatus: (title: string, indexSuffix: string) => isJapanese() ? `$(broadcast) ${title} (開催中)${indexSuffix}` : `$(broadcast) ${title} (In progress)${indexSuffix}`,
  ongoingTooltip: (title: string) => isJapanese() ? `開催中: ${title}\nクリックしてミーティング一覧を開く` : `In progress: ${title}\nClick to view meeting list`,
  startingSoonStatus: (timeStr: string, title: string, indexSuffix: string) => isJapanese() ? `$(calendar) ${timeStr} ${title} (まもなく開始)${indexSuffix}` : `$(calendar) ${timeStr} ${title} (Starting soon)${indexSuffix}`,
  startingSoonTooltip: (title: string, timeStr: string) => isJapanese() ? `まもなく開始: ${title}\n開始時刻: ${timeStr}` : `Starting soon: ${title}\nStart time: ${timeStr}`,
  inMinutesStatus: (timeStr: string, title: string, diffMinutes: number, indexSuffix: string) => isJapanese() ? `$(calendar) ${timeStr} ${title} (${diffMinutes}分後)${indexSuffix}` : `$(calendar) ${timeStr} ${title} (in ${diffMinutes}m)${indexSuffix}`,
  reminder5mMsg: (title: string, timeStr: string) => isJapanese() ? `【5分前リマインダー】「${title}」が ${timeStr} に開始します。` : `[5m Reminder] "${title}" starts at ${timeStr}.`,
  reminderStartMsg: (title: string) => isJapanese() ? `ミーティング「${title}」の時間になりました！` : `Time for meeting "${title}"!`,
  joinBtn: () => isJapanese() ? 'Teamsに参加' : 'Join Teams',
  unsafeUrlMsg: () => isJapanese() ? '不安全または無効な Teams URL です。開くことができません。' : 'Unsafe or invalid Teams URL. Cannot open.',
};
