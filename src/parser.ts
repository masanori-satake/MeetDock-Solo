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

  // 3. Extract Start Time
  let startTime: Date | undefined = undefined;

  // Check full date pattern: YYYY-MM-DD or YYYY年MM月DD日
  const yearMatch = text.match(/(\d{4})[-/.\s年]\s*(\d{1,2})[-/.\s月]\s*(\d{1,2})/);
  const eraMatch = text.match(/(令和|平成|昭和|大正|明治)(元|\d{1,2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  const timeMatch = text.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?/i);

  if (yearMatch || eraMatch) {
    const year = yearMatch
      ? parseInt(yearMatch[1], 10)
      : JAPANESE_ERA_START_YEAR[eraMatch![1] as keyof typeof JAPANESE_ERA_START_YEAR]
        + (eraMatch![2] === '元' ? 1 : parseInt(eraMatch![2], 10));
    const month = parseInt(yearMatch ? yearMatch[2] : eraMatch![3], 10) - 1;
    const day = parseInt(yearMatch ? yearMatch[3] : eraMatch![4], 10);

    let hour = 9;
    let minute = 0;
    let second = 0;

    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10);
      minute = parseInt(timeMatch[2], 10);
      second = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
      const ampm = timeMatch[4];

      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hour < 12) {
          hour += 12;
        } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
          hour = 0;
        }
      }
    }
    startTime = new Date(year, month, day, hour, minute, second);
  } else if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    const ampm = timeMatch[4];

    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hour < 12) {
        hour += 12;
      } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
        hour = 0;
      }
    }

    const now = new Date();
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
    if (candidate.getTime() + 30 * 60 * 1000 <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }
    startTime = candidate;
  }

  return {
    title,
    url,
    startTime
  };
}
