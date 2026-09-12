import * as assert from 'assert';
import * as vscode from 'vscode';
import { ReminderService } from '../reminderService';
import { MeetingManager } from '../meetingManager';
import { Meeting } from '../types';

// ---------------------------------------------------------------------------
// Constants (must mirror reminderService.ts internals)
// ---------------------------------------------------------------------------

const MEETING_DURATION_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Mock MeetingManager
// ---------------------------------------------------------------------------

/**
 * Minimal MeetingManager stub that stores meetings in memory.
 * It intentionally does NOT fire onDidChangeMeetings from updateMeeting so that
 * reminder flag tests remain deterministic (no recursive update() calls).
 */
class MockMeetingManager {
  private _meetings: Meeting[] = [];
  private _emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeMeetings = this._emitter.event;

  setMeetings(meetings: Meeting[]): void {
    this._meetings = meetings.map(m => ({ ...m }));
  }

  getMeetings(): Meeting[] {
    return this._meetings;
  }

  getRelevantMeetings(withinMs: number): Meeting[] {
    const now = new Date();
    return [...this._meetings]
      .filter(m => {
        const start = new Date(m.startTime);
        const end   = new Date(start.getTime() + MEETING_DURATION_MS);
        const diffMs = start.getTime() - now.getTime();
        return now < end && diffMs <= withinMs;
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  getNextMeeting(): Meeting | undefined {
    const now = new Date();
    return [...this._meetings]
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .find(m => {
        const start = new Date(m.startTime);
        const end   = new Date(start.getTime() + MEETING_DURATION_MS);
        return now <= end;
      });
  }

  getSortedMeetings(): Meeting[] {
    return [...this._meetings].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  }

  async processExpirations(): Promise<boolean> {
    return false;
  }

  async updateMeeting(meeting: Meeting): Promise<void> {
    const idx = this._meetings.findIndex(m => m.id === meeting.id);
    if (idx !== -1) {
      this._meetings[idx] = { ...meeting };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    title: `会議 ${id}`,
    url: `https://teams.microsoft.com/meet/${id}`,
    startTime: new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString(),
    recurrence,
    notified5m: false,
    notifiedStart: false,
  };
}

/** Returns the status bar text of a service via internal access. */
function statusText(service: ReminderService): string {
  return (service as any).statusBarItem.text as string;
}

/** Returns the status bar background of a service via internal access. */
function statusBg(service: ReminderService): vscode.ThemeColor | undefined {
  return (service as any).statusBarItem.backgroundColor as vscode.ThemeColor | undefined;
}

// ---------------------------------------------------------------------------
// Test suite: Status bar display (single meeting)
// ---------------------------------------------------------------------------

suite('ReminderService - Status Bar (single meeting)', () => {
  let mockManager: MockMeetingManager;
  let service: ReminderService;

  setup(() => {
    mockManager = new MockMeetingManager();
    service = new ReminderService(mockManager as unknown as MeetingManager);
  });

  teardown(() => {
    service.dispose();
  });

  test('shows "予定なし" when no meetings are registered', async () => {
    mockManager.setMeetings([]);
    await service.update();
    assert.ok(statusText(service).includes('予定なし'), `Got: "${statusText(service)}"`);
    assert.strictEqual(statusBg(service), undefined);
  });

  test('shows countdown with no index suffix for a meeting more than 5 min away', async () => {
    mockManager.setMeetings([makeMeeting('a', 60)]);
    await service.update();
    const text = statusText(service);
    assert.ok(text.includes('Next Teams'), `Got: "${text}"`);
    assert.ok(text.includes('in '),        `Got: "${text}"`);
    // No rotation index should appear for a non-relevant meeting
    assert.ok(!text.includes('[1/'), `Should not contain "[1/" but got: "${text}"`);
    assert.strictEqual(statusBg(service), undefined);
  });

  test('shows warning display (in Xm) for a meeting 3 min away', async () => {
    const m = makeMeeting('b', 3);
    mockManager.setMeetings([m]);
    await service.update();
    const text = statusText(service);
    assert.ok(/in \d+m/.test(text), `Expected "in Xm" pattern but got: "${text}"`);
    assert.ok(text.includes(m.title), `Expected title in text but got: "${text}"`);
    assert.ok(!text.includes('Next Teams:'), `Should not contain "Next Teams:" but got: "${text}"`);
    assert.ok(statusBg(service) instanceof vscode.ThemeColor, 'Expected ThemeColor background');
    assert.ok(!text.includes('[1/1]'), `Should not contain "[1/1]" but got: "${text}"`);
  });

  test('shows error display (まもなく開始) for a meeting less than 1 min away', async () => {
    // 30 seconds from now
    const meeting: Meeting = {
      ...makeMeeting('c', 0),
      startTime: new Date(Date.now() + 30 * 1000).toISOString(),
    };
    mockManager.setMeetings([meeting]);
    await service.update();
    const text = statusText(service);
    assert.ok(text.includes('まもなく開始'), `Got: "${text}"`);
    assert.ok(text.includes(meeting.title), `Expected title in text but got: "${text}"`);
    assert.ok(!text.includes('Next Teams:'), `Should not contain "Next Teams:" but got: "${text}"`);
    assert.ok(statusBg(service) instanceof vscode.ThemeColor, 'Expected ThemeColor background');
  });

  test('shows 開催中 with broadcast icon for an ongoing meeting', async () => {
    const m = makeMeeting('d', -10); // started 10 min ago
    mockManager.setMeetings([m]); 
    await service.update();
    const text = statusText(service);
    assert.ok(text.includes('開催中'),   `Got: "${text}"`);
    assert.ok(text.includes('broadcast'), `Got: "${text}"`);
    assert.ok(text.includes(m.title), `Expected title in text but got: "${text}"`);
    assert.ok(!text.includes('Teams:'), `Should not contain "Teams:" but got: "${text}"`);
    // Ongoing uses prominentBackground
    // NOTE: VS Code's StatusBarItem setter strictly drops ThemeColors that aren't errorBackground or warningBackground.
    // So reading it back yields undefined in the extension host.
    assert.strictEqual(statusBg(service), undefined, 'Expected undefined because VS Code drops unsupported background colors');
    assert.strictEqual((service as any).statusBarItem.color, undefined, 'Expected no text color');
  });
});

// ---------------------------------------------------------------------------
// Test suite: Status bar rotation (multiple meetings)
// ---------------------------------------------------------------------------

suite('ReminderService - Status Bar Rotation (multiple meetings)', () => {
  let mockManager: MockMeetingManager;
  let service: ReminderService;

  setup(() => {
    mockManager = new MockMeetingManager();
    service = new ReminderService(mockManager as unknown as MeetingManager);
  });

  teardown(() => {
    service.dispose();
  });

  test('shows [1/2] suffix when two meetings are relevant', async () => {
    mockManager.setMeetings([
      makeMeeting('a', -5), // ongoing
      makeMeeting('b', 3),  // 3 min away
    ]);
    await service.update();
    const text = statusText(service);
    // rotationIndex starts at 0 → first meeting with [1/2]
    assert.ok(text.includes('[1/2]'), `Expected "[1/2]" but got: "${text}"`);
  });

  test('shows [2/2] suffix when rotationIndex is manually advanced to 1', async () => {
    mockManager.setMeetings([
      makeMeeting('a', -5), // ongoing
      makeMeeting('b', 3),  // 3 min away
    ]);
    await service.update();

    // Simulate a rotation tick
    (service as any).rotationIndex = 1;
    (service as any).updateStatusBar();

    const text = statusText(service);
    assert.ok(text.includes('[2/2]'), `Expected "[2/2]" but got: "${text}"`);
    // Use regex to tolerate Math.floor rounding (e.g. 2m59s → "in 2m")
    assert.ok(/in \d+m/.test(text), `Expected "in Xm" for second meeting but got: "${text}"`);
  });

  test('resets rotationIndex to 0 when meeting list composition changes', async () => {
    const m1 = makeMeeting('j', -5);
    const m2 = makeMeeting('k', 3);
    mockManager.setMeetings([m1, m2]);
    await service.update();

    // Advance to second meeting
    (service as any).rotationIndex = 1;

    // Delete m2
    mockManager.setMeetings([m1]);
    await service.update(); // triggers ID-based change detection

    assert.strictEqual((service as any).rotationIndex, 0, 'rotationIndex should reset to 0');
  });

  test('clamps stale rotationIndex without crashing when meeting is deleted between rotation tick and update', async () => {
    const m1 = makeMeeting('l', -5);
    const m2 = makeMeeting('m', 3);
    mockManager.setMeetings([m1, m2]);
    await service.update();

    // Simulate a race: rotation tick fires with a stale high index
    (service as any).rotationIndex = 99;

    // updateStatusBar should clamp and not throw
    assert.doesNotThrow(() => {
      (service as any).updateStatusBar();
    });
    assert.strictEqual((service as any).rotationIndex, 0, 'rotationIndex should be clamped to 0');
  });

  test('currentRelevantMeetings reflects addition of a new meeting', async () => {
    mockManager.setMeetings([makeMeeting('n', 3)]);
    await service.update();
    assert.strictEqual((service as any).currentRelevantMeetings.length, 1);

    // Add another meeting within the window
    mockManager.setMeetings([makeMeeting('n', 3), makeMeeting('o', 4)]);
    await service.update();
    assert.strictEqual((service as any).currentRelevantMeetings.length, 2);
  });

  test('currentRelevantMeetings is cleared when all relevant meetings are removed', async () => {
    mockManager.setMeetings([makeMeeting('p', 3)]);
    await service.update();
    assert.strictEqual((service as any).currentRelevantMeetings.length, 1);

    mockManager.setMeetings([]);
    await service.update();
    assert.strictEqual((service as any).currentRelevantMeetings.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Test suite: Reminder notifications (flag management)
// ---------------------------------------------------------------------------

suite('ReminderService - Reminder Flags', () => {
  let mockManager: MockMeetingManager;
  let service: ReminderService;

  setup(() => {
    mockManager = new MockMeetingManager();
    service = new ReminderService(mockManager as unknown as MeetingManager);
  });

  teardown(() => {
    service.dispose();
  });

  test('sets notified5m=true for ALL meetings within the 5-min window', async () => {
    const m1: Meeting = { ...makeMeeting('q', 3), notified5m: false };
    const m2: Meeting = { ...makeMeeting('r', 4), notified5m: false };
    mockManager.setMeetings([m1, m2]);
    await service.update();

    const meetings = mockManager.getMeetings();
    assert.ok(meetings.find(m => m.id === 'q')?.notified5m, 'Meeting q: notified5m should be true');
    assert.ok(meetings.find(m => m.id === 'r')?.notified5m, 'Meeting r: notified5m should be true');
  });

  test('does not re-set notified5m for meetings already flagged', async () => {
    const meeting: Meeting = { ...makeMeeting('s', 3), notified5m: true };
    mockManager.setMeetings([meeting]);
    // Verify update completes without error; flag stays true
    await assert.doesNotReject(service.update());
    const stored = mockManager.getMeetings();
    assert.ok(stored.find(m => m.id === 's')?.notified5m, 'Flag should remain true');
  });

  test('sets notifiedStart=true for ALL meetings at or just past their start time', async () => {
    // Both meetings started within the last 2 minutes
    const m1: Meeting = {
      ...makeMeeting('t', 0),
      startTime: new Date(Date.now() - 30 * 1000).toISOString(),  // 30s ago
      notifiedStart: false,
    };
    const m2: Meeting = {
      ...makeMeeting('u', 0),
      startTime: new Date(Date.now() - 60 * 1000).toISOString(),  // 1 min ago
      notifiedStart: false,
    };
    mockManager.setMeetings([m1, m2]);
    await service.update();

    const meetings = mockManager.getMeetings();
    assert.ok(meetings.find(m => m.id === 't')?.notifiedStart, 'Meeting t: notifiedStart should be true');
    assert.ok(meetings.find(m => m.id === 'u')?.notifiedStart, 'Meeting u: notifiedStart should be true');
  });

  test('does not set notifiedStart for a meeting started more than 2 min ago', async () => {
    const meeting: Meeting = {
      ...makeMeeting('v', 0),
      startTime: new Date(Date.now() - 3 * 60 * 1000).toISOString(), // 3 min ago
      notifiedStart: false,
    };
    mockManager.setMeetings([meeting]);
    await service.update();

    const stored = mockManager.getMeetings();
    assert.strictEqual(
      stored.find(m => m.id === 'v')?.notifiedStart,
      false,
      'notifiedStart should remain false for meeting started > 2 min ago'
    );
  });

  test('does not set notified5m for a meeting outside the 5-min window (10 min away)', async () => {
    const meeting: Meeting = { ...makeMeeting('w', 10), notified5m: false };
    mockManager.setMeetings([meeting]);
    await service.update();

    const stored = mockManager.getMeetings();
    assert.strictEqual(
      stored.find(m => m.id === 'w')?.notified5m,
      false,
      'notified5m should remain false for a meeting 10 min away'
    );
  });
});
