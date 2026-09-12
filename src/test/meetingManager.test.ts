import * as assert from 'assert';
import * as vscode from 'vscode';
import { MeetingManager } from '../meetingManager';
import { Meeting } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal in-memory ExtensionContext mock backed by a Meeting array.
 */
function createMockContext(initialMeetings: Meeting[] = []): vscode.ExtensionContext {
  let stored: Meeting[] = [...initialMeetings];
  return {
    globalState: {
      get: <T>(_key: string, defaultValue: T): T =>
        (stored as unknown as T) ?? defaultValue,
      update: async (_key: string, value: unknown): Promise<void> => {
        stored = [...(value as Meeting[])];
      },
      keys: (): readonly string[] => [],
      setKeysForSync: (_keys: readonly string[]): void => {},
    },
    subscriptions: [],
  } as unknown as vscode.ExtensionContext;
}

/**
 * Creates a Meeting whose startTime is offset from the current time.
 * @param offsetMinutes positive = future, negative = past
 */
function makeMeeting(
  id: string,
  offsetMinutes: number,
  recurrence: Meeting['recurrence'] = 'once'
): Meeting {
  return {
    id,
    title: `Meeting ${id}`,
    url: `https://teams.microsoft.com/meet/${id}`,
    startTime: new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString(),
    recurrence,
    notified5m: false,
    notifiedStart: false,
  };
}

// ---------------------------------------------------------------------------
// Test suite: getRelevantMeetings
// ---------------------------------------------------------------------------

suite('MeetingManager - getRelevantMeetings', () => {

  test('returns empty array when no meetings are registered', () => {
    const manager = new MeetingManager(createMockContext([]));
    const result = manager.getRelevantMeetings(5 * 60 * 1000);
    assert.deepStrictEqual(result, []);
  });

  test('returns an ongoing meeting (started 10 min ago, ends in 20 min)', () => {
    const meeting = makeMeeting('a', -10);
    const manager = new MeetingManager(createMockContext([meeting]));

    const result = manager.getRelevantMeetings(5 * 60 * 1000);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'a');
  });

  test('returns a meeting starting within the window (3 min away)', () => {
    const meeting = makeMeeting('b', 3);
    const manager = new MeetingManager(createMockContext([meeting]));

    const result = manager.getRelevantMeetings(5 * 60 * 1000);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'b');
  });

  test('excludes a meeting starting beyond the window (10 min away)', () => {
    const meeting = makeMeeting('c', 10);
    const manager = new MeetingManager(createMockContext([meeting]));

    const result = manager.getRelevantMeetings(5 * 60 * 1000);

    assert.strictEqual(result.length, 0);
  });

  test('excludes a meeting that has already ended (started 35 min ago)', () => {
    // 35 min ago + 30 min duration → ended 5 min ago
    const meeting = makeMeeting('d', -35);
    const manager = new MeetingManager(createMockContext([meeting]));

    const result = manager.getRelevantMeetings(5 * 60 * 1000);

    assert.strictEqual(result.length, 0);
  });

  test('returns multiple relevant meetings sorted by start time', () => {
    const meetingA = makeMeeting('a', -5);  // ongoing, started earlier
    const meetingB = makeMeeting('b', 3);   // starting in 3 min (within window)
    const meetingC = makeMeeting('c', 10);  // starting in 10 min (outside window)
    // Provide in reverse order to verify sorting
    const manager = new MeetingManager(createMockContext([meetingC, meetingB, meetingA]));

    const result = manager.getRelevantMeetings(5 * 60 * 1000);

    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].id, 'a', 'Earlier meeting should be first');
    assert.strictEqual(result[1].id, 'b', 'Later meeting should be second');
  });

  test('returns only the ongoing meeting when upcoming is outside window', () => {
    const ongoing = makeMeeting('f', -15);  // ongoing: started 15 min ago
    const future  = makeMeeting('g', 10);   // 10 min away
    const manager = new MeetingManager(createMockContext([ongoing, future]));

    const result = manager.getRelevantMeetings(5 * 60 * 1000);

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'f');
  });

  test('returns two overlapping concurrent meetings', () => {
    const meetingA = makeMeeting('h', -5);  // ongoing
    const meetingB = makeMeeting('i', -2);  // also ongoing (started slightly later)
    const manager = new MeetingManager(createMockContext([meetingA, meetingB]));

    const result = manager.getRelevantMeetings(5 * 60 * 1000);

    assert.strictEqual(result.length, 2);
  });
});

// ---------------------------------------------------------------------------
// Test suite: getNextMeeting (regression guard)
// ---------------------------------------------------------------------------

suite('MeetingManager - getNextMeeting', () => {

  test('returns undefined when there are no meetings', () => {
    const manager = new MeetingManager(createMockContext([]));
    assert.strictEqual(manager.getNextMeeting(), undefined);
  });

  test('returns the earliest upcoming or ongoing meeting', () => {
    const past    = makeMeeting('past', -35);  // ended
    const current = makeMeeting('cur', -5);    // ongoing
    const future  = makeMeeting('fut', 10);    // future
    const manager = new MeetingManager(createMockContext([future, past, current]));

    const next = manager.getNextMeeting();

    assert.ok(next, 'Should return a meeting');
    assert.strictEqual(next.id, 'cur', 'Should return the ongoing meeting first');
  });

  test('returns undefined when all meetings have ended', () => {
    const manager = new MeetingManager(createMockContext([
      makeMeeting('x', -35),
      makeMeeting('y', -40),
    ]));
    assert.strictEqual(manager.getNextMeeting(), undefined);
  });
});

// ---------------------------------------------------------------------------
// Test suite: processExpirations with explicit end times
// ---------------------------------------------------------------------------

suite('MeetingManager - processExpirations', () => {
  test('advances an expired weekly meeting while preserving its explicit duration', async () => {
    const now = Date.now();
    const start = new Date(now - 15 * 24 * 60 * 60 * 1000);
    const duration = 60 * 60 * 1000;
    const meeting: Meeting = {
      ...makeMeeting('weekly', 0, 'weekly'),
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + duration).toISOString(),
    };
    const manager = new MeetingManager(createMockContext([meeting]));

    await manager.processExpirations();

    const [updated] = manager.getMeetings();
    const updatedStart = new Date(updated.startTime);
    const updatedEnd = new Date(updated.endTime!);
    assert.ok(updatedStart > start, 'Weekly meeting should advance to a later occurrence');
    assert.ok(updatedEnd.getTime() >= now, 'Weekly meeting should advance to an unexpired occurrence');
    assert.strictEqual(updatedEnd.getTime() - updatedStart.getTime(), duration);
  });

  test('advances an expired weekdays meeting while preserving its explicit duration', async () => {
    const now = Date.now();
    const start = new Date(now - 10 * 24 * 60 * 60 * 1000);
    const duration = 45 * 60 * 1000;
    const meeting: Meeting = {
      ...makeMeeting('weekdays', 0, 'weekdays'),
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + duration).toISOString(),
    };
    const manager = new MeetingManager(createMockContext([meeting]));

    await manager.processExpirations();

    const [updated] = manager.getMeetings();
    const updatedStart = new Date(updated.startTime);
    const updatedEnd = new Date(updated.endTime!);
    assert.ok(updatedStart > start, 'Weekdays meeting should advance to a later occurrence');
    assert.ok(updatedEnd.getTime() >= now, 'Weekdays meeting should advance to an unexpired occurrence');
    assert.ok(updatedStart.getDay() !== 0 && updatedStart.getDay() !== 6, 'Occurrence should be on a weekday');
    assert.strictEqual(updatedEnd.getTime() - updatedStart.getTime(), duration);
  });
});
