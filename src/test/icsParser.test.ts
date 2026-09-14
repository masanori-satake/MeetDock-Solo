import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { parseIcsContent, unfoldIcsContent, parseIcsLine, parseParameters, unescapeIcsText, unescapeParamValue } from '../icsParser';
import { MeetingManager } from '../meetingManager';
import { MeetingTreeDataProvider, MeetingTreeItem } from '../treeProvider';

function readFixture(filename: string): string {
  const primaryPath = path.join(__dirname, 'fixtures', filename);
  if (fs.existsSync(primaryPath)) {
    return fs.readFileSync(primaryPath, 'utf-8');
  }
  const rootPath = path.join(process.cwd(), 'src', 'test', 'fixtures', filename);
  return fs.readFileSync(rootPath, 'utf-8');
}

suite('ICS Parser & Integration Test Suite', () => {

  // 1. 日本語 / 英語
  test('1. Parses Japanese and English ICS fixtures correctly', () => {
    const jpContent = readFixture('single_jp.ics');
    const enContent = readFixture('single_en.ics');

    const now = new Date('2026-10-01T00:00:00Z');
    const jpResults = parseIcsContent(jpContent, now);
    const enResults = parseIcsContent(enContent, now);

    assert.strictEqual(jpResults.length, 1);
    assert.strictEqual(jpResults[0].title, '単発定例会議');
    assert.strictEqual(jpResults[0].organizer, '佐藤 太郎');
    assert.strictEqual(jpResults[0].url, 'https://teams.microsoft.com/meet/12345678901234?p=AbCd1234');

    assert.strictEqual(enResults.length, 1);
    assert.strictEqual(enResults[0].title, 'One-time Sync Meeting');
    assert.strictEqual(enResults[0].organizer, 'John Doe');
    assert.strictEqual(enResults[0].url, 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abcdef%40thread.v2/0?context=%7b%22Tid%22%3a%22111%22%7d');
  });

  // 2. 全 recurrence pattern
  test('2. Parses Daily, Weekdays, Weekly, Monthly, Yearly recurrence patterns', () => {
    const now = new Date('2026-10-01T00:00:00Z');

    const daily = parseIcsContent(readFixture('daily_jp.ics'), now)[0];
    assert.strictEqual(daily.recurrence, 'daily');
    assert.strictEqual(daily.recurrenceInterval, 2);

    const weekdays = parseIcsContent(readFixture('weekdays_jp.ics'), now)[0];
    assert.strictEqual(weekdays.recurrence, 'weekdays');

    const weekly = parseIcsContent(readFixture('weekly_jp.ics'), now)[0];
    assert.strictEqual(weekly.recurrence, 'weekly');
    assert.strictEqual(weekly.recurrenceInterval, 2);
    assert.deepStrictEqual(weekly.daysOfWeek, [1, 3]); // MO, WE

    const monthlyDate = parseIcsContent(readFixture('monthly_date_jp.ics'), now)[0];
    assert.strictEqual(monthlyDate.recurrence, 'monthly');
    assert.strictEqual(monthlyDate.dayOfMonth, 15);

    const monthlyNth = parseIcsContent(
      readFixture('monthly_nthday_jp.ics'),
      new Date('2026-10-06T00:00:00Z')
    )[0];
    assert.strictEqual(monthlyNth.recurrence, 'monthly');
    assert.strictEqual(monthlyNth.startTime?.toISOString(), '2026-11-02T01:00:00.000Z');

    const monthlyLast = parseIcsContent(
      readFixture('monthly_lastweekday_jp.ics'),
      new Date('2026-10-31T00:00:00Z')
    )[0];
    assert.strictEqual(monthlyLast.recurrence, 'monthly');
    assert.strictEqual(monthlyLast.startTime?.toISOString(), '2026-11-30T01:00:00.000Z');

    const yearlyDate = parseIcsContent(readFixture('yearly_date_jp.ics'), now)[0];
    assert.strictEqual(yearlyDate.recurrence, 'yearly');
    assert.strictEqual(yearlyDate.monthOfYear, 10);
    assert.strictEqual(yearlyDate.dayOfYear, 5);

    const yearlyNth = parseIcsContent(
      readFixture('yearly_nthday_jp.ics'),
      new Date('2026-10-06T00:00:00Z')
    )[0];
    assert.strictEqual(yearlyNth.recurrence, 'yearly');
    assert.strictEqual(yearlyNth.startTime?.toISOString(), '2027-10-04T01:00:00.000Z');
  });

  // 3. COUNT / UNTIL / no-end
  test('3. Handles COUNT, UNTIL, and no-end recurrence limits', () => {
    const icsCount = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:count@example.invalid
DTSTART:20261005T100000Z
RRULE:FREQ=DAILY;COUNT=3
SUMMARY:Count 3 Meeting
URL:https://teams.microsoft.com/meet/12345
END:VEVENT
END:VCALENDAR`;

    const icsUntil = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:until@example.invalid
DTSTART:20261005T100000Z
RRULE:FREQ=DAILY;UNTIL=20261010T235959Z
SUMMARY:Until Meeting
URL:https://teams.microsoft.com/meet/12345
END:VEVENT
END:VCALENDAR`;

    const now = new Date('2026-10-01T00:00:00Z');
    const resCount = parseIcsContent(icsCount, now)[0];
    assert.strictEqual(resCount.recurrence, 'daily');
    assert.strictEqual(resCount.recurrenceEndDate?.toISOString(), '2026-10-07T10:00:00.000Z');
    assert.deepStrictEqual(parseIcsContent(icsCount, new Date('2026-10-08T00:00:00Z')), []);

    const ordinalCountIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:ordinal-count@example.invalid
DTSTART:20261005T100000Z
RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1;COUNT=3
SUMMARY:First Monday Count 3
URL:https://teams.microsoft.com/meet/12345
END:VEVENT
END:VCALENDAR`;
    const ordinalCount = parseIcsContent(ordinalCountIcs, now)[0];
    assert.strictEqual(ordinalCount.recurrenceEndDate?.toISOString(), '2026-12-07T10:00:00.000Z');
    assert.deepStrictEqual(parseIcsContent(ordinalCountIcs, new Date('2026-12-08T00:00:00Z')), []);

    const resUntil = parseIcsContent(icsUntil, now)[0];
    assert.strictEqual(resUntil.recurrence, 'daily');
    assert.ok(resUntil.recurrenceEndDate instanceof Date);
    assert.strictEqual(resUntil.recurrenceEndDate.toISOString(), '2026-10-10T23:59:59.000Z');
  });

  // 4, 5, 6. EXDATE / RDATE / RECURRENCE-ID / CANCELLED
  test('4-6. Handles EXDATE, RECURRENCE-ID, and CANCELLED occurrences', () => {
    const ics = readFixture('exceptions_jp.ics');
    // Base series starts Mon Oct 05 2026.
    // Oct 12 is EXDATE (skipped).
    // Oct 19 has RECURRENCE-ID moved to Oct 20.
    // Oct 26 has RECURRENCE-ID with STATUS:CANCELLED.

    // Test when now is Oct 10 2026 -> next occurrence should skip Oct 12 and return Oct 20 (modified Oct 19)
    const nowOct10 = new Date('2026-10-10T00:00:00+09:00');
    const res1 = parseIcsContent(ics, nowOct10);
    assert.ok(res1.length >= 1);
    const firstOcc = res1[0];
    assert.strictEqual(firstOcc.title, '時間変更分会議');
    assert.strictEqual(firstOcc.startTime?.toISOString(), new Date('2026-10-20T11:00:00+09:00').toISOString());

    // Test when now is Oct 22 2026 -> next occurrence should skip cancelled Oct 26 and return Nov 02
    const nowOct22 = new Date('2026-10-22T00:00:00+09:00');
    const res2 = parseIcsContent(ics, nowOct22);
    assert.ok(res2.length >= 1);
    assert.strictEqual(res2[0].startTime?.toISOString(), new Date('2026-11-02T10:00:00+09:00').toISOString());
  });

  // 7, 8. CRLF / LF & line folding / unfolding
  test('7-8. Handles CRLF, LF, and 75 octet line folding / unfolding', () => {
    const foldedIcs = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:folded@example.invalid\r\nSUMMARY:Very Long Title Split \r\n Over Multiple Lines\r\nDTSTART:20261005T100000Z\r\nURL:https://teams.microsoft.com/l/meetup-join/123\r\nEND:VEVENT\r\nEND:VCALENDAR";

    const unfolded = unfoldIcsContent(foldedIcs);
    assert.ok(unfolded.includes('SUMMARY:Very Long Title Split Over Multiple Lines'));

    const res = parseIcsContent(foldedIcs, new Date('2026-10-01T00:00:00Z'));
    assert.strictEqual(res[0].title, 'Very Long Title Split Over Multiple Lines');
  });

  // 9, 10. 日本語 UTF-8 & BOM
  test('9-10. Handles UTF-8 and BOM correctly', () => {
    const bomIcs = "\uFEFFBEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:bom@example.invalid\nSUMMARY;LANGUAGE=ja-JP:BOM付き定例会議\nDTSTART:20261005T100000Z\nURL:https://teams.microsoft.com/meet/123456\nEND:VEVENT\nEND:VCALENDAR";

    const res = parseIcsContent(bomIcs, new Date('2026-10-01T00:00:00Z'));
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].title, 'BOM付き定例会議');
  });

  // 26. Standalone RECURRENCE-ID VEVENT (user provided ICS pattern)
  test('26. Parses standalone exception VEVENT with RECURRENCE-ID and no base VEVENT', () => {
    const standaloneRecurrenceIdIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Microsoft//Outlook Web//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:040000008200E00074C5B7101A82E00807EA090E74B63E1713C3DC01000000000000000
 0100000003ED3C74B4C73E0478AFF38F43CD687C0
DTSTAMP:20260914T005824Z
DTSTART:20260914T043000Z
DTEND:20260914T051500Z
RECURRENCE-ID:20260914T043000Z
SUMMARY:サンプル週報会（第1部）
LOCATION:Microsoft Teams 会議
DESCRIPTION:2026年4月以降の週報会の案内を送ります。\\n\\n
 参加する:\\nhttps://teams.microsoft.com/meet/226316127041374?p=0FSrfCT5yJkIJ5fHnN\\n\\n会議 ID:\\n226 316 127 041 374\\n\\nパスコード:\\nB56Q6pu6
ORGANIZER;CN=Taro Yamada:mailto:taro.yamada@example.com
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    const now = new Date('2026-09-01T00:00:00Z');
    const res = parseIcsContent(standaloneRecurrenceIdIcs, now);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].title, 'サンプル週報会（第1部）');
    assert.strictEqual(res[0].url, 'https://teams.microsoft.com/meet/226316127041374?p=0FSrfCT5yJkIJ5fHnN');
    assert.strictEqual(res[0].organizer, 'Taro Yamada');
    assert.strictEqual(res[0].meetingId, '226316127041374');
    assert.strictEqual(res[0].passcode, 'B56Q6pu6');
  });

  test('uses a later valid meeting ID when an earlier candidate is too long', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:meeting-id@example.invalid
SUMMARY:Meeting ID fallback
DTSTART:20261005T100000Z
DESCRIPTION:Meeting ID: 123456789012345678\\nMeeting ID: 987 654 321
END:VEVENT
END:VCALENDAR`;

    const res = parseIcsContent(ics, new Date('2026-10-01T00:00:00Z'));

    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].meetingId, '987654321');
  });

  test('keeps orphan exceptions with a different UID at the same title and start time', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:base@example.invalid
SUMMARY:Shared title
DTSTART:20261005T100000Z
END:VEVENT
BEGIN:VEVENT
UID:orphan@example.invalid
SUMMARY:Shared title
DTSTART:20261005T100000Z
RECURRENCE-ID:20261005T100000Z
END:VEVENT
END:VCALENDAR`;

    const res = parseIcsContent(ics, new Date('2026-10-01T00:00:00Z'));

    assert.strictEqual(res.length, 2);
    assert.deepStrictEqual(res.map(meeting => meeting.uid), ['base@example.invalid', 'orphan@example.invalid']);
  });

  // 11, 12. Quoted parameters & TEXT escaping
  test('11-12. Handles quoted parameters and RFC 5545 / RFC 6868 escaping', () => {
    const lineWithQuote = 'ORGANIZER;CN="Doe, John ^\'The Boss^\'":mailto:boss@example.com';
    const parsedLine = parseIcsLine(lineWithQuote);
    assert.ok(parsedLine);
    assert.strictEqual(parsedLine.params['CN'], 'Doe, John "The Boss"');

    const escapedText = 'Line 1\\nLine 2\\; with semi\\, and comma\\\\ backslash';
    assert.strictEqual(unescapeIcsText(escapedText), 'Line 1\nLine 2; with semi, and comma\\ backslash');
  });

  // 13, 14, 15. TimeZone / DST / UTC / Tokyo Standard Time
  test('13-15. Handles UTC, TZID, Tokyo Standard Time, and DST VTIMEZONE', () => {
    const dstIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:Eastern Standard Time
BEGIN:STANDARD
DTSTART:20071104T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:20070311T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:dst@example.invalid
DTSTART;TZID="Eastern Standard Time":20260601T100000
DTEND;TZID="Eastern Standard Time":20260601T110000
SUMMARY:US EDT Meeting
URL:https://teams.microsoft.com/meet/99999
END:VEVENT
END:VCALENDAR`;

    const res = parseIcsContent(dstIcs, new Date('2026-05-01T00:00:00Z'));
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].timeZone, 'America/New_York');
    assert.strictEqual(res[0].startTime?.toISOString(), '2026-06-01T14:00:00.000Z');
  });

  // 16, 17, 18, 19. Teams URL recognition & fallback order & invalid URLs
  test('16-19. Recognizes meetup-join, meet, DESCRIPTION fallback, and rejects invalid URLs', () => {
    // 16 & 17: meetup-join & meet
    const meetupJoinIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:meetup@example.invalid
DTSTART:20261005T100000Z
SUMMARY:Meetup Join
X-MICROSOFT-SKYPETEAMSMEETINGURL:https://teams.microsoft.com/l/meetup-join/19%3ameeting_xyz%40thread.v2/0?context=%7b%22Tid%22%3a%22abc%22%7d
END:VEVENT
END:VCALENDAR`;
    const resJoin = parseIcsContent(meetupJoinIcs, new Date('2026-10-01T00:00:00Z'));
    assert.strictEqual(resJoin[0].url, 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_xyz%40thread.v2/0?context=%7b%22Tid%22%3a%22abc%22%7d');

    // 18: DESCRIPTION fallback
    const descFallbackIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:desc@example.invalid
DTSTART:20261005T100000Z
SUMMARY:Desc Fallback
DESCRIPTION:Please join at https://teams.microsoft.com/meet/1234567890?p=xyz
END:VEVENT
END:VCALENDAR`;
    const resDesc = parseIcsContent(descFallbackIcs, new Date('2026-10-01T00:00:00Z'));
    assert.strictEqual(resDesc[0].url, 'https://teams.microsoft.com/meet/1234567890?p=xyz');

    // 19: Invalid / unsafe URLs rejected
    const invalidUrlIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:invalid@example.invalid
DTSTART:20261005T100000Z
SUMMARY:Unsafe Link
URL:javascript:alert(1)
DESCRIPTION:Click http://malicious.example.com
END:VEVENT
END:VCALENDAR`;
    const resInvalid = parseIcsContent(invalidUrlIcs, new Date('2026-10-01T00:00:00Z'));
    assert.strictEqual(resInvalid[0].url, '');
  });

  // 20, 21. Malformed ICS & multiple VEVENTs
  test('20-21. Handles malformed ICS gracefully and parses multiple VEVENTs', () => {
    // 20: Malformed ICS
    const malformed = "NOT_A_VALID_ICS_CONTENT";
    const resMalformed = parseIcsContent(malformed);
    assert.deepStrictEqual(resMalformed, []);

    // 21: Multiple VEVENTs
    const multiIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event1@example.invalid
DTSTART:20261005T100000Z
SUMMARY:Event 1
URL:https://teams.microsoft.com/meet/111
END:VEVENT
BEGIN:VEVENT
UID:event2@example.invalid
DTSTART:20261006T100000Z
SUMMARY:Event 2
URL:https://teams.microsoft.com/meet/222
END:VEVENT
END:VCALENDAR`;
    const resMulti = parseIcsContent(multiIcs, new Date('2026-10-01T00:00:00Z'));
    assert.strictEqual(resMulti.length, 2);
    assert.strictEqual(resMulti[0].title, 'Event 1');
    assert.strictEqual(resMulti[1].title, 'Event 2');
  });

  // 22. Drag-and-drop integration with TreeProvider (Raw text & File URI & DataTransferFile)
  test('22. Handles drag-and-drop of ICS raw text, File URI, and DataTransferFile in TreeProvider', async () => {
    const store: Record<string, any> = {};
    const mockContext: any = {
      globalState: {
        get: (key: string, defaultVal: any) => store[key] ?? defaultVal,
        update: async (key: string, val: any) => { store[key] = val; }
      }
    };
    const manager = new MeetingManager(mockContext);
    const provider = new MeetingTreeDataProvider(manager, () => new Date('2026-10-01T00:00:00Z'));

    // 22a. Raw ICS text drop
    const icsText = readFixture('single_jp.ics');
    const dataTransfer1 = {
      get: (mime: string) => mime === 'text/calendar' ? { asString: async () => icsText } : null
    } as any;
    await provider.handleDrop(undefined, dataTransfer1, {} as any);

    let meetings = manager.getMeetings();
    assert.strictEqual(meetings.length, 1);
    assert.strictEqual(meetings[0].title, '単発定例会議');

    // 22b. File URI drop
    const fixturePath = path.join(process.cwd(), 'src', 'test', 'fixtures', 'single_en.ics');
    const fileUri = pathToFileURL(fixturePath).href;
    const dataTransfer2 = {
      get: (mime: string) => mime === 'text/uri-list' ? { asString: async () => fileUri } : null
    } as any;
    await provider.handleDrop(undefined, dataTransfer2, {} as any);

    meetings = manager.getMeetings();
    assert.strictEqual(meetings.length, 2);
    assert.strictEqual(meetings[1].title, 'One-time Sync Meeting');

    const existingId = meetings[1].id;
    await provider.handleDrop(undefined, dataTransfer2, {} as any);
    meetings = manager.getMeetings();
    assert.strictEqual(meetings.length, 2);
    assert.strictEqual(meetings[1].id, existingId);

    const nextOccurrenceIcs = readFixture('single_en.ics')
      .replace('20261005T100000', '20261006T100000')
      .replace('20261005T103000', '20261006T103000');
    const dataTransfer3 = {
      get: (mime: string) => mime === 'text/calendar' ? { asString: async () => nextOccurrenceIcs } : null
    } as any;
    await provider.handleDrop(undefined, dataTransfer3, {} as any);
    meetings = manager.getMeetings();
    assert.strictEqual(meetings.length, 3);
    assert.strictEqual(meetings[2].uid, meetings[1].uid);
    assert.notStrictEqual(meetings[2].startTime, meetings[1].startTime);

    // 22c. DataTransferFile (OS file explorer drop via 'files' MIME type)
    const fixturePathJp = path.join(process.cwd(), 'src', 'test', 'fixtures', 'single_jp.ics');
    const fileItem = {
      asFile: () => ({
        name: 'single_jp.ics',
        uri: { scheme: 'file', fsPath: fixturePathJp },
        data: async () => Buffer.from(readFixture('single_jp.ics'))
      })
    };
    const dataTransfer4 = {
      get: (mime: string) => mime === 'files' ? fileItem : null,
      [Symbol.iterator]: function* () {
        yield ['files', fileItem];
      }
    } as any;
    let store2: Record<string, any> = {};
    const mockContext2: any = {
      globalState: {
        get: (key: string, defaultVal: any) => store2[key] ?? defaultVal,
        update: async (key: string, val: any) => { store2[key] = val; }
      }
    };
    const manager2 = new MeetingManager(mockContext2);
    const provider2 = new MeetingTreeDataProvider(manager2, () => new Date('2026-10-01T00:00:00Z'));
    await provider2.handleDrop(undefined, dataTransfer4, {} as any);
    const meetings2 = manager2.getMeetings();
    assert.strictEqual(meetings2.length, 1);
    assert.strictEqual(meetings2[0].title, '単発定例会議');

    // 22d. application/ics-only fallback test (when 'files' is unavailable or unusable)
    const appIcsItem = {
      asString: async () => readFixture('single_jp.ics')
    };
    const dataTransfer5 = {
      get: (mime: string) => mime === 'application/ics' ? appIcsItem : null
    } as any;
    let store3: Record<string, any> = {};
    const mockContext3: any = {
      globalState: {
        get: (key: string, defaultVal: any) => store3[key] ?? defaultVal,
        update: async (key: string, val: any) => { store3[key] = val; }
      }
    };
    const manager3 = new MeetingManager(mockContext3);
    const provider3 = new MeetingTreeDataProvider(manager3, () => new Date('2026-10-01T00:00:00Z'));
    await provider3.handleDrop(undefined, dataTransfer5, {} as any);
    const meetings3 = manager3.getMeetings();
    assert.strictEqual(meetings3.length, 1);
    assert.strictEqual(meetings3[0].title, '単発定例会議');
  });

  test('25. Handles RDATE recurrence correctly', () => {
    const rdateIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:rdate@example.invalid
DTSTART:20261005T100000Z
RDATE:20261012T100000Z,20261019T100000Z
SUMMARY:RDATE Meeting
URL:https://teams.microsoft.com/meet/99999
END:VEVENT
END:VCALENDAR`;

    const now = new Date('2026-10-01T00:00:00Z');
    const res = parseIcsContent(rdateIcs, now);
    assert.strictEqual(res.length, 3);
  });

  // 23. 既存個人Teams機能のregressionテスト
  test('23. Prevents regression for personal Teams drop / parse', async () => {
    const mockContext: any = { globalState: { get: () => [], update: async () => {} } };
    const manager = new MeetingManager(mockContext);
    const provider = new MeetingTreeDataProvider(manager, () => new Date('2026-10-01T00:00:00Z'));

    const plainText = "週次定例\nhttps://teams.live.com/l/meetup-join/12345678";
    const dataTransfer = {
      get: (mime: string) => mime === 'text/plain' ? { asString: async () => plainText } : null
    } as any;

    // Note: handleDrop with non-ICS falls back to parseMeetingText and prompt inputs.
    // Ensure parseMeetingText directly still works:
    const { parseMeetingText } = require('../parser');
    const parsed = parseMeetingText(plainText);
    assert.strictEqual(parsed.url, 'https://teams.live.com/l/meetup-join/12345678');
  });

  // 24. 無限recurrenceを無制限展開しないこと
  test('24. Does not expand infinite recurrence indefinitely', () => {
    const infiniteIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:infinite@example.invalid
DTSTART:20200101T090000Z
RRULE:FREQ=DAILY
SUMMARY:Infinite Daily Meeting
URL:https://teams.microsoft.com/meet/99999
END:VEVENT
END:VCALENDAR`;

    const now = new Date('2026-10-01T00:00:00Z');
    const startMs = Date.now();
    const res = parseIcsContent(infiniteIcs, now);
    const elapsedMs = Date.now() - startMs;

    assert.ok(elapsedMs < 500, 'Parsing infinite recurrence should complete almost instantly');
    assert.strictEqual(res.length, 1);
    assert.ok(res[0].startTime! >= now);
  });
});
