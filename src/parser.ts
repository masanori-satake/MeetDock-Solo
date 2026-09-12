import { ParsedMeetingInfo } from './types';

const MAX_TITLE_LENGTH = 100;

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
  const subjectMatch = text.match(/(?:Subject|件名|タイトル|Title):\s*([^<\r\n]+)/i);
  if (subjectMatch && subjectMatch[1].trim()) {
    title = subjectMatch[1].trim().slice(0, MAX_TITLE_LENGTH);
  } else {
    // Look at non-empty lines before the URL
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (!line.includes('https://teams.microsoft.com') &&
          !line.includes('https://teams.live.com') &&
          !/^\d{1,2}:\d{2}/.test(line) &&
          !/^\d{4}[-/.]/.test(line)) {
        // Strip common html tags if dropped text contained html
        const cleanLine = line.replace(/<[^>]*>/g, '').trim();
        if (cleanLine.length > 0 && cleanLine.length <= MAX_TITLE_LENGTH) {
          title = cleanLine;
          break;
        }
      }
    }
  }

  // 3. Extract Start Time
  let startTime: Date | undefined = undefined;

  // Check full ISO or YYYY-MM-DD HH:mm pattern
  const fullDateRegex = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?/i;
  const fullDateMatch = text.match(fullDateRegex);

  if (fullDateMatch) {
    if (fullDateMatch[7]) {
      startTime = new Date(fullDateMatch[0]);
    } else {
      const year = parseInt(fullDateMatch[1], 10);
      const month = parseInt(fullDateMatch[2], 10) - 1;
      const day = parseInt(fullDateMatch[3], 10);
      const hour = fullDateMatch[4] ? parseInt(fullDateMatch[4], 10) : 9;
      const minute = fullDateMatch[5] ? parseInt(fullDateMatch[5], 10) : 0;
      const second = fullDateMatch[6] ? parseInt(fullDateMatch[6], 10) : 0;
      startTime = new Date(year, month, day, hour, minute, second);
    }
  } else {
    // Check HH:mm pattern
    const timeRegex = /(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?/i;
    const timeMatch = text.match(timeRegex);
    if (timeMatch) {
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
      // If candidate is earlier today by more than 1 hour, maybe it's for tomorrow or keep today
      startTime = candidate;
    }
  }

  return {
    title,
    url,
    startTime
  };
}
