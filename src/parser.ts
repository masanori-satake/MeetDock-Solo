import { ParsedMeetingInfo, RecurrenceType } from './types';
import { getTeamsUrlFromSafeLink, isValidTeamsUrl } from './urlValidator';

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

function getTimezoneOffsetString(tzStr: string | undefined): string | null {
  if (!tzStr) {
    return null;
  }
  const clean = tzStr.trim();
  if (/^(JST|日本標準時|Japan Standard Time)$/i.test(clean)) {
    return '+09:00';
  }
  if (/^(EST|Eastern Standard Time)$/i.test(clean)) {
    return '-05:00';
  }
  if (/^(EDT|Eastern Daylight Time)$/i.test(clean)) {
    return '-04:00';
  }
  if (/^(CST|Central Standard Time)$/i.test(clean)) {
    return '-06:00';
  }
  if (/^(CDT|Central Daylight Time)$/i.test(clean)) {
    return '-05:00';
  }
  if (/^(MST|Mountain Standard Time)$/i.test(clean)) {
    return '-07:00';
  }
  if (/^(MDT|Mountain Daylight Time)$/i.test(clean)) {
    return '-06:00';
  }
  if (/^(PST|Pacific Standard Time)$/i.test(clean)) {
    return '-08:00';
  }
  if (/^(PDT|Pacific Daylight Time)$/i.test(clean)) {
    return '-07:00';
  }
  if (/^(UTC|GMT)$/i.test(clean)) {
    return '+00:00';
  }

  const matchOffset = clean.match(/(?:UTC|GMT)?\s*([+-]\d{1,2})(?::?(\d{2}))?/i);
  if (matchOffset) {
    const sign = matchOffset[1].startsWith('-') ? '-' : '+';
    const num = Math.abs(parseInt(matchOffset[1], 10));
    const hh = String(num).padStart(2, '0');
    const mm = matchOffset[2] ? matchOffset[2] : '00';
    return `${sign}${hh}:${mm}`;
  }
  return null;
}

function createDateWithOffset(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  tzOffset: string | null
): Date {
  if (tzOffset) {
    const yyyy = String(year).padStart(4, '0');
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const hh = String(hour).padStart(2, '0');
    const min = String(minute).padStart(2, '0');
    const ss = String(second).padStart(2, '0');
    const isoString = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}${tzOffset}`;
    const dateObj = new Date(isoString);
    if (!isNaN(dateObj.getTime())) {
      return dateObj;
    }
  }
  return new Date(year, month, day, hour, minute, second);
}

/**
 * Extracts Teams URL, Title, Start Time, End Time, Organizer, Meeting ID, Passcode, and Recurrence from text.
 */
export function parseMeetingText(text: string): ParsedMeetingInfo {
  const normalizedText = text.replace(/\r\n/g, '\n').trim();
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
        const linkAnchorMatch = normalizedText.match(/(?:会議のリンク|Meeting link):\s*.*?(https?:\/\/[^\s"<>'`]+)/i);
        if (linkAnchorMatch) {
          url = linkAnchorMatch[1].replace(/[.,;)]+$/, '');
        }
      }
    }
  }

  if (url && !isValidTeamsUrl(url)) {
    url = '';
  }

  // 2. Extract Organizer
  let organizer: string | undefined = undefined;
  const jpOrgMatch = normalizedText.match(/^(.+?)\s+Microsoft Teams 会議(?:シリーズ)?に招待されました。/m);
  const enOrgMatch = normalizedText.match(/^(.+?)\s+(?:has invited you to a Teams meeting|invited you to a Microsoft Teams Meeting:|invited you to a Teams Meeting)/m);
  if (jpOrgMatch && jpOrgMatch[1].trim()) {
    organizer = jpOrgMatch[1].trim();
  } else if (enOrgMatch && enOrgMatch[1].trim()) {
    organizer = enOrgMatch[1].trim();
  }

  // 3. Extract Meeting ID & Passcode & Enterprise flag
  let meetingId: string | undefined = undefined;
  let passcode: string | undefined = undefined;
  const meetingIdMatch = normalizedText.match(/(?:会議\s*ID|Meeting\s*ID):[^\S\r\n]*((?:\d|[^\S\r\n]){9,17})/i);
  if (meetingIdMatch) {
    meetingId = meetingIdMatch[1].replace(/\s+/g, '');
  }
  const passcodeMatch = normalizedText.match(/(?:パスコード|Passcode):\s*([A-Za-z0-9]+)/i);
  if (passcodeMatch) {
    passcode = passcodeMatch[1].trim();
  }
  const isEnterprise = Boolean(meetingId || passcode || /(?:会議\s*ID|Meeting\s*ID)/i.test(normalizedText));

  // 4. Extract Recurrence
  let recurrence: RecurrenceType = 'once';
  if (/(?:平日|weekdays|Monday through Friday)/i.test(normalizedText)) {
    recurrence = 'weekdays';
  } else if (/(?:会議シリーズ|series|毎[日週月年]|Occurs every|Every\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|week|month|year))/i.test(normalizedText)) {
    recurrence = 'weekly';
  }

  // 5. Extract Title
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

  // 6. Extract Date, Start and End Time
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
  const tzOffset = getTimezoneOffsetString(tzStr);

  if (year !== undefined && month !== undefined && day !== undefined) {
    let sHour = 9, sMinute = 0, sSecond = 0;

    if (timeRangeMatch) {
      const tr = timeRangeMatch;
      sHour = applyAmPm(parseInt(tr[1], 10), tr[4]);
      sMinute = parseInt(tr[2], 10);
      sSecond = tr[3] ? parseInt(tr[3], 10) : 0;
      startTime = createDateWithOffset(year, month, day, sHour, sMinute, sSecond, tzOffset);

      const eHour = applyAmPm(parseInt(tr[5], 10), tr[8]);
      const eMinute = parseInt(tr[6], 10);
      const eSecond = tr[7] ? parseInt(tr[7], 10) : 0;
      endTime = createDateWithOffset(year, month, day, eHour, eMinute, eSecond, tzOffset);
      if (endTime < startTime) {
        endTime.setDate(endTime.getDate() + 1);
      }
    } else if (timeMatch) {
      const tm = timeMatch;
      sHour = applyAmPm(parseInt(tm[1], 10), tm[4]);
      sMinute = parseInt(tm[2], 10);
      sSecond = tm[3] ? parseInt(tm[3], 10) : 0;
      startTime = createDateWithOffset(year, month, day, sHour, sMinute, sSecond, tzOffset);
    } else {
      startTime = createDateWithOffset(year, month, day, sHour, sMinute, sSecond, tzOffset);
    }
  } else if (timeRangeMatch || timeMatch) {
    const now = new Date();
    if (timeRangeMatch) {
      const tr = timeRangeMatch;
      const sHour = applyAmPm(parseInt(tr[1], 10), tr[4]);
      const sMinute = parseInt(tr[2], 10);
      const candidateStart = createDateWithOffset(now.getFullYear(), now.getMonth(), now.getDate(), sHour, sMinute, 0, tzOffset);

      const eHour = applyAmPm(parseInt(tr[5], 10), tr[8]);
      const eMinute = parseInt(tr[6], 10);
      endTime = createDateWithOffset(now.getFullYear(), now.getMonth(), now.getDate(), eHour, eMinute, 0, tzOffset);
      if (endTime < candidateStart) {
        endTime.setDate(endTime.getDate() + 1);
      }

      if (endTime <= now) {
        candidateStart.setDate(candidateStart.getDate() + 1);
        endTime.setDate(endTime.getDate() + 1);
      }
      startTime = candidateStart;
    } else if (timeMatch) {
      const tm = timeMatch;
      const sHour = applyAmPm(parseInt(tm[1], 10), tm[4]);
      const sMinute = parseInt(tm[2], 10);
      const candidateStart = createDateWithOffset(now.getFullYear(), now.getMonth(), now.getDate(), sHour, sMinute, 0, tzOffset);

      if (candidateStart.getTime() + 30 * 60 * 1000 <= now.getTime()) {
        candidateStart.setDate(candidateStart.getDate() + 1);
      }
      startTime = candidateStart;
    }
  }

  return {
    title,
    url,
    startTime,
    endTime,
    organizer,
    meetingId,
    passcode,
    isEnterprise,
    recurrence
  };
}
