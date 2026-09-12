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

  test('excludes following HTML from the subject title', () => {
    const parsed = parseMeetingText('<div>Subject: Planning Meeting</div><div>Join us</div>');
    assert.strictEqual(parsed.title, 'Planning Meeting');
  });

  test('limits an explicit subject title to 100 characters', () => {
    const parsed = parseMeetingText(`Subject: ${'a'.repeat(101)}`);
    assert.strictEqual(parsed.title, 'a'.repeat(100));
  });

  test('preserves Z timezone when parsing a full date', () => {
    const parsed = parseMeetingText('Start: 2026-04-10T14:00:00Z');
    assert.ok(parsed.startTime);
    assert.strictEqual(parsed.startTime.toISOString(), '2026-04-10T14:00:00.000Z');
  });

  test('preserves a numeric timezone offset when parsing a full date', () => {
    const parsed = parseMeetingText('Start: 2026-04-10T14:00:00+09:00');
    assert.ok(parsed.startTime);
    assert.strictEqual(parsed.startTime.toISOString(), '2026-04-10T05:00:00.000Z');
  });
});
