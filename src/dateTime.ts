export interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  dayOfWeek: number;
}

const TIME_ZONE_ALIASES: Array<[RegExp, string]> = [
  [/^(?:JST|日本標準時)$/i, '+09:00'],
  [/^Japan Standard Time$/i, 'Asia/Tokyo'],
  [/^EST$/i, '-05:00'],
  [/^EDT$/i, '-04:00'],
  [/^(?:Eastern Standard Time|Eastern Daylight Time)$/i, 'America/New_York'],
  [/^CST$/i, '-06:00'],
  [/^CDT$/i, '-05:00'],
  [/^(?:Central Standard Time|Central Daylight Time)$/i, 'America/Chicago'],
  [/^MST$/i, '-07:00'],
  [/^MDT$/i, '-06:00'],
  [/^(?:Mountain Standard Time|Mountain Daylight Time)$/i, 'America/Denver'],
  [/^PST$/i, '-08:00'],
  [/^PDT$/i, '-07:00'],
  [/^(?:Pacific Standard Time|Pacific Daylight Time)$/i, 'America/Los_Angeles'],
  [/^(?:UTC|GMT)$/i, '+00:00'],
];

function normalizeOffset(value: string): string | undefined {
  const match = value.match(/^(?:UTC|GMT)?\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) {
    return undefined;
  }

  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  if (hours > 23 || minutes > 59) {
    return undefined;
  }
  return `${match[1]}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const validTimeZoneCache = new Set<string>();

/**
 * Caches and returns an Intl.DateTimeFormat instance for the given IANA timeZone
 * to avoid expensive repeated object creation.
 */
function getDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function normalizeTimeZone(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const clean = value.trim();
  const offset = normalizeOffset(clean);
  if (offset) {
    return offset;
  }

  const alias = TIME_ZONE_ALIASES.find(([pattern]) => pattern.test(clean));
  if (alias) {
    return alias[1];
  }

  if (validTimeZoneCache.has(clean)) {
    return clean;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: clean }).format();
    validTimeZoneCache.add(clean);
    return clean;
  } catch {
    return undefined;
  }
}

function offsetMinutes(timeZone: string): number | undefined {
  const match = timeZone.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) {
    return undefined;
  }
  const magnitude = parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
  return match[1] === '-' ? -magnitude : magnitude;
}

function dayOfWeek(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month, day)).getUTCDay();
}

export function getZonedDateParts(date: Date, timeZone?: string): ZonedDateParts {
  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
      millisecond: date.getMilliseconds(),
      dayOfWeek: date.getDay(),
    };
  }

  const offset = offsetMinutes(timeZone);
  if (offset !== undefined) {
    const shifted = new Date(date.getTime() + offset * 60 * 1000);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth(),
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
      millisecond: shifted.getUTCMilliseconds(),
      dayOfWeek: shifted.getUTCDay(),
    };
  }

  const parts = getDateTimeFormatter(timeZone).formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    switch (part.type) {
      case 'year':
        year = parseInt(part.value, 10);
        break;
      case 'month':
        month = parseInt(part.value, 10) - 1;
        break;
      case 'day':
        day = parseInt(part.value, 10);
        break;
      case 'hour':
        hour = parseInt(part.value, 10);
        break;
      case 'minute':
        minute = parseInt(part.value, 10);
        break;
      case 'second':
        second = parseInt(part.value, 10);
        break;
    }
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond: date.getMilliseconds(),
    dayOfWeek: dayOfWeek(year, month, day),
  };
}

export function createDateInTimeZone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone?: string
): Date {
  if (!timeZone) {
    return new Date(year, month, day, hour, minute, second, millisecond);
  }

  const offset = offsetMinutes(timeZone);
  const localTimestamp = Date.UTC(year, month, day, hour, minute, second, millisecond);
  if (offset !== undefined) {
    return new Date(localTimestamp - offset * 60 * 1000);
  }

  let timestamp = localTimestamp;
  for (let attempt = 0; attempt < 4; attempt++) {
    const actual = getZonedDateParts(new Date(timestamp), timeZone);
    const actualTimestamp = Date.UTC(
      actual.year,
      actual.month,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      actual.millisecond
    );
    const adjustment = localTimestamp - actualTimestamp;
    timestamp += adjustment;
    if (adjustment === 0) {
      break;
    }
  }
  return new Date(timestamp);
}

export function addZonedDays(date: Date, days: number, timeZone?: string): Date {
  const parts = getZonedDateParts(date, timeZone);
  const shifted = new Date(Date.UTC(parts.year, parts.month, parts.day + days));
  return createDateInTimeZone(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
    timeZone
  );
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
