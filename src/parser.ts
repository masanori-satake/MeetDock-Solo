import { ParsedMeetingInfo } from './types';

const JAPANESE_ERA_START_YEAR = {
  令和: 2018,
  平成: 1988,
  昭和: 1925,
  大正: 1911,
  明治: 1867
} as const;

/**
 * Extracts Teams URL, Title, and Start Time from dropped or pasted text/HTML.
 */
export function parseMeetingText(text: string): ParsedMeetingInfo {
  // 1. Extract Teams URL
  // Teams URL pattern matches https://teams.microsoft.com/... or https://teams.live.com/...
  const urlRegex = /https:\/\/teams\.(?:microsoft|live)\.com\/l\/meetup-join\/[^\s"<>'`]+/i;
  const matchUrl = text.match(urlRegex);

  let url = '';
  if (matchUrl) {
    url = matchUrl[0];
    // Clean up trailing punctuation if any
    url = url.replace(/[.,;)]+$/, '');
  } else {
    // Fallback search for general teams links if meetup-join format is slightly different
    const fallbackUrlRegex = /https:\/\/teams\.(?:microsoft|live)\.com\/[^\s"<>'`]+/i;
    const fallbackMatch = text.match(fallbackUrlRegex);
    if (fallbackMatch) {
      url = fallbackMatch[0].replace(/[.,;)]+$/, '');
    }
  }

  // 2. Extract Title
  let title = 'Teams Meeting';
  // Try to find explicit "Subject: ..." or "Title: ..."
  const subjectMatch = text.match(/(?:Subject|件名|タイトル|Title):\s*(.+)/i);
  if (subjectMatch && subjectMatch[1].trim()) {
    title = subjectMatch[1].trim();
  } else {
    // Look at non-empty lines before the URL
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.includes('https://teams.microsoft.com') || line.includes('https://teams.live.com')) {
        continue;
      }

      // Strip common html tags if dropped text contained html
      const cleanLine = line.replace(/<[^>]*>/g, '').trim();
      if (!cleanLine) {
        continue;
      }

      // Skip invitation header phrases
      if (/(?:Microsoft\s*)?Teams\s*会議に招待/i.test(cleanLine) ||
          /が.*Teams.*会議に招待/i.test(cleanLine) ||
          /has invited you to/i.test(cleanLine) ||
          /invited you to/i.test(cleanLine) ||
          /you'?re invited to/i.test(cleanLine) ||
          /you have been invited to/i.test(cleanLine) ||
          /you are invited to/i.test(cleanLine) ||
          /^Microsoft\s*Teams\s*会議$/i.test(cleanLine) ||
          /^Teams\s*会議$/i.test(cleanLine) ||
          /^(?:会議のリンク|Meeting link|Join the meeting|Click here to join)/i.test(cleanLine)) {
        continue;
      }

      // Skip lines starting with time or date
      if (/^\d{1,2}:\d{2}/.test(cleanLine) ||
          /^\d{4}[-/.\s年]/.test(cleanLine) ||
          /^(?:令和|平成|昭和|大正|明治)(?:元|\d{1,2})年/.test(cleanLine) ||
          /^\d{1,2}月\d{1,2}日/.test(cleanLine) ||
          /^(?:月曜日|火曜日|水曜日|木曜日|金曜日|土曜日|日曜日|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i.test(cleanLine)) {
        continue;
      }

      if (cleanLine.length > 0 && cleanLine.length < 100) {
        title = cleanLine;
        break;
      }
    }
  }

  // 3. Extract Start and End Time
  let startTime: Date | undefined = undefined;
  let endTime: Date | undefined = undefined;

  // Check full date pattern: YYYY-MM-DD or YYYY年MM月DD日
  const yearMatch = text.match(/(\d{4})[-/.\s年]\s*(\d{1,2})[-/.\s月]\s*(\d{1,2})/);
  const eraMatch = text.match(/(令和|平成|昭和|大正|明治)(元|\d{1,2})年\s*(\d{1,2})月\s*(\d{1,2})日/);

  // Check for time range first
  const timeRangeMatch = text.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?\s*(?:-|~|～|to)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?/i);
  // Fallback to single time
  const timeMatch = timeRangeMatch ? null : text.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?/i);

  const applyAmPm = (h: number, ampm?: string) => {
    if (!ampm) {return h;}
    if (ampm.toUpperCase() === 'PM' && h < 12) {return h + 12;}
    if (ampm.toUpperCase() === 'AM' && h === 12) {return 0;}
    return h;
  };

  if (yearMatch || eraMatch) {
    const year = yearMatch
      ? parseInt(yearMatch[1], 10)
      : JAPANESE_ERA_START_YEAR[eraMatch![1] as keyof typeof JAPANESE_ERA_START_YEAR]
        + (eraMatch![2] === '元' ? 1 : parseInt(eraMatch![2], 10));
    const month = parseInt(yearMatch ? yearMatch[2] : eraMatch![3], 10) - 1;
    const day = parseInt(yearMatch ? yearMatch[3] : eraMatch![4], 10);

    let sHour = 9, sMinute = 0, sSecond = 0;

    if (timeRangeMatch) {
      sHour = applyAmPm(parseInt(timeRangeMatch[1], 10), timeRangeMatch[4]);
      sMinute = parseInt(timeRangeMatch[2], 10);
      sSecond = timeRangeMatch[3] ? parseInt(timeRangeMatch[3], 10) : 0;
      startTime = new Date(year, month, day, sHour, sMinute, sSecond);

      let eHour = applyAmPm(parseInt(timeRangeMatch[5], 10), timeRangeMatch[8]);
      let eMinute = parseInt(timeRangeMatch[6], 10);
      let eSecond = timeRangeMatch[7] ? parseInt(timeRangeMatch[7], 10) : 0;
      endTime = new Date(year, month, day, eHour, eMinute, eSecond);
      if (endTime < startTime) {
        endTime.setDate(endTime.getDate() + 1);
      }
    } else if (timeMatch) {
      sHour = applyAmPm(parseInt(timeMatch[1], 10), timeMatch[4]);
      sMinute = parseInt(timeMatch[2], 10);
      sSecond = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      startTime = new Date(year, month, day, sHour, sMinute, sSecond);
    } else {
      startTime = new Date(year, month, day, sHour, sMinute, sSecond);
    }
  } else if (timeRangeMatch || timeMatch) {
    const now = new Date();
    if (timeRangeMatch) {
      let sHour = applyAmPm(parseInt(timeRangeMatch[1], 10), timeRangeMatch[4]);
      let sMinute = parseInt(timeRangeMatch[2], 10);
      let candidateStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sHour, sMinute, 0);

      // If missing date and candidate is already passed, maybe it's tomorrow
      if (candidateStart.getTime() + 30 * 60 * 1000 <= now.getTime()) {
        candidateStart.setDate(candidateStart.getDate() + 1);
      }
      startTime = candidateStart;

      let eHour = applyAmPm(parseInt(timeRangeMatch[5], 10), timeRangeMatch[8]);
      let eMinute = parseInt(timeRangeMatch[6], 10);
      endTime = new Date(candidateStart.getFullYear(), candidateStart.getMonth(), candidateStart.getDate(), eHour, eMinute, 0);
      if (endTime < startTime) {
        endTime.setDate(endTime.getDate() + 1);
      }
    } else if (timeMatch) {
      let sHour = applyAmPm(parseInt(timeMatch[1], 10), timeMatch[4]);
      let sMinute = parseInt(timeMatch[2], 10);
      let candidateStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sHour, sMinute, 0);

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
    endTime
  };
}
