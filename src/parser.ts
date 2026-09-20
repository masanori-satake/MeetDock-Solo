import { ParsedMeetingInfo, RecurrenceType } from './types';
import { getTeamsUrlFromSafeLink, isValidTeamsUrl } from './urlValidator';
import { createDateInTimeZone, getZonedDateParts, normalizeTimeZone } from './dateTime';

const JAPANESE_ERA_START_YEAR = {
  令和: 2018,
  平成: 1988,
  昭和: 1925,
  大正: 1911,
  明治: 1867
} as const;

const MONTH_NAMES: { [key: string]: number } = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

function createDateWithOffset(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string | undefined
): Date {
  return createDateInTimeZone(year, month, day, hour, minute, second, 0, timeZone);
}

function parseRecurrenceInfo(normalizedText: string, startTime?: Date, timeZone?: string): {
  recurrence: RecurrenceType;
  recurrenceInterval?: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  monthOfYear?: number;
  dayOfYear?: number;
  recurrenceEndDate?: Date;
} {
  let recurrence: RecurrenceType = 'once';
  let recurrenceInterval: number | undefined = undefined;
  let daysOfWeek: number[] | undefined = undefined;
  let dayOfMonth: number | undefined = undefined;
  let monthOfYear: number | undefined = undefined;
  let dayOfYear: number | undefined = undefined;
  let recurrenceEndDate: Date | undefined = undefined;

  // 1. Recurrence End Date
  const endDateMatch = normalizedText.match(/(?:(\d{4})[-/.]\s*)?(\d{1,2})[-/.]\s*(\d{1,2})\s*まで|until\s+(?:(\d{4})[-/.])?(\d{1,2})[-/.](\d{1,2})/i);
  if (endDateMatch) {
    const startParts = startTime ? getZonedDateParts(startTime, timeZone) : undefined;
    const startYear = startParts ? startParts.year : new Date().getFullYear();
    const parsedYear = endDateMatch[1] || endDateMatch[4] ? parseInt(endDateMatch[1] || endDateMatch[4], 10) : startYear;
    const parsedMonth = parseInt(endDateMatch[2] || endDateMatch[5], 10) - 1;
    const parsedDay = parseInt(endDateMatch[3] || endDateMatch[6], 10);

    let year = parsedYear;
    if (!endDateMatch[1] && !endDateMatch[4] && startTime) {
      if (parsedMonth < startParts!.month || (parsedMonth === startParts!.month && parsedDay < startParts!.day)) {
        year = startYear + 1;
      }
    }
    recurrenceEndDate = createDateInTimeZone(year, parsedMonth, parsedDay, 23, 59, 59, 999, timeZone);
  }

  // 2. Interval
  const intervalMatch = normalizedText.match(/(?:繰り返し間隔|interval)[\s:]*(\d+)|(\d+)\s*(?:日|か月|ヶ月|月|年|週)(?:ごと|おき|間開催)/i);
  if (intervalMatch) {
    const num = parseInt(intervalMatch[1] || intervalMatch[2], 10);
    if (!isNaN(num) && num > 0) {
      recurrenceInterval = num;
    }
  }

  // 3. Recurrence Type determination
  if (/(?:日次|daily|(\d+)\s*日間開催|(\d+)\s*日ごと|(\d+)\s*日おき)/i.test(normalizedText)) {
    recurrence = 'daily';
    recurrenceInterval = recurrenceInterval || 1;
  } else if (/(?:月次|monthly|(\d+)\s*か?月ごと|(\d+)\s*月おき)/i.test(normalizedText)) {
    recurrence = 'monthly';
    recurrenceInterval = recurrenceInterval || 1;
    const domMatch = normalizedText.match(/(\d{1,2})\s*日に/);
    if (domMatch) {
      dayOfMonth = parseInt(domMatch[1], 10);
    } else if (startTime) {
      dayOfMonth = getZonedDateParts(startTime, timeZone).day;
    }
  } else if (/(?:年次|yearly|毎年|(\d+)\s*年ごと|(\d+)\s*年おき)/i.test(normalizedText)) {
    recurrence = 'yearly';
    recurrenceInterval = recurrenceInterval || 1;
    const ymdMatch = normalizedText.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (ymdMatch) {
      monthOfYear = parseInt(ymdMatch[1], 10);
      dayOfYear = parseInt(ymdMatch[2], 10);
    } else if (startTime) {
      const startParts = getZonedDateParts(startTime, timeZone);
      monthOfYear = startParts.month + 1;
      dayOfYear = startParts.day;
    }
  } else if (/(?:平日|weekdays|Monday through Friday)/i.test(normalizedText)) {
    recurrence = 'weekdays';
  } else if (/(?:毎週|週次|weekly|会議シリーズ|series|(\d+)\s*週ごと|(\d+)\s*週おき)/i.test(normalizedText)) {
    recurrence = 'weekly';
    recurrenceInterval = recurrenceInterval || 1;

    // Parse days of week
    const daysFound = new Set<number>();
    const dayPatterns: { day: number; regex: RegExp }[] = [
      { day: 0, regex: /(?:日曜日?|\bsunday\b|\bsun\b)/i },
      { day: 1, regex: /(?:月曜日?|\bmonday\b|\bmon\b)/i },
      { day: 2, regex: /(?:火曜日?|\btuesday\b|\btue\b)/i },
      { day: 3, regex: /(?:水曜日?|\bwednesday\b|\bwed\b)/i },
      { day: 4, regex: /(?:木曜日?|\bthursday\b|\bthu\b)/i },
      { day: 5, regex: /(?:金曜日?|\bfriday\b|\bfri\b)/i },
      { day: 6, regex: /(?:土曜日?|\bsaturday\b|\bsat\b)/i },
    ];

    let searchTarget = normalizedText;
    const linesWithDays = normalizedText.split('\n').filter(l => /(?:日|月|火|水|木|金|土)曜日?|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|sun|mon|tue|wed|thu|fri|sat)\b/i.test(l));
    if (linesWithDays.length > 0) {
      const recLine = linesWithDays.find(l => /(?:毎週|weekly|every|シリーズ|series|開催)/i.test(l));
      if (recLine) {
        searchTarget = recLine;
      }
    }

    for (const { day, regex } of dayPatterns) {
      if (regex.test(searchTarget)) {
        daysFound.add(day);
      }
    }

    if (daysFound.size > 0) {
      daysOfWeek = Array.from(daysFound).sort((a, b) => a - b);
    } else if (startTime) {
      daysOfWeek = [getZonedDateParts(startTime, timeZone).dayOfWeek];
    }
  }

  return {
    recurrence,
    recurrenceInterval,
    daysOfWeek,
    dayOfMonth,
    monthOfYear,
    dayOfYear,
    recurrenceEndDate
  };
}

export const MAX_PARSER_TEXT_LENGTH = 20000;

/**
 * Extracts Teams URL, Title, Start Time, End Time, Organizer, Meeting ID, Passcode, and Recurrence from text.
 */
export function parseMeetingText(text: string): ParsedMeetingInfo {
  if (!text || typeof text !== 'string') {
    return { title: 'Teams Meeting', url: '' };
  }
  const truncatedText = text.length > MAX_PARSER_TEXT_LENGTH
    ? Array.from(text).slice(0, MAX_PARSER_TEXT_LENGTH).join('')
    : text;
  const normalizedText = truncatedText.replace(/\r\n/g, '\n').trim();
  const lines = normalizedText.split('\n').map(l => l.trim());

  // 1. Extract Teams URL & Safe Links un-wrapping
  let url = '';
  const safeLinksMatch = normalizedText.match(/https:\/\/[a-zA-Z0-9.-]+\.safelinks\.protection\.outlook\.com\/[^\s"<>'`]+/i);
  if (safeLinksMatch) {
    const safeUrl = safeLinksMatch[0].replace(/[.,;)]+$/, '');
    const targetUrl = getTeamsUrlFromSafeLink(safeUrl);
    if (targetUrl) {
      url = targetUrl.replace(/[.,;)]+$/, '');
    }
  }

  if (!url) {
    const urlRegex = /https:\/\/teams\.(?:microsoft|live)\.com\/(?:l\/meetup-join|meet)\/[^\s"<>'`]+/i;
    const matchUrl = normalizedText.match(urlRegex);
    if (matchUrl) {
      url = matchUrl[0].replace(/[.,;)]+$/, '');
    } else {
      const fallbackUrlRegex = /https:\/\/teams\.(?:microsoft|live)\.com\/[^\s"<>'`]+/i;
      const fallbackMatch = normalizedText.match(fallbackUrlRegex);
      if (fallbackMatch) {
        url = fallbackMatch[0].replace(/[.,;)]+$/, '');
      } else {
        const linkAnchorMatch = normalizedText.match(/(?:会議のリンク|Meeting link):\s*[^\n]*?(https?:\/\/[^\s"<>'`]+)/i);
        if (linkAnchorMatch) {
          url = linkAnchorMatch[1].replace(/[.,;)]+$/, '');
        }
      }
    }
  }

  if (url && !isValidTeamsUrl(url)) {
    url = '';
  }

  const cleanField = (val: string, maxLen: number) => {
    // Replace control characters with space, then normalize whitespace
    const cleaned = val.replace(/[\x00-\x1F\x7F]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) { return ''; }
    return Array.from(cleaned).length > maxLen
      ? Array.from(cleaned).slice(0, maxLen).join('').trim()
      : cleaned;
  };

  // 2. Extract Organizer
  let organizer: string | undefined = undefined;
  const jpOrgMatch = normalizedText.match(/^(.+?)\s+Microsoft Teams 会議(?:シリーズ)?に招待されました。/m);
  const enOrgMatch = normalizedText.match(/^(.+?)\s+(?:has invited you to a Teams meeting|invited you to a Microsoft Teams Meeting:|invited you to a Microsoft Teams Meeting|invited you to a Teams Meeting)/m);
  if (jpOrgMatch && jpOrgMatch[1].trim()) {
    organizer = cleanField(jpOrgMatch[1], 100);
  } else if (enOrgMatch && enOrgMatch[1].trim()) {
    organizer = cleanField(enOrgMatch[1], 100);
  }

  // 3. Extract Meeting ID & Passcode & Enterprise flag
  let meetingId: string | undefined = undefined;
  let passcode: string | undefined = undefined;
  const meetingIdMatch = normalizedText.match(/(?:会議\s*ID|Meeting\s*ID):[^\S\r\n]*((?:\d|[^\S\r\n]){9,17})/i);
  if (meetingIdMatch) {
    meetingId = cleanField(meetingIdMatch[1].replace(/\s+/g, ''), 50);
  }
  const passcodeMatch = normalizedText.match(/(?:パスコード|Passcode):\s*([A-Za-z0-9]+)/i);
  if (passcodeMatch) {
    passcode = cleanField(passcodeMatch[1], 50);
  }
  const isEnterprise = Boolean(meetingId || passcode || /(?:会議\s*ID|Meeting\s*ID)/i.test(normalizedText));

  // 4. Extract Title
  let title = 'Teams Meeting';
  const subjectMatch = normalizedText.match(/(?:Subject|件名|タイトル|Title):\s*(.+)/i);
  const headerTitleMatch = normalizedText.match(/invited you to a Microsoft Teams Meeting:\s*(.+)$/im);
  const linkAnchorTitleMatch = normalizedText.match(/(?:会議のリンク|Meeting link):\s*(.+?)\s*\|\s*Microsoft Teams/i);

  if (subjectMatch && subjectMatch[1].trim()) {
    title = subjectMatch[1].trim();
  } else if (headerTitleMatch && headerTitleMatch[1].trim()) {
    title = headerTitleMatch[1].trim();
  } else if (linkAnchorTitleMatch && linkAnchorTitleMatch[1].trim()) {
    title = linkAnchorTitleMatch[1].trim();
  } else {
    // Find candidate title lines between invitation header line and date line
    const titleCandidates: string[] = [];

    for (const line of lines) {
      if (!line) {
        continue;
      }
      const cleanLine = line.replace(/<[^>]*>/g, '').trim();
      if (!cleanLine) {
        continue;
      }

      if (/(?:Microsoft\s*)?Teams\s*会議/i.test(cleanLine) ||
          /invited you to/i.test(cleanLine) ||
          /招待されました/i.test(cleanLine)) {
        continue;
      }

      // Stop if date or time line is reached
      if (/^\d{1,2}:\d{2}/.test(cleanLine) ||
          /^\d{4}[-/.\s年]/.test(cleanLine) ||
          /^(?:令和|平成|昭和|大正|明治)(?:元|\d{1,2})年/.test(cleanLine) ||
          /^\d{1,2}月\d{1,2}日/.test(cleanLine) ||
          /^(?:月曜日|火曜日|水曜日|木曜日|金曜日|土曜日|日曜日|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i.test(cleanLine) ||
          /^(?:January|February|March|April|May|June|July|August|September|October|November|December)/i.test(cleanLine)) {
        break;
      }

      // Skip URLs, IDs, Passcodes, footer/button text
      if (cleanLine.includes('http://') || cleanLine.includes('https://') ||
          /^(?:会議\s*ID|Meeting\s*ID|パスコード|Passcode|ブラウザー|Click here|ここをクリック)/i.test(cleanLine) ||
          /^(?:会議のリンク|Meeting link)/i.test(cleanLine)) {
        continue;
      }

      if (cleanLine.length > 0 && cleanLine.length < 100) {
        titleCandidates.push(cleanLine);
      }
    }

    if (titleCandidates.length > 0) {
      title = titleCandidates.join(' ');
    }
  }

  title = cleanField(title, 200);
  if (!title) {
    title = 'Teams Meeting';
  }

  // 5. Extract Date, Start and End Time
  let startTime: Date | undefined = undefined;
  let endTime: Date | undefined = undefined;

  let year: number | undefined;
  let month: number | undefined;
  let day: number | undefined;

  // Date parsing
  const yearMatch = normalizedText.match(/(\d{4})[-/.\s年]\s*(\d{1,2})[-/.\s月]\s*(\d{1,2})/);
  const eraMatch = normalizedText.match(/(令和|平成|昭和|大正|明治)(元|\d{1,2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  const enDateMatch = normalizedText.match(/(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+)?([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);

  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
    month = parseInt(yearMatch[2], 10) - 1;
    day = parseInt(yearMatch[3], 10);
  } else if (eraMatch) {
    const eraStart = JAPANESE_ERA_START_YEAR[eraMatch[1] as keyof typeof JAPANESE_ERA_START_YEAR];
    const eraYear = eraMatch[2] === '元' ? 1 : parseInt(eraMatch[2], 10);
    year = eraStart + eraYear;
    month = parseInt(eraMatch[3], 10) - 1;
    day = parseInt(eraMatch[4], 10);
  } else if (enDateMatch) {
    const monthName = enDateMatch[1].toLowerCase();
    if (MONTH_NAMES[monthName] !== undefined) {
      year = parseInt(enDateMatch[3], 10);
      month = MONTH_NAMES[monthName];
      day = parseInt(enDateMatch[2], 10);
    }
  }

  // Time parsing
  const timeRangeMatch = normalizedText.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\s*(?:-|–|—|~|to)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?(?:\s*\(([^)]+)\))?/i);
  const timeMatch = timeRangeMatch ? null : normalizedText.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?(?:\s*\(([^)]+)\))?/i);

  const applyAmPm = (h: number, ampm?: string) => {
    if (!ampm) { return h; }
    if (ampm.toUpperCase() === 'PM' && h < 12) { return h + 12; }
    if (ampm.toUpperCase() === 'AM' && h === 12) { return 0; }
    return h;
  };

  const tzStr = timeRangeMatch ? timeRangeMatch[9] : (timeMatch ? timeMatch[5] : undefined);
  const timeZone = normalizeTimeZone(tzStr);

  if (year !== undefined && month !== undefined && day !== undefined) {
    let sHour = 9, sMinute = 0, sSecond = 0;

    if (timeRangeMatch) {
      const tr = timeRangeMatch;
      sHour = applyAmPm(parseInt(tr[1], 10), tr[4]);
      sMinute = parseInt(tr[2], 10);
      sSecond = tr[3] ? parseInt(tr[3], 10) : 0;
      startTime = createDateWithOffset(year, month, day, sHour, sMinute, sSecond, timeZone);

      const eHour = applyAmPm(parseInt(tr[5], 10), tr[8]);
      const eMinute = parseInt(tr[6], 10);
      const eSecond = tr[7] ? parseInt(tr[7], 10) : 0;
      endTime = createDateWithOffset(year, month, day, eHour, eMinute, eSecond, timeZone);
      if (endTime < startTime) {
        endTime = createDateWithOffset(year, month, day + 1, eHour, eMinute, eSecond, timeZone);
      }
    } else if (timeMatch) {
      const tm = timeMatch;
      sHour = applyAmPm(parseInt(tm[1], 10), tm[4]);
      sMinute = parseInt(tm[2], 10);
      sSecond = tm[3] ? parseInt(tm[3], 10) : 0;
      startTime = createDateWithOffset(year, month, day, sHour, sMinute, sSecond, timeZone);
    } else {
      startTime = createDateWithOffset(year, month, day, sHour, sMinute, sSecond, timeZone);
    }
  } else if (timeRangeMatch || timeMatch) {
    const now = new Date();
    if (timeRangeMatch) {
      const tr = timeRangeMatch;
      const sHour = applyAmPm(parseInt(tr[1], 10), tr[4]);
      const sMinute = parseInt(tr[2], 10);
      const nowParts = getZonedDateParts(now, timeZone);
      let candidateStart = createDateWithOffset(nowParts.year, nowParts.month, nowParts.day, sHour, sMinute, 0, timeZone);

      const eHour = applyAmPm(parseInt(tr[5], 10), tr[8]);
      const eMinute = parseInt(tr[6], 10);
      endTime = createDateWithOffset(nowParts.year, nowParts.month, nowParts.day, eHour, eMinute, 0, timeZone);
      if (endTime < candidateStart) {
        endTime = createDateWithOffset(nowParts.year, nowParts.month, nowParts.day + 1, eHour, eMinute, 0, timeZone);
      }

      if (endTime <= now) {
        candidateStart = createDateWithOffset(nowParts.year, nowParts.month, nowParts.day + 1, sHour, sMinute, 0, timeZone);
        endTime = createDateWithOffset(nowParts.year, nowParts.month, nowParts.day + 1, eHour, eMinute, 0, timeZone);
      }
      startTime = candidateStart;
    } else if (timeMatch) {
      const tm = timeMatch;
      const sHour = applyAmPm(parseInt(tm[1], 10), tm[4]);
      const sMinute = parseInt(tm[2], 10);
      const nowParts = getZonedDateParts(now, timeZone);
      let candidateStart = createDateWithOffset(nowParts.year, nowParts.month, nowParts.day, sHour, sMinute, 0, timeZone);

      if (candidateStart.getTime() + 30 * 60 * 1000 <= now.getTime()) {
        candidateStart = createDateWithOffset(nowParts.year, nowParts.month, nowParts.day + 1, sHour, sMinute, 0, timeZone);
      }
      startTime = candidateStart;
    }
  }

  // 6. Extract Recurrence Info
  const recurrenceInfo = parseRecurrenceInfo(normalizedText, startTime, timeZone);

  return {
    title,
    url,
    startTime,
    endTime,
    timeZone,
    organizer,
    meetingId,
    passcode,
    isEnterprise,
    ...recurrenceInfo
  };
}
