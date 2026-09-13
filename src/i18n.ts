import * as vscode from 'vscode';
import { Meeting } from './types';

export type MeetingStatusState = 'normal' | 'warning' | 'startingSoon' | 'ongoing';

export function isJapanese(): boolean {
  return vscode.env.language.toLowerCase().startsWith('ja');
}

function formatDaysOfWeek(days?: number[]): string {
  if (!days || days.length === 0) {
    return '';
  }
  const jpDays = ['日', '月', '火', '水', '木', '金', '土'];
  const enDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const names = isJapanese()
    ? days.map(d => jpDays[d])
    : days.map(d => enDays[d]);
  return names.join(', ');
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
  recurrenceLabel: (m: Meeting) => {
    const type = m.recurrence;
    const interval = m.recurrenceInterval || 1;
    const daysStr = formatDaysOfWeek(m.daysOfWeek);

    if (type === 'daily') {
      if (isJapanese()) {
        return interval > 1 ? `繰り返し: ${interval}日ごと` : '繰り返し: 毎日';
      }
      return interval > 1 ? `Recurrence: Every ${interval} days` : 'Recurrence: Daily';
    }
    if (type === 'weekly') {
      if (isJapanese()) {
        const prefix = interval > 1 ? `${interval}週ごと` : '毎週';
        return daysStr ? `繰り返し: ${prefix} (${daysStr})` : `繰り返し: ${prefix}`;
      }
      const prefix = interval > 1 ? `Every ${interval} weeks` : 'Weekly';
      return daysStr ? `Recurrence: ${prefix} (${daysStr})` : `Recurrence: ${prefix}`;
    }
    if (type === 'weekdays') {
      return isJapanese() ? '繰り返し: 平日' : 'Recurrence: Weekdays';
    }
    if (type === 'monthly') {
      const dom = m.dayOfMonth || new Date(m.startTime).getDate();
      if (isJapanese()) {
        const prefix = interval > 1 ? `${interval}か月ごと` : '毎月';
        return `繰り返し: ${prefix} (${dom}日)`;
      }
      const prefix = interval > 1 ? `Every ${interval} months` : 'Monthly';
      return `Recurrence: ${prefix} (day ${dom})`;
    }
    if (type === 'yearly') {
      const start = new Date(m.startTime);
      const moy = m.monthOfYear || (start.getMonth() + 1);
      const doy = m.dayOfYear || m.dayOfMonth || start.getDate();
      if (isJapanese()) {
        const prefix = interval > 1 ? `${interval}年ごと` : '毎年';
        return `繰り返し: ${prefix} (${moy}/${doy})`;
      }
      const prefix = interval > 1 ? `Every ${interval} years` : 'Yearly';
      return `Recurrence: ${prefix} (${moy}/${doy})`;
    }
    return isJapanese() ? '繰り返し: 単発 (1回のみ)' : 'Recurrence: Once';
  },
  recurrenceSuffix: (m: Meeting) => {
    const type = m.recurrence;
    const interval = m.recurrenceInterval || 1;
    const daysStr = formatDaysOfWeek(m.daysOfWeek);

    if (type === 'daily') {
      if (isJapanese()) {
        return interval > 1 ? ` [${interval}日ごと]` : ' [毎日]';
      }
      return interval > 1 ? ` [Every ${interval}d]` : ' [Daily]';
    }
    if (type === 'weekly') {
      if (isJapanese()) {
        const prefix = interval > 1 ? `${interval}週ごと` : '毎週';
        return daysStr ? ` [${prefix} ${daysStr}]` : ` [${prefix}]`;
      }
      const prefix = interval > 1 ? `Every ${interval}w` : 'Weekly';
      return daysStr ? ` [${prefix} ${daysStr}]` : ` [${prefix}]`;
    }
    if (type === 'weekdays') {
      return isJapanese() ? ' [平日]' : ' [Weekdays]';
    }
    if (type === 'monthly') {
      const dom = m.dayOfMonth || new Date(m.startTime).getDate();
      if (isJapanese()) {
        const prefix = interval > 1 ? `${interval}か月ごと` : '毎月';
        return ` [${prefix} ${dom}日]`;
      }
      const prefix = interval > 1 ? `Every ${interval}m` : 'Monthly';
      return ` [${prefix} ${dom}]`;
    }
    if (type === 'yearly') {
      const start = new Date(m.startTime);
      const moy = m.monthOfYear || (start.getMonth() + 1);
      const doy = m.dayOfYear || m.dayOfMonth || start.getDate();
      if (isJapanese()) {
        const prefix = interval > 1 ? `${interval}年ごと` : '毎年';
        return ` [${prefix} ${moy}/${doy}]`;
      }
      const prefix = interval > 1 ? `Every ${interval}y` : 'Yearly';
      return ` [${prefix} ${moy}/${doy}]`;
    }
    return '';
  },
  statusSuffix: (statusState: MeetingStatusState, startTime: Date, now: Date) => {
    if (statusState === 'ongoing') {
      return isJapanese() ? ' (開催中)' : ' (In progress)';
    }
    if (statusState === 'startingSoon') {
      return isJapanese() ? ' (まもなく開始)' : ' (Starting soon)';
    }
    if (statusState === 'warning') {
      const diffMs = startTime.getTime() - now.getTime();
      const diffMinutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
      return isJapanese() ? ` (${diffMinutes}分後)` : ` (In ${diffMinutes}m)`;
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
  recurrenceDailyLabel: (isParsed: boolean) => isJapanese() ? (isParsed ? '日次 (Daily) [パース結果]' : '日次 (Daily)') : (isParsed ? 'Daily [Parsed]' : 'Daily'),
  recurrenceDailyDesc: () => isJapanese() ? '毎日または指定日数ごとに繰り返し' : 'Repeats daily or at day intervals',
  recurrenceWeeklyLabel: (isParsed: boolean) => isJapanese() ? (isParsed ? '毎週 (Weekly) [パース結果]' : '毎週 (Weekly)') : (isParsed ? 'Weekly [Parsed]' : 'Weekly'),
  recurrenceWeeklyDesc: () => isJapanese() ? '毎週または指定曜日/週ごとに繰り返し' : 'Repeats weekly or on specific days',
  recurrenceWeekdaysLabel: (isParsed: boolean) => isJapanese() ? (isParsed ? '平日 (Weekdays) [パース結果]' : '平日 (Weekdays)') : (isParsed ? 'Weekdays [Parsed]' : 'Weekdays'),
  recurrenceWeekdaysDesc: () => isJapanese() ? '月曜〜金曜日に繰り返し' : 'Repeats Monday to Friday',
  recurrenceMonthlyLabel: (isParsed: boolean) => isJapanese() ? (isParsed ? '月次 (Monthly) [パース結果]' : '月次 (Monthly)') : (isParsed ? 'Monthly [Parsed]' : 'Monthly'),
  recurrenceMonthlyDesc: () => isJapanese() ? '毎月または指定月数ごとに繰り返し' : 'Repeats monthly or at month intervals',
  recurrenceYearlyLabel: (isParsed: boolean) => isJapanese() ? (isParsed ? '年次 (Yearly) [パース結果]' : '年次 (Yearly)') : (isParsed ? 'Yearly [Parsed]' : 'Yearly'),
  recurrenceYearlyDesc: () => isJapanese() ? '毎年または指定年数ごとに繰り返し' : 'Repeats yearly or at year intervals',
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
  openChatBtn: () => isJapanese() ? 'チャットを開く' : 'Open Chat',
  cannotOpenChatMsg: () => isJapanese() ? 'この会議URLからはチャット画面を開くことができません。' : 'Cannot open meeting chat from this meeting URL.',
  unsafeUrlMsg: () => isJapanese() ? '不安全または無効な Teams URL です。開くことができません。' : 'Unsafe or invalid Teams URL. Cannot open.',
};
