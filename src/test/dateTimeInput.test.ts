import * as assert from 'assert';
import { parseDateTimeInput } from '../dateTimeInput';

suite('Date Time Input Test Suite', () => {
  const now = new Date(2026, 3, 10, 12, 0, 0);

  test('accepts a valid full local date and time', () => {
    const result = parseDateTimeInput('2026-04-30 14:00', now);
    assert.strictEqual(result.error, null);
    assert.ok(result.date);
    assert.strictEqual(result.date.getDate(), 30);
    assert.strictEqual(result.date.getHours(), 14);
  });

  test('rejects out-of-range date and time components', () => {
    for (const input of ['2026-13-01 10:00', '2026-04-32 10:00', '2026-04-01 24:00', '2026-04-01 10:60']) {
      assert.ok(parseDateTimeInput(input, now).error, input);
    }
  });

  test('rejects a non-existent calendar date', () => {
    assert.strictEqual(parseDateTimeInput('2026-02-29 10:00', now).error, '実在する日時を入力してください。');
  });
});
