import * as assert from 'assert';
import * as vscode from 'vscode';
import { MeetingManager, getNextOccurrence } from '../meetingManager';
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
// Test suite: getMeetings sanitization
// ---------------------------------------------------------------------------

suite('MeetingManager - getMeetings sanitization', () => {
  test('filters out null, missing field, invalid date, or non-Teams URL items from globalState', () => {
    const validMeeting: Meeting = {
      id: 'valid1',
      title: 'Valid Meeting',
      url: 'https://teams.microsoft.com/l/meetup-join/19%3avalid',
      startTime: '2026-10-10T10:00:00.000Z',
      recurrence: 'once',
    };
    const nullItem = null;
    const invalidUrlMeeting = {
      id: 'bad1',
      title: 'Bad URL',
      url: 'javascript:alert(1)',
      startTime: '2026-10-10T10:00:00.000Z',
    };
    const invalidDateMeeting = {
      id: 'bad2',
      title: 'Bad Date',
      url: 'https://teams.microsoft.com/l/meetup-join/19%3abadDate',
      startTime: 'not-a-date',
    };
    const missingTitleMeeting = {
      id: 'bad3',
      url: 'https://teams.microsoft.com/l/meetup-join/19%3abadTitle',
      startTime: '2026-10-10T10:00:00.000Z',
    };

    const mockStorage = [validMeeting, nullItem, invalidUrlMeeting, invalidDateMeeting, missingTitleMeeting];
    const manager = new MeetingManager(createMockContext(mockStorage as any));

    const meetings = manager.getMeetings();
    assert.strictEqual(meetings.length, 1);
    assert.strictEqual(meetings[0].id, 'valid1');
  });

  test('filters out ISO dates that normalize to a different calendar date', () => {
    const validMeeting: Meeting = {
      id: 'valid-iso',
      title: 'Valid ISO Meeting',
      url: 'https://teams.microsoft.com/l/meetup-join/19%3avalidIso',
      startTime: '2026-02-28T10:00:00.000Z',
      endTime: '2026-02-28T10:30:00.000Z',
      recurrence: 'daily',
      recurrenceEndDate: '2026-03-31T23:59:59.999Z',
    };
    const impossibleStartTime = {
      ...validMeeting,
      id: 'bad-start',
      startTime: '2026-02-30T10:00:00.000Z',
    };
    const impossibleEndTime = {
      ...validMeeting,
      id: 'bad-end',
      endTime: '2026-02-30T10:30:00.000Z',
    };
    const impossibleRecurrenceEnd = {
      ...validMeeting,
      id: 'bad-recurrence-end',
      recurrenceEndDate: '2026-02-30T23:59:59.999Z',
    };
    const manager = new MeetingManager(createMockContext([
      validMeeting,
      impossibleStartTime,
      impossibleEndTime,
      impossibleRecurrenceEnd,
    ]));

    const meetings = manager.getMeetings();

    assert.deepStrictEqual(meetings.map(meeting => meeting.id), ['valid-iso']);
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
// Test suite: processExpirations with explicit end times & extended recurrences
// ---------------------------------------------------------------------------

suite('MeetingManager - processExpirations & Recurrence Schedule', () => {
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

  test('getNextOccurrence handles daily recurrence with interval 2', () => {
    const start = new Date('2026-09-13T14:30:00.000Z');
    const meeting: Meeting = {
      id: 'daily2',
      title: 'Daily Meeting',
      url: 'https://teams.live.com/meet/123',
      startTime: start.toISOString(),
      recurrence: 'daily',
      recurrenceInterval: 2,
    };

    const now = new Date('2026-09-13T15:01:00.000Z');
    const next = getNextOccurrence(meeting, now);
    assert.ok(next);
    assert.strictEqual(next.toISOString(), '2026-09-15T14:30:00.000Z');
  });

  test('getNextOccurrence handles weekly recurrence with multiple days of week', () => {
    // 2026-09-13 is Sunday (0)
    const start = new Date('2026-09-13T13:42:00.000Z');
    const meeting: Meeting = {
      id: 'weeklyMulti',
      title: 'Weekly Multi Meeting',
      url: 'https://teams.live.com/meet/123',
      startTime: start.toISOString(),
      endTime: new Date('2026-09-13T13:44:00.000Z').toISOString(),
      recurrence: 'weekly',
      daysOfWeek: [0, 2, 3], // Sun, Tue, Wed
    };

    const now = new Date('2026-09-13T13:45:00.000Z'); // Sunday 13:45 (after 13:44 end)
    const next = getNextOccurrence(meeting, now);
    assert.ok(next);
    // Next nearest day is Tuesday 2026-09-15
    assert.strictEqual(next.getUTCDay(), 2); // Tuesday
    assert.strictEqual(next.getUTCDate(), 15);
  });

  test('getNextOccurrence handles monthly recurrence with interval 2', () => {
    const start = new Date('2026-09-13T15:00:00.000Z');
    const meeting: Meeting = {
      id: 'monthly2',
      title: 'Monthly Meeting',
      url: 'https://teams.live.com/meet/123',
      startTime: start.toISOString(),
      recurrence: 'monthly',
      recurrenceInterval: 2,
      dayOfMonth: 13,
    };

    const now = new Date('2026-09-13T15:31:00.000Z');
    const next = getNextOccurrence(meeting, now);
    assert.ok(next);
    assert.strictEqual(next.getUTCMonth(), 10); // November (0-indexed 10)
    assert.strictEqual(next.getUTCDate(), 13);
  });

  test('getNextOccurrence handles yearly recurrence with interval 2', () => {
    const start = new Date('2026-09-13T16:00:00.000Z');
    const meeting: Meeting = {
      id: 'yearly2',
      title: 'Yearly Meeting',
      url: 'https://teams.live.com/meet/123',
      startTime: start.toISOString(),
      recurrence: 'yearly',
      recurrenceInterval: 2,
      monthOfYear: 9,
      dayOfYear: 13,
    };

    const now = new Date('2026-09-13T16:31:00.000Z');
    const next = getNextOccurrence(meeting, now);
    assert.ok(next);
    assert.strictEqual(next.getUTCFullYear(), 2028);
    assert.strictEqual(next.getUTCMonth(), 8); // September
    assert.strictEqual(next.getUTCDate(), 13);
  });

  test('getNextOccurrence keeps the local meeting time across a DST transition', () => {
    const meeting: Meeting = {
      id: 'weeklyDst',
      title: 'Weekly DST Meeting',
      url: 'https://teams.live.com/meet/123',
      startTime: '2026-03-01T14:00:00.000Z',
      endTime: '2026-03-01T14:30:00.000Z',
      timeZone: 'America/New_York',
      recurrence: 'weekly',
      daysOfWeek: [0],
    };

    const next = getNextOccurrence(meeting, new Date('2026-03-01T14:31:00.000Z'));
    assert.ok(next);
    assert.strictEqual(next.toISOString(), '2026-03-08T13:00:00.000Z');
  });

  test('expires meeting when recurrenceEndDate is reached', async () => {
    const start = new Date('2026-09-13T14:30:00.000Z');
    const meeting: Meeting = {
      id: 'dailyExpired',
      title: 'Expired Series',
      url: 'https://teams.live.com/meet/123',
      startTime: start.toISOString(),
      recurrence: 'daily',
      recurrenceInterval: 2,
      recurrenceEndDate: new Date('2026-09-13T23:59:59.999Z').toISOString(),
    };

    const manager = new MeetingManager(createMockContext([meeting]));
    // Date after meeting end and series end date
    const now = new Date('2026-09-14T10:00:00.000Z');
    const originalDate = global.Date;
    global.Date = new Proxy(originalDate, {
      construct(target, args) {
        return args.length === 0 ? new target(now.getTime()) : Reflect.construct(target, args);
      }
    });

    try {
      await manager.processExpirations();
      const meetings = manager.getMeetings();
      assert.strictEqual(meetings.length, 0, 'Meeting should be removed when recurrence series end date is exceeded');
    } finally {
      global.Date = originalDate;
    }
  });
});

suite('MeetingManager - save ordering', () => {
  test('serializes saves in invocation order', async () => {
    const updates: string[][] = [];
    let releaseFirstUpdate!: () => void;
    const firstUpdatePending = new Promise<void>(resolve => {
      releaseFirstUpdate = resolve;
    });
    const context = {
      globalState: {
        get: <T>(_key: string, defaultValue: T): T => defaultValue,
        update: async (_key: string, value: unknown): Promise<void> => {
          updates.push((value as Meeting[]).map(meeting => meeting.id));
          if (updates.length === 1) {
            await firstUpdatePending;
          }
        },
        keys: (): readonly string[] => [],
        setKeysForSync: (_keys: readonly string[]): void => {},
      },
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;
    const manager = new MeetingManager(context);

    const firstSave = manager.saveMeetings([makeMeeting('first', 10)]);
    const secondSave = manager.saveMeetings([makeMeeting('second', 20)]);
    await Promise.resolve();

    assert.deepStrictEqual(updates, [['first']]);
    releaseFirstUpdate();
    await Promise.all([firstSave, secondSave]);
    assert.deepStrictEqual(updates, [['first'], ['second']]);
  });

  test('propagates a save failure and allows the next queued save to proceed', async () => {
    let updateCount = 0;
    const context = {
      globalState: {
        get: <T>(_key: string, defaultValue: T): T => defaultValue,
        update: async (): Promise<void> => {
          updateCount += 1;
          if (updateCount === 1) {
            throw new Error('storage unavailable');
          }
        },
        keys: (): readonly string[] => [],
        setKeysForSync: (_keys: readonly string[]): void => {},
      },
      subscriptions: [],
    } as unknown as vscode.ExtensionContext;
    const manager = new MeetingManager(context);

    const failedSave = manager.saveMeetings([makeMeeting('first', 10)]);
    const successfulSave = manager.saveMeetings([makeMeeting('second', 20)]);

    await assert.rejects(failedSave, /storage unavailable/);
    await successfulSave;
    assert.strictEqual(updateCount, 2);
  });
});
