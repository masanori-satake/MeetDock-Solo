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

  test('correctly parses Japanese Teams invitation header text', () => {
    const sample = `
Satake Masanori Microsoft Teams 会議に招待されました。

テスト
令和8年9月7日月曜日
11:30 - 12:30 (JST)

会議のリンク: https://teams.live.com/meet/9398636609731?p=5tlDf18IUn3zDYR0UR
    `;
    const parsed = parseMeetingText(sample);
    assert.strictEqual(parsed.title, 'テスト');
    assert.strictEqual(parsed.url, 'https://teams.live.com/meet/9398636609731?p=5tlDf18IUn3zDYR0UR');
    assert.ok(parsed.startTime);
    assert.strictEqual(parsed.startTime.getFullYear(), 2026);
    assert.strictEqual(parsed.startTime.getMonth(), 8); // 0-indexed September
    assert.strictEqual(parsed.startTime.getDate(), 7);
    assert.strictEqual(parsed.startTime.getHours(), 11);
    assert.strictEqual(parsed.startTime.getMinutes(), 30);
  });

  test('correctly parses English Teams invitation header text', () => {
    const sample = `
John Doe has invited you to a Teams meeting

Sprint Planning
2026-10-15
10:00 - 11:00

Meeting link: https://teams.microsoft.com/l/meetup-join/12345
    `;
    const parsed = parseMeetingText(sample);
    assert.strictEqual(parsed.title, 'Sprint Planning');
    assert.strictEqual(parsed.url, 'https://teams.microsoft.com/l/meetup-join/12345');
    assert.ok(parsed.startTime);
    assert.strictEqual(parsed.startTime.getFullYear(), 2026);
    assert.strictEqual(parsed.startTime.getMonth(), 9); // 0-indexed October
    assert.strictEqual(parsed.startTime.getDate(), 15);
    assert.strictEqual(parsed.startTime.getHours(), 10);
    assert.strictEqual(parsed.startTime.getMinutes(), 0);
  });
});
