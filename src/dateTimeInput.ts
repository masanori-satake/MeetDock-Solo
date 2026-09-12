const DATE_TIME_INPUT_REGEX = /^(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s+)?(\d{1,2}):(\d{2})$/;

export type DateTimeInputResult =
  | { date: Date; error: null }
  | { date: null; error: string };

export function parseDateTimeInput(value: string, now = new Date()): DateTimeInputResult {
  if (!value || !value.trim()) {
    return { date: null, error: '開始日時は必須です。' };
  }

  const match = value.trim().match(DATE_TIME_INPUT_REGEX);
  if (!match) {
    return {
      date: null,
      error: '正しい日時形式 (例: 2026-04-01 14:00 または 14:00) で入力してください。'
    };
  }

  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const hasDate = Boolean(match[1] && match[2] && match[3]);
  const month = hasDate ? parseInt(match[2], 10) : now.getMonth() + 1;
  const day = hasDate ? parseInt(match[3], 10) : now.getDate();

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return {
      date: null,
      error: '月は1〜12、日は1〜31、時は0〜23、分は0〜59で入力してください。'
    };
  }

  const year = hasDate ? parseInt(match[1], 10) : now.getFullYear();
  const date = new Date(year, month - 1, day, hour, minute, 0);
  if (date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      date.getHours() !== hour ||
      date.getMinutes() !== minute) {
    return { date: null, error: '実在する日時を入力してください。' };
  }

  if (!hasDate && date < now) {
    date.setDate(date.getDate() + 1);
  }

  return { date, error: null };
}
