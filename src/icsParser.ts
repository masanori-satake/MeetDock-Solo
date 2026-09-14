import { Meeting, ParsedMeetingInfo, RecurrenceType } from './types';
import { getTeamsUrlFromSafeLink, isValidTeamsUrl } from './urlValidator';
import { addZonedDays, createDateInTimeZone, getDaysInMonth, getZonedDateParts, normalizeTimeZone } from './dateTime';
import { getNextOccurrence } from './meetingManager';

export interface IcsProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

export interface IcsComponent {
  name: string;
  properties: IcsProperty[];
  subComponents: IcsComponent[];
}

/**
 * Normalizes newlines, strips UTF-8 BOM, and unfolds lines according to RFC 5545 (Section 3.1).
 * Folded lines start with CRLF/LF followed by a SPACE (0x20) or TAB (0x09).
 */
export function unfoldIcsContent(content: string): string {
  let clean = content.startsWith('\uFEFF') ? content.slice(1) : content;
  clean = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  clean = clean.replace(/\n[ \t]/g, '');
  return clean;
}

/**
 * Unescapes RFC 6868 caret escapes in parameter values:
 * ^' -> ", ^n -> newline, ^^ -> ^
 */
export function unescapeParamValue(val: string): string {
  let result = '';
  for (let i = 0; i < val.length; i++) {
    if (val[i] === '^' && i + 1 < val.length) {
      const next = val[i + 1];
      if (next === "'") {
        result += '"';
        i++;
      } else if (next === 'n' || next === 'N') {
        result += '\n';
        i++;
      } else if (next === '^') {
        result += '^';
        i++;
      } else {
        result += '^';
      }
    } else {
      result += val[i];
    }
  }
  return result;
}

/**
 * Parses parameters string into key-value map, taking RFC 5545 quoted parameters and RFC 6868 caret escaping into account.
 */
export function parseParameters(paramStr: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!paramStr) {
    return params;
  }

  let i = 0;
  while (i < paramStr.length) {
    if (paramStr[i] === ';') {
      i++;
      continue;
    }

    const eqIdx = paramStr.indexOf('=', i);
    if (eqIdx === -1) {
      break;
    }

    const paramName = paramStr.substring(i, eqIdx).trim().toUpperCase();
    i = eqIdx + 1;

    let paramVal = '';
    if (i < paramStr.length && paramStr[i] === '"') {
      i++;
      const startQuote = i;
      while (i < paramStr.length && paramStr[i] !== '"') {
        i++;
      }
      paramVal = paramStr.substring(startQuote, i);
      if (i < paramStr.length && paramStr[i] === '"') {
        i++;
      }
    } else {
      const startVal = i;
      while (i < paramStr.length && paramStr[i] !== ';') {
        i++;
      }
      paramVal = paramStr.substring(startVal, i);
    }

    params[paramName] = unescapeParamValue(paramVal);
  }

  return params;
}

/**
 * Unescapes RFC 5545 TEXT value escapes:
 * \\ -> \, \; -> ;, \, -> ,, \n / \N -> newline
 */
export function unescapeIcsText(val: string): string {
  let result = '';
  for (let i = 0; i < val.length; i++) {
    if (val[i] === '\\' && i + 1 < val.length) {
      const next = val[i + 1];
      if (next === '\\') {
        result += '\\';
        i++;
      } else if (next === ';') {
        result += ';';
        i++;
      } else if (next === ',') {
        result += ',';
        i++;
      } else if (next === 'n' || next === 'N') {
        result += '\n';
        i++;
      } else {
        result += next;
        i++;
      }
    } else {
      result += val[i];
    }
  }
  return result;
}

export function parseIcsLine(line: string): IcsProperty | null {
  if (!line || line.trim().startsWith(';')) {
    return null;
  }

  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) {
    return null;
  }

  const nameAndParams = line.substring(0, colonIdx);
  const value = line.substring(colonIdx + 1);

  const semiIdx = nameAndParams.indexOf(';');
  let name = '';
  let paramsStr = '';

  if (semiIdx === -1) {
    name = nameAndParams.trim().toUpperCase();
  } else {
    name = nameAndParams.substring(0, semiIdx).trim().toUpperCase();
    paramsStr = nameAndParams.substring(semiIdx + 1);
  }

  const params = parseParameters(paramsStr);
  return { name, params, value };
}

export function parseIcsComponents(content: string): IcsComponent {
  const unfolded = unfoldIcsContent(content);
  const lines = unfolded.split('\n');

  const rootComponent: IcsComponent = {
    name: 'ROOT',
    properties: [],
    subComponents: [],
  };

  const stack: IcsComponent[] = [rootComponent];

  for (const line of lines) {
    const prop = parseIcsLine(line);
    if (!prop) {
      continue;
    }

    const current = stack[stack.length - 1];

    if (prop.name === 'BEGIN') {
      const newComp: IcsComponent = {
        name: prop.value.trim().toUpperCase(),
        properties: [],
        subComponents: [],
      };
      current.subComponents.push(newComp);
      stack.push(newComp);
    } else if (prop.name === 'END') {
      const endingName = prop.value.trim().toUpperCase();
      if (stack.length > 1 && current.name === endingName) {
        stack.pop();
      }
    } else {
      current.properties.push(prop);
    }
  }

  return rootComponent;
}

/**
 * Maps common time zone names or TZID strings to standard IANA or offset timezones.
 */
function resolveIcsTimeZone(tzid: string | undefined): string | undefined {
  if (!tzid) {
    return undefined;
  }
  const cleaned = tzid.replace(/^["']|["']$/g, '').trim();
  return normalizeTimeZone(cleaned);
}

/**
 * Parses DATE or DATE-TIME strings per RFC 5545 Section 3.3.4 / 3.3.5.
 */
export function parseIcsDateTime(prop: IcsProperty, timeZoneAliasMap?: Map<string, string>): { date: Date; timeZone?: string } {
  const val = prop.value.trim();
  const rawTzid = prop.params['TZID'];
  let timeZone = resolveIcsTimeZone(rawTzid);
  if (!timeZone && rawTzid && timeZoneAliasMap) {
    timeZone = timeZoneAliasMap.get(rawTzid.replace(/^["']|["']$/g, '').trim());
  }

  // Check UTC (ends with Z)
  if (val.endsWith('Z')) {
    const cleanVal = val.slice(0, -1);
    const m = cleanVal.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
    if (m) {
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const d = parseInt(m[3], 10);
      const h = parseInt(m[4], 10);
      const min = parseInt(m[5], 10);
      const s = parseInt(m[6], 10);
      return { date: new Date(Date.UTC(y, mo, d, h, min, s)), timeZone: '+00:00' };
    }
  }

  // DATE-TIME (YYYYMMDDTHHMMSS)
  const dtMatch = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (dtMatch) {
    const y = parseInt(dtMatch[1], 10);
    const mo = parseInt(dtMatch[2], 10) - 1;
    const d = parseInt(dtMatch[3], 10);
    const h = parseInt(dtMatch[4], 10);
    const min = parseInt(dtMatch[5], 10);
    const s = parseInt(dtMatch[6], 10);
    return { date: createDateInTimeZone(y, mo, d, h, min, s, 0, timeZone), timeZone };
  }

  // DATE only (YYYYMMDD)
  const dMatch = val.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dMatch) {
    const y = parseInt(dMatch[1], 10);
    const mo = parseInt(dMatch[2], 10) - 1;
    const d = parseInt(dMatch[3], 10);
    return { date: createDateInTimeZone(y, mo, d, 0, 0, 0, 0, timeZone), timeZone };
  }

  // Fallback ISO or standard Date parse
  return { date: new Date(val), timeZone };
}

/**
 * Parses DURATION value e.g., PT1H30M, P1D, -PT15M
 */
export function parseIcsDuration(durationStr: string): number {
  const match = durationStr.trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) {
    return 0;
  }
  const sign = match[1] === '-' ? -1 : 1;
  const weeks = parseInt(match[2] || '0', 10);
  const days = parseInt(match[3] || '0', 10);
  const hours = parseInt(match[4] || '0', 10);
  const minutes = parseInt(match[5] || '0', 10);
  const seconds = parseInt(match[6] || '0', 10);

  const totalMs = (((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 * 1000 + seconds * 1000;
  return sign * totalMs;
}

/**
 * Extracts candidate Teams join URL from a text or property in strict priority order.
 */
export function extractTeamsUrlFromIcsProperties(properties: IcsProperty[]): string | undefined {
  const findUrlInText = (text: string): string | undefined => {
    if (!text) { return undefined; }

    // 1. SafeLinks matching
    const safeLinksMatch = text.match(/https:\/\/[a-zA-Z0-9.-]+\.safelinks\.protection\.outlook\.com\/[^\s"<>'`]+/i);
    if (safeLinksMatch) {
      const safeUrl = safeLinksMatch[0].replace(/[.,;)]+$/, '');
      const targetUrl = getTeamsUrlFromSafeLink(safeUrl);
      if (targetUrl && isValidTeamsUrl(targetUrl)) {
        return targetUrl.replace(/[.,;)]+$/, '');
      }
    }

    // 2. Direct Teams meetup-join or meet URL
    const urlRegex = /https:\/\/teams\.(?:microsoft|live)\.com\/(?:l\/meetup-join|meet)\/[^\s"<>'`]+/i;
    const matchUrl = text.match(urlRegex);
    if (matchUrl) {
      const candidate = matchUrl[0].replace(/[.,;)]+$/, '');
      if (isValidTeamsUrl(candidate)) {
        return candidate;
      }
    }

    // 3. Any teams.microsoft.com or teams.live.com HTTPS URL
    const fallbackUrlRegex = /https:\/\/teams\.(?:microsoft|live)\.com\/[^\s"<>'`]+/i;
    const fallbackMatch = text.match(fallbackUrlRegex);
    if (fallbackMatch) {
      const candidate = fallbackMatch[0].replace(/[.,;)]+$/, '');
      if (isValidTeamsUrl(candidate)) {
        return candidate;
      }
    }

    return undefined;
  };

  // Priority 1: X-MICROSOFT-SKYPETEAMSMEETINGURL
  const skypeProp = properties.find(p => p.name === 'X-MICROSOFT-SKYPETEAMSMEETINGURL');
  if (skypeProp) {
    const unescaped = unescapeIcsText(skypeProp.value).trim();
    const url = findUrlInText(unescaped) || (isValidTeamsUrl(unescaped) ? unescaped : undefined);
    if (url) {
      return url;
    }
  }

  // Priority 2: URL
  const urlProp = properties.find(p => p.name === 'URL');
  if (urlProp) {
    const unescaped = unescapeIcsText(urlProp.value).trim();
    const url = findUrlInText(unescaped) || (isValidTeamsUrl(unescaped) ? unescaped : undefined);
    if (url) {
      return url;
    }
  }

  // Priority 3: DESCRIPTION
  const descProp = properties.find(p => p.name === 'DESCRIPTION');
  if (descProp) {
    const unescaped = unescapeIcsText(descProp.value);
    const url = findUrlInText(unescaped);
    if (url) {
      return url;
    }
  }

  // Priority 4: X-ALT-DESC
  const altDescProp = properties.find(p => p.name === 'X-ALT-DESC');
  if (altDescProp) {
    const unescaped = unescapeIcsText(altDescProp.value);
    const url = findUrlInText(unescaped);
    if (url) {
      return url;
    }
  }

  return undefined;
}

/**
 * Extracts organizer display name / email from ORGANIZER property.
 */
export function extractOrganizerFromIcs(prop: IcsProperty | undefined): string | undefined {
  if (!prop) { return undefined; }
  const cn = prop.params['CN'];
  if (cn) {
    return unescapeParamValue(cn);
  }
  let val = prop.value.trim();
  if (val.toLowerCase().startsWith('mailto:')) {
    val = val.substring(7);
  }
  return val || undefined;
}

/**
 * Extracts attendees list from ATTENDEE properties.
 */
export function extractAttendeesFromIcs(properties: IcsProperty[]): string[] {
  const attendees: string[] = [];
  for (const prop of properties.filter(p => p.name === 'ATTENDEE')) {
    const cn = prop.params['CN'];
    if (cn) {
      attendees.push(unescapeParamValue(cn));
    } else {
      let val = prop.value.trim();
      if (val.toLowerCase().startsWith('mailto:')) {
        val = val.substring(7);
      }
      if (val) {
        attendees.push(val);
      }
    }
  }
  return attendees;
}

const DAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export interface ParsedRrule {
  freq: string;
  interval: number;
  count?: number;
  until?: Date;
  byday?: Array<{ day: number; setpos?: number }>;
  bymonthday?: number[];
  bymonth?: number[];
  bysetpos?: number[];
  wkst?: string;
}

export function parseRrule(rruleStr: string, timeZoneAliasMap?: Map<string, string>): ParsedRrule | undefined {
  if (!rruleStr) { return undefined; }
  const parts = rruleStr.split(';');
  let freq = '';
  let interval = 1;
  let count: number | undefined = undefined;
  let until: Date | undefined = undefined;
  const byday: Array<{ day: number; setpos?: number }> = [];
  const bymonthday: number[] = [];
  const bymonth: number[] = [];
  const bysetpos: number[] = [];
  let wkst: string | undefined = undefined;

  for (const part of parts) {
    const [kvKey, kvVal] = part.split('=');
    if (!kvKey || !kvVal) { continue; }
    const key = kvKey.trim().toUpperCase();
    const val = kvVal.trim();

    if (key === 'FREQ') {
      freq = val.toUpperCase();
    } else if (key === 'INTERVAL') {
      interval = parseInt(val, 10) || 1;
    } else if (key === 'COUNT') {
      count = parseInt(val, 10);
    } else if (key === 'UNTIL') {
      const dtProp: IcsProperty = { name: 'UNTIL', params: {}, value: val };
      until = parseIcsDateTime(dtProp, timeZoneAliasMap).date;
    } else if (key === 'WKST') {
      wkst = val.toUpperCase();
    } else if (key === 'BYDAY') {
      const days = val.split(',');
      for (const d of days) {
        const m = d.trim().match(/^([+-]?\d+)?([A-Z]{2})$/i);
        if (m) {
          const pos = m[1] ? parseInt(m[1], 10) : undefined;
          const dayCode = m[2].toUpperCase();
          if (DAY_MAP[dayCode] !== undefined) {
            byday.push({ day: DAY_MAP[dayCode], setpos: pos });
          }
        }
      }
    } else if (key === 'BYMONTHDAY') {
      const mdays = val.split(',');
      for (const md of mdays) {
        const num = parseInt(md, 10);
        if (!isNaN(num)) { bymonthday.push(num); }
      }
    } else if (key === 'BYMONTH') {
      const mos = val.split(',');
      for (const mo of mos) {
        const num = parseInt(mo, 10);
        if (!isNaN(num)) { bymonth.push(num); }
      }
    } else if (key === 'BYSETPOS') {
      const sps = val.split(',');
      for (const sp of sps) {
        const num = parseInt(sp, 10);
        if (!isNaN(num)) { bysetpos.push(num); }
      }
    }
  }

  if (!freq) { return undefined; }
  return { freq, interval, count, until, byday, bymonthday, bymonth, bysetpos, wkst };
}

/**
 * Parses a VTIMEZONE component to map TZID to standard IANA or offset timezones if possible.
 */
function buildTimeZoneAliasMap(vtimezoneComps: IcsComponent[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const vtz of vtimezoneComps) {
    const tzidProp = vtz.properties.find(p => p.name === 'TZID');
    if (!tzidProp) { continue; }
    const rawTzid = tzidProp.value.replace(/^["']|["']$/g, '').trim();

    // Look for X-LIC-LOCATION or standard aliases
    const licProp = vtz.properties.find(p => p.name === 'X-LIC-LOCATION');
    if (licProp) {
      const normLic = normalizeTimeZone(licProp.value.trim());
      if (normLic) {
        map.set(rawTzid, normLic);
        continue;
      }
    }

    const normTzid = normalizeTimeZone(rawTzid);
    if (normTzid) {
      map.set(rawTzid, normTzid);
      continue;
    }

    // Try offset from STANDARD / DAYLIGHT
    const stdOrDay = vtz.subComponents.find(sc => sc.name === 'STANDARD' || sc.name === 'DAYLIGHT');
    if (stdOrDay) {
      const offsetToProp = stdOrDay.properties.find(p => p.name === 'TZOFFSETTO');
      if (offsetToProp) {
        const normOffset = normalizeTimeZone(offsetToProp.value.trim());
        if (normOffset) {
          map.set(rawTzid, normOffset);
        }
      }
    }
  }
  return map;
}

/**
 * Converts a parsed VEVENT component into ParsedMeetingInfo / Meeting structure.
 */
export function parseSingleVEvent(
  vevent: IcsComponent,
  timeZoneAliasMap: Map<string, string>
): ParsedMeetingInfo {
  const getProp = (name: string) => vevent.properties.find(p => p.name === name);
  const getProps = (name: string) => vevent.properties.filter(p => p.name === name);

  // 1. UID & Sequence & Status
  const uidProp = getProp('UID');
  const uid = uidProp ? unescapeIcsText(uidProp.value).trim() : undefined;

  const seqProp = getProp('SEQUENCE');
  const sequence = seqProp ? parseInt(seqProp.value, 10) : 0;

  const statusProp = getProp('STATUS');
  const status = statusProp ? unescapeIcsText(statusProp.value).trim().toUpperCase() : 'CONFIRMED';

  // 2. Summary (Title)
  const summaryProp = getProp('SUMMARY');
  const title = summaryProp ? unescapeIcsText(summaryProp.value).trim() : 'Teams Meeting';

  // 3. Start Time & TimeZone
  const dtstartProp = getProp('DTSTART');
  let startTime: Date | undefined = undefined;
  let timeZone: string | undefined = undefined;
  if (dtstartProp) {
    const parsedStart = parseIcsDateTime(dtstartProp, timeZoneAliasMap);
    startTime = parsedStart.date;
    timeZone = parsedStart.timeZone;
  }

  // 4. End Time / Duration
  const dtendProp = getProp('DTEND');
  const durationProp = getProp('DURATION');
  let endTime: Date | undefined = undefined;

  if (dtendProp) {
    endTime = parseIcsDateTime(dtendProp, timeZoneAliasMap).date;
  } else if (durationProp && startTime) {
    const durMs = parseIcsDuration(durationProp.value);
    endTime = new Date(startTime.getTime() + durMs);
  } else if (startTime) {
    endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
  }

  // 5. Teams Join URL
  const url = extractTeamsUrlFromIcsProperties(vevent.properties) || '';

  // 6. Organizer & Attendees & Location & Description
  const organizer = extractOrganizerFromIcs(getProp('ORGANIZER'));
  const attendees = extractAttendeesFromIcs(vevent.properties);
  const locationProp = getProp('LOCATION');
  const location = locationProp ? unescapeIcsText(locationProp.value).trim() : undefined;

  const descProp = getProp('DESCRIPTION');
  const description = descProp ? unescapeIcsText(descProp.value) : undefined;

  // 7. VALARM / Reminders
  let alarmMinutes: number | undefined = undefined;
  const valarms = vevent.subComponents.filter(c => c.name === 'VALARM');
  if (valarms.length > 0) {
    const trigProp = valarms[0].properties.find(p => p.name === 'TRIGGER');
    if (trigProp) {
      const durMs = parseIcsDuration(trigProp.value);
      alarmMinutes = Math.abs(Math.round(durMs / (60 * 1000)));
    }
  }

  // 8. Recurrence (RRULE)
  const rruleProp = getProp('RRULE');
  let recurrence: RecurrenceType = 'once';
  let recurrenceInterval: number | undefined = undefined;
  let daysOfWeek: number[] | undefined = undefined;
  let dayOfMonth: number | undefined = undefined;
  let monthOfYear: number | undefined = undefined;
  let dayOfYear: number | undefined = undefined;
  let recurrenceByDay: ParsedRrule['byday'] = undefined;
  let recurrenceByMonthDay: number[] | undefined = undefined;
  let recurrenceByMonth: number[] | undefined = undefined;
  let recurrenceBySetPos: number[] | undefined = undefined;
  let recurrenceEndDate: Date | undefined = undefined;

  if (rruleProp) {
    const pr = parseRrule(rruleProp.value, timeZoneAliasMap);
    if (pr) {
      recurrenceInterval = pr.interval;
      recurrenceByDay = pr.byday && pr.byday.length > 0 ? pr.byday : undefined;
      recurrenceByMonthDay = pr.bymonthday && pr.bymonthday.length > 0 ? pr.bymonthday : undefined;
      recurrenceByMonth = pr.bymonth && pr.bymonth.length > 0 ? pr.bymonth : undefined;
      recurrenceBySetPos = pr.bysetpos && pr.bysetpos.length > 0 ? pr.bysetpos : undefined;
      if (pr.until && !(pr.count && pr.count > 0)) {
        recurrenceEndDate = pr.until;
      }

      if (pr.freq === 'DAILY') {
        recurrence = 'daily';
      } else if (pr.freq === 'WEEKLY') {
        if (pr.byday && pr.byday.length === 5 &&
            pr.byday.every(b => [1, 2, 3, 4, 5].includes(b.day))) {
          recurrence = 'weekdays';
        } else {
          recurrence = 'weekly';
          if (pr.byday && pr.byday.length > 0) {
            daysOfWeek = pr.byday.map(b => b.day).sort((a, b) => a - b);
          } else if (startTime) {
            daysOfWeek = [getZonedDateParts(startTime, timeZone).dayOfWeek];
          }
        }
      } else if (pr.freq === 'MONTHLY') {
        recurrence = 'monthly';
        if (pr.bymonthday && pr.bymonthday.length > 0) {
          dayOfMonth = pr.bymonthday[0];
        } else if ((!pr.byday || pr.byday.length === 0)
                   && (!pr.bysetpos || pr.bysetpos.length === 0)
                   && startTime) {
          dayOfMonth = getZonedDateParts(startTime, timeZone).day;
        }
      } else if (pr.freq === 'YEARLY') {
        recurrence = 'yearly';
        if (pr.bymonth && pr.bymonth.length > 0) {
          monthOfYear = pr.bymonth[0];
        } else if (startTime) {
          monthOfYear = getZonedDateParts(startTime, timeZone).month + 1;
        }

        if (pr.bymonthday && pr.bymonthday.length > 0) {
          dayOfYear = pr.bymonthday[0];
        } else if (startTime) {
          dayOfYear = getZonedDateParts(startTime, timeZone).day;
        }
      }

      if (pr.count && pr.count > 0 && startTime && recurrence !== 'once') {
        const duration = endTime ? endTime.getTime() - startTime.getTime() : 30 * 60 * 1000;
        const recurrenceTemplate: Meeting = {
          id: uid || 'ics-count',
          title,
          url,
          startTime: startTime.toISOString(),
          endTime: endTime?.toISOString(),
          timeZone,
          recurrence,
          recurrenceInterval,
          daysOfWeek,
          dayOfMonth,
          monthOfYear,
          dayOfYear,
          recurrenceByDay,
          recurrenceByMonthDay,
          recurrenceByMonth,
          recurrenceBySetPos,
        };
        let countEnd = startTime;
        for (let occurrence = 1; occurrence < pr.count; occurrence++) {
          const next = getNextOccurrence(recurrenceTemplate, new Date(countEnd.getTime() + duration + 1));
          if (!next) {
            break;
          }
          countEnd = next;
        }
        recurrenceEndDate = countEnd;
      }
    }
  }

  // Meeting ID & Passcode checks
  const fullText = `${description || ''}\n${title}`;
  const meetingId = Array.from(
    fullText.matchAll(/(?:会議\s*ID|Meeting\s*ID):\s*([\d\s]{9,25})/gi),
    match => match[1].replace(/\s+/g, '')
  ).find(candidate => /^\d{9,17}$/.test(candidate));
  const passcodeMatch = fullText.match(/(?:パスコード|Passcode):\s*([A-Za-z0-9]+)/i);
  const passcode = passcodeMatch ? passcodeMatch[1] : undefined;
  const isEnterprise = Boolean(meetingId || passcode || /(?:会議\s*ID|Meeting\s*ID)/i.test(fullText));

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
    recurrence,
    recurrenceInterval,
    daysOfWeek,
    dayOfMonth,
    monthOfYear,
    dayOfYear,
    recurrenceByDay,
    recurrenceByMonthDay,
    recurrenceByMonth,
    recurrenceBySetPos,
    recurrenceEndDate,
    uid,
    sequence,
    status,
    location,
    description,
    attendees,
    alarmMinutes,
  };
}

/**
 * Main parser for ICS file content according to RFC 5545 and Microsoft Outlook / Teams ICS exports.
 * Returns array of ParsedMeetingInfo / Meeting objects resolved with EXDATE, RDATE, RECURRENCE-ID, and CANCELLED overrides.
 */
export function parseIcsContent(icsContent: string, now: Date = new Date()): ParsedMeetingInfo[] {
  const root = parseIcsComponents(icsContent);
  const vcalendar = root.subComponents.find(c => c.name === 'VCALENDAR');
  if (!vcalendar) {
    return [];
  }

  const vtimezoneComps = vcalendar.subComponents.filter(c => c.name === 'VTIMEZONE');
  const timeZoneAliasMap = buildTimeZoneAliasMap(vtimezoneComps);

  const vevents = vcalendar.subComponents.filter(c => c.name === 'VEVENT');
  if (vevents.length === 0) {
    return [];
  }

  // Separate base series VEVENTs (no RECURRENCE-ID) and exception VEVENTs (has RECURRENCE-ID)
  const baseEvents: IcsComponent[] = [];
  const exceptionEvents: IcsComponent[] = [];

  for (const vevent of vevents) {
    const recIdProp = vevent.properties.find(p => p.name === 'RECURRENCE-ID');
    if (recIdProp) {
      exceptionEvents.push(vevent);
    } else {
      baseEvents.push(vevent);
    }
  }

  const results: ParsedMeetingInfo[] = [];
  const matchedExceptionEvents = new Set<IcsComponent>();

  for (const baseVevent of baseEvents) {
    const baseInfo = parseSingleVEvent(baseVevent, timeZoneAliasMap);

    // Filter out CANCELLED base event
    if (baseInfo.status === 'CANCELLED') {
      continue;
    }

    if (!baseInfo.startTime) {
      continue;
    }

    // Collect EXDATE and RDATE for this series
    const exdateProps = baseVevent.properties.filter(p => p.name === 'EXDATE');
    const exdates: Date[] = [];
    for (const exProp of exdateProps) {
      const datesStr = exProp.value.split(',');
      for (const dStr of datesStr) {
        const tempProp = { ...exProp, value: dStr.trim() };
        exdates.push(parseIcsDateTime(tempProp, timeZoneAliasMap).date);
      }
    }

    const rdateProps = baseVevent.properties.filter(p => p.name === 'RDATE');
    const rdates: Date[] = [];
    for (const rProp of rdateProps) {
      const datesStr = rProp.value.split(',');
      for (const dStr of datesStr) {
        const tempProp = { ...rProp, value: dStr.trim() };
        rdates.push(parseIcsDateTime(tempProp, timeZoneAliasMap).date);
      }
    }

    // Process exception VEVENTs matching this base UID
    const relatedExceptions = exceptionEvents.filter(exc => {
      const uidProp = exc.properties.find(p => p.name === 'UID');
      return uidProp && unescapeIcsText(uidProp.value).trim() === baseInfo.uid;
    });

    for (const exc of relatedExceptions) {
      matchedExceptionEvents.add(exc);
    }

    // Compute the effective next occurrence for MeetDock
    // 1. Convert baseInfo to Meeting template
    const duration = baseInfo.endTime
      ? baseInfo.endTime.getTime() - baseInfo.startTime.getTime()
      : 30 * 60 * 1000;

    const meetingTemplate: Meeting = {
      id: baseInfo.uid || 'ics-' + Math.random().toString(36).substring(2, 7),
      title: baseInfo.title,
      url: baseInfo.url,
      startTime: baseInfo.startTime.toISOString(),
      endTime: baseInfo.endTime ? baseInfo.endTime.toISOString() : undefined,
      timeZone: baseInfo.timeZone,
      recurrence: baseInfo.recurrence || 'once',
      recurrenceInterval: baseInfo.recurrenceInterval,
      daysOfWeek: baseInfo.daysOfWeek,
      dayOfMonth: baseInfo.dayOfMonth,
      monthOfYear: baseInfo.monthOfYear,
      dayOfYear: baseInfo.dayOfYear,
      recurrenceByDay: baseInfo.recurrenceByDay,
      recurrenceByMonthDay: baseInfo.recurrenceByMonthDay,
      recurrenceByMonth: baseInfo.recurrenceByMonth,
      recurrenceBySetPos: baseInfo.recurrenceBySetPos,
      recurrenceEndDate: baseInfo.recurrenceEndDate ? baseInfo.recurrenceEndDate.toISOString() : undefined,
      organizer: baseInfo.organizer,
      meetingId: baseInfo.meetingId,
      passcode: baseInfo.passcode,
      isEnterprise: baseInfo.isEnterprise,
    };

    let effectiveStart: Date | null = null;
    let effectiveEnd: Date | null = null;
    let isCancelledOccurrence = false;

    if (baseInfo.recurrence === 'once') {
      effectiveStart = baseInfo.startTime;
      effectiveEnd = baseInfo.endTime || new Date(effectiveStart.getTime() + duration);
    } else {
      // Find upcoming occurrence matching now, taking EXDATE and RECURRENCE-ID into account
      let checkCursor = new Date(now.getTime() - duration - 1000); // look from current time minus duration
      let candidate: Date | null = null;

      for (let attempt = 0; attempt < 50; attempt++) {
        candidate = getNextOccurrence(meetingTemplate, checkCursor);
        if (!candidate) {
          break;
        }

        // Check EXDATE
        const isExdated = exdates.some(ex => Math.abs(ex.getTime() - candidate!.getTime()) < 1000);
        if (isExdated) {
          checkCursor = new Date(candidate.getTime() + duration + 1000);
          continue;
        }

        // Check Exception VEVENT overrides
        const excForCand = relatedExceptions.find(exc => {
          const recIdProp = exc.properties.find(p => p.name === 'RECURRENCE-ID');
          if (!recIdProp) { return false; }
          const recIdDate = parseIcsDateTime(recIdProp, timeZoneAliasMap).date;
          return Math.abs(recIdDate.getTime() - candidate!.getTime()) < 1000;
        });

        if (excForCand) {
          const excInfo = parseSingleVEvent(excForCand, timeZoneAliasMap);
          if (excInfo.status === 'CANCELLED') {
            checkCursor = new Date(candidate.getTime() + duration + 1000);
            continue;
          }
          // Overridden occurrence
          effectiveStart = excInfo.startTime || candidate;
          effectiveEnd = excInfo.endTime || new Date(effectiveStart.getTime() + duration);
          if (excInfo.title) { baseInfo.title = excInfo.title; }
          if (excInfo.url) { baseInfo.url = excInfo.url; }
          break;
        }

        effectiveStart = candidate;
        effectiveEnd = new Date(candidate.getTime() + duration);
        break;
      }
    }

    if (effectiveStart) {
      results.push({
        ...baseInfo,
        startTime: effectiveStart,
        endTime: effectiveEnd || new Date(effectiveStart.getTime() + duration),
      });
    }

    // Process additional RDATE occurrences if present and in the future
    for (const rdate of rdates) {
      if (rdate >= now) {
        const alreadyAdded = results.some(r => r.startTime && Math.abs(r.startTime.getTime() - rdate.getTime()) < 1000);
        if (!alreadyAdded) {
          results.push({
            ...baseInfo,
            startTime: rdate,
            endTime: new Date(rdate.getTime() + duration),
          });
        }
      }
    }

    // Also include non-cancelled exceptions that are standalone modified occurrences
    for (const exc of relatedExceptions) {
      const excInfo = parseSingleVEvent(exc, timeZoneAliasMap);
      const recIdProp = exc.properties.find(p => p.name === 'RECURRENCE-ID');
      const recIdDate = recIdProp ? parseIcsDateTime(recIdProp, timeZoneAliasMap).date : undefined;

      // Check if this exception wasn't already matched in the series expansion or if it is independent
      if (excInfo.status !== 'CANCELLED' && excInfo.startTime && excInfo.startTime >= now) {
        const alreadyAdded = results.some(r => r.startTime && Math.abs(r.startTime.getTime() - excInfo.startTime!.getTime()) < 1000);
        if (!alreadyAdded) {
          results.push(excInfo);
        }
      }
    }
  }

  // Process standalone orphan exception VEVENTs (no matching base VEVENT in baseEvents)
  for (const exc of exceptionEvents) {
    if (matchedExceptionEvents.has(exc)) {
      continue;
    }
    const excInfo = parseSingleVEvent(exc, timeZoneAliasMap);
    const excStart = excInfo.startTime;
    if (excInfo.status !== 'CANCELLED' && excStart) {
      const alreadyAdded = results.some(r =>
        r.uid && excInfo.uid
          ? r.uid === excInfo.uid && r.startTime?.getTime() === excStart.getTime()
          : r.startTime && Math.abs(r.startTime.getTime() - excStart.getTime()) < 1000 && r.title === excInfo.title
      );
      if (!alreadyAdded) {
        results.push(excInfo);
      }
    }
  }

  return results;
}
