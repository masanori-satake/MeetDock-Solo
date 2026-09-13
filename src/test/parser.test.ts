import * as assert from 'assert';
import { parseMeetingText } from '../parser';

suite('Parser Test Suite', () => {
  test('extracts url, title and start time from simple text', () => {
    const sample = `
      件名: スプリントレトロスペクティブ
      日時: 2026-04-10 14:00
      Teams URL: https://teams.microsoft.com/l/meetup-join/19%3ameeting_12345
    `;
    const parsed = parseMeetingText(sample);
    assert.strictEqual(parsed.title, 'スプリントレトロスペクティブ');
    assert.strictEqual(parsed.url, 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_12345');
    assert.ok(parsed.startTime);
    assert.strictEqual(parsed.startTime.getFullYear(), 2026);
    assert.strictEqual(parsed.startTime.getMonth(), 3); // 0-indexed April
    assert.strictEqual(parsed.startTime.getDate(), 10);
    assert.strictEqual(parsed.startTime.getHours(), 14);
    assert.strictEqual(parsed.startTime.getMinutes(), 0);
  });

  test('extracts url and defaults title when no explicit title pattern', () => {
    const sample = `
      https://teams.microsoft.com/l/meetup-join/19%3ameeting_abcde
      15:30
    `;
    const parsed = parseMeetingText(sample);
    assert.strictEqual(parsed.url, 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abcde');
    assert.ok(parsed.startTime);
    assert.strictEqual(parsed.startTime.getHours(), 15);
    assert.strictEqual(parsed.startTime.getMinutes(), 30);
  });

  test('1. 個人向け Teams (JP) - 単発会議', () => {
    const sample = `
Satake Masanori Microsoft Teams 会議に招待されました。
テスト2
2026年9月14日月曜日
8:30 - 9:30 (JST)
会議のリンク: テスト2 | Microsoft Teams | ミートアップに参加
    `;
    const parsed = parseMeetingText(sample);
    assert.strictEqual(parsed.organizer, 'Satake Masanori');
    assert.strictEqual(parsed.title, 'テスト2');
    assert.strictEqual(parsed.recurrence, 'once');
    assert.strictEqual(parsed.isEnterprise, false);
    assert.ok(parsed.startTime);
    assert.ok(parsed.endTime);
    // 8:30 JST (+09:00) = 2026-09-13 23:30 UTC
    assert.strictEqual(parsed.startTime.toISOString(), '2026-09-13T23:30:00.000Z');
    assert.strictEqual(parsed.endTime.toISOString(), '2026-09-14T00:30:00.000Z');
  });

  test('2. 個人向け Teams (JP) - 繰り返し会議', () => {
    const sample = `
Satake Masanori Microsoft Teams 会議シリーズに招待されました。
週次進捗確認
2026年9月14日月曜日
8:30 - 9:30 (JST)
会議のリンク: 週次進捗確認 | Microsoft Teams | ミートアップに参加
    `;
    const parsed = parseMeetingText(sample);
    assert.strictEqual(parsed.organizer, 'Satake Masanori');
    assert.strictEqual(parsed.title, '週次進捗確認');
    assert.strictEqual(parsed.recurrence, 'weekly');
  });

  test('3. 個人向け Teams (EN) - 単発会議', () => {
    const sample = `
Satake Masanori has invited you to a Teams meeting
Project Sync
Monday, September 14, 2026
8:30 AM - 9:30 AM (JST)
Meeting link: Project Sync | Microsoft Teams | Meetup-Join
    `;
    const parsed = parseMeetingText(sample);
    assert.strictEqual(parsed.organizer, 'Satake Masanori');
    assert.strictEqual(parsed.title, 'Project Sync');
    assert.strictEqual(parsed.recurrence, 'once');
    assert.ok(parsed.startTime);
    assert.ok(parsed.endTime);
    assert.strictEqual(parsed.startTime.toISOString(), '2026-09-13T23:30:00.000Z');
    assert.strictEqual(parsed.endTime.toISOString(), '2026-09-14T00:30:00.000Z');
  });

  test('4. 個人向け Teams (EN) - 繰り返し会議', () => {
    const sample = `
Satake Masanori has invited you to a Teams meeting series
Weekly Standup
Monday, September 14, 2026
8:30 AM - 9:30 AM (JST)
Occurs every Monday
Meeting link: Weekly Standup | Microsoft Teams | Meetup-Join
    `;
    const parsed = parseMeetingText(sample);
    assert.strictEqual(parsed.organizer, 'Satake Masanori');
    assert.strictEqual(parsed.title, 'Weekly Standup');
    assert.strictEqual(parsed.recurrence, 'weekly');
  });

  test('5. 企業向け Teams (JP) - 会議ID・パスコード付き', () => {
    const sample = `
田中 太郎 Microsoft Teams 会議に招待されました。
第2四半期事業計画レビュー
2026年10月5日月曜日
14:00 - 15:30 (JST)
会議のリンク: 第2四半期事業計画レビュー | Microsoft Teams | ミートアップに参加
会議 ID: 938 444 446 212 6
パスコード: qc3zR3
ブラウザー、モバイル アプリ、または室内のデバイスで参加してください
ここをクリックして会議に参加してください
    `;
    const parsed = parseMeetingText(sample);
    assert.strictEqual(parsed.organizer, '田中 太郎');
    assert.strictEqual(parsed.title, '第2四半期事業計画レビュー');
    assert.strictEqual(parsed.meetingId, '9384444462126');
    assert.strictEqual(parsed.passcode, 'qc3zR3');
    assert.strictEqual(parsed.isEnterprise, true);
    assert.ok(parsed.startTime);
    assert.ok(parsed.endTime);
    // 14:00 JST (+09:00) = 2026-10-05 05:00 UTC
    assert.strictEqual(parsed.startTime.toISOString(), '2026-10-05T05:00:00.000Z');
    assert.strictEqual(parsed.endTime.toISOString(), '2026-10-05T06:30:00.000Z');
  });

  test('6. 企業向け Teams (EN) - フルヘッダー形式', () => {
    const sample = `
John Rainaldi invited you to a Microsoft Teams Meeting: CCMC Committee Meeting
Thursday, January 8, 2026
10:00 AM - 12:00 PM (EST)
Meeting link: CCMC Committee Meeting | Microsoft Teams | Meetup-Join
Meeting ID: 934 820 198 110 4
Passcode: 9888Um
Click here to join the meeting
    `;
    const parsed = parseMeetingText(sample);
    assert.strictEqual(parsed.organizer, 'John Rainaldi');
    assert.strictEqual(parsed.title, 'CCMC Committee Meeting');
    assert.strictEqual(parsed.meetingId, '9348201981104');
    assert.strictEqual(parsed.passcode, '9888Um');
    assert.strictEqual(parsed.isEnterprise, true);
    assert.ok(parsed.startTime);
    assert.ok(parsed.endTime);
    // 10:00 AM EST (-05:00) = 2026-01-08 15:00 UTC
    assert.strictEqual(parsed.startTime.toISOString(), '2026-01-08T15:00:00.000Z');
    assert.strictEqual(parsed.endTime.toISOString(), '2026-01-08T17:00:00.000Z');
  });

  test('7. 異常系 / 揺らぎ系: Safe Links URL, 改行タイトル, 文言一部欠損', () => {
    // 7a: Safe Links URL un-wrapping
    const safeLinksSample = `
      Meeting link: https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fteams.microsoft.com%2Fl%2Fmeetup-join%2F19%253ameeting_xyz%2F0%3Fcontext%3D123&data=abc
      2026-11-20 16:00 - 17:00
    `;
    const parsedSafeLinks = parseMeetingText(safeLinksSample);
    assert.strictEqual(parsedSafeLinks.url, 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_xyz/0?context=123');
    assert.ok(parsedSafeLinks.startTime);
    assert.strictEqual(parsedSafeLinks.startTime.getHours(), 16);

    // 7b: Multiline meeting title
    const multilineSample = `
Satake Masanori Microsoft Teams 会議に招待されました。
新プロジェクト
キックオフミーティング
2026年9月14日月曜日
8:30 - 9:30 (JST)
    `;
    const parsedMultiline = parseMeetingText(multilineSample);
    assert.strictEqual(parsedMultiline.title, '新プロジェクト キックオフミーティング');
    assert.strictEqual(parsedMultiline.organizer, 'Satake Masanori');

    // 7c: Missing header text but has URL and date/time
    const partialSample = `
2026年12月25日
10:00 - 11:30 (JST)
Meeting link: https://teams.microsoft.com/l/meetup-join/12345
    `;
    const parsedPartial = parseMeetingText(partialSample);
    assert.strictEqual(parsedPartial.url, 'https://teams.microsoft.com/l/meetup-join/12345');
    assert.ok(parsedPartial.startTime);
    assert.strictEqual(parsedPartial.startTime.getMonth(), 11); // Dec
    assert.strictEqual(parsedPartial.startTime.getDate(), 25);
  });

  test('advances candidate date to tomorrow if time-only is in the past', () => {
    const originalDate = global.Date;
    const frozenNow = new originalDate(2026, 8, 7, 12, 0, 0);

    global.Date = new Proxy(originalDate, {
      construct(target, args) {
        return args.length === 0
          ? new target(frozenNow.getTime())
          : Reflect.construct(target, args);
      },
      get(target, property, receiver) {
        if (property === 'now') {
          return () => frozenNow.getTime();
        }
        return Reflect.get(target, property, receiver);
      }
    });

    try {
      const pastHour = 11;
      const pastMinute = 0;
      const sample = `
        https://teams.microsoft.com/l/meetup-join/19%3ameeting_past
        ${pastHour}:${String(pastMinute).padStart(2, '0')}
      `;
      const parsed = parseMeetingText(sample);

      assert.ok(parsed.startTime);
      assert.strictEqual(parsed.startTime.getFullYear(), 2026);
      assert.strictEqual(parsed.startTime.getMonth(), 8);
      assert.strictEqual(parsed.startTime.getDate(), 8);
      assert.strictEqual(parsed.startTime.getHours(), pastHour);
      assert.strictEqual(parsed.startTime.getMinutes(), pastMinute);
    } finally {
      global.Date = originalDate;
    }
  });

  test('keeps a date-less time range on the current day while it is in progress', () => {
    const originalDate = global.Date;
    const frozenNow = new originalDate(2026, 8, 7, 12, 0, 0);

    global.Date = new Proxy(originalDate, {
      construct(target, args) {
        return args.length === 0
          ? new target(frozenNow.getTime())
          : Reflect.construct(target, args);
      }
    });

    try {
      const parsed = parseMeetingText('11:00 - 13:00');

      assert.ok(parsed.startTime);
      assert.ok(parsed.endTime);
      assert.strictEqual(parsed.startTime.getDate(), 7);
      assert.strictEqual(parsed.startTime.getHours(), 11);
      assert.strictEqual(parsed.endTime.getDate(), 7);
      assert.strictEqual(parsed.endTime.getHours(), 13);
    } finally {
      global.Date = originalDate;
    }
  });

  test('advances both ends of an expired date-less time range to tomorrow', () => {
    const originalDate = global.Date;
    const frozenNow = new originalDate(2026, 8, 7, 12, 0, 0);

    global.Date = new Proxy(originalDate, {
      construct(target, args) {
        return args.length === 0
          ? new target(frozenNow.getTime())
          : Reflect.construct(target, args);
      }
    });

    try {
      const parsed = parseMeetingText('10:00 - 11:00');

      assert.ok(parsed.startTime);
      assert.ok(parsed.endTime);
      assert.strictEqual(parsed.startTime.getDate(), 8);
      assert.strictEqual(parsed.startTime.getHours(), 10);
      assert.strictEqual(parsed.endTime.getDate(), 8);
      assert.strictEqual(parsed.endTime.getHours(), 11);
    } finally {
      global.Date = originalDate;
    }
  });

  test('keeps 09:00–12:00 dropped at 10:00 on the current day (in progress)', () => {
    const originalDate = global.Date;
    const frozenNow = new originalDate(2026, 8, 7, 10, 0, 0);

    global.Date = new Proxy(originalDate, {
      construct(target, args) {
        return args.length === 0
          ? new target(frozenNow.getTime())
          : Reflect.construct(target, args);
      }
    });

    try {
      const parsed = parseMeetingText('09:00 - 12:00');

      assert.ok(parsed.startTime);
      assert.ok(parsed.endTime);
      assert.strictEqual(parsed.startTime.getTime(), new originalDate(2026, 8, 7, 9, 0, 0).getTime());
      assert.strictEqual(parsed.endTime.getTime(), new originalDate(2026, 8, 7, 12, 0, 0).getTime());
    } finally {
      global.Date = originalDate;
    }
  });
});
