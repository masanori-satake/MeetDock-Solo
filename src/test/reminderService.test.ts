import * as assert from 'assert';
import * as vscode from 'vscode';
import { ReminderService } from '../reminderService';
import { MeetingManager } from '../meetingManager';
import { Meeting } from '../types';
import { t } from '../i18n';

// ---------------------------------------------------------------------------
// Constants (must mirror reminderService.ts internals)
// ---------------------------------------------------------------------------

const MEETING_DURATION_MS = 30 * 60 * 1000;
type Clock = () => Date;

function createFixedClock(): Clock {
  const fixedNow = new Date(2026, 8, 7, 12, 0, 0);
  return () => new Date(fixedNow.getTime());
}

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

  constructor(private readonly now: Clock = () => new Date()) {}

  setMeetings(meetings: Meeting[]): void {
    this._meetings = meetings.map(m => ({ ...m }));
  }

  getMeetings(): Meeting[] {
    return this._meetings;
  }

  getRelevantMeetings(withinMs: number): Meeting[] {
    const now = this.now();
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
    const now = this.now();
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
  now: Clock,
  id: string,
  offsetMinutes: number,
  recurrence: Meeting['recurrence'] = 'once'
): Meeting {
  return {
    id,
    title: `会議 ${id}`,
    url: `https://teams.microsoft.com/meet/${id}`,
    startTime: new Date(now().getTime() + offsetMinutes * 60 * 1000).toISOString(),
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
  let now: Clock;

  setup(() => {
    now = createFixedClock();
    mockManager = new MockMeetingManager(now);
    service = new ReminderService(mockManager as unknown as MeetingManager, now);
  });

  teardown(() => {
    service.dispose();
  });

  test('shows "予定なし" when no meetings are registered', async () => {
    mockManager.setMeetings([]);
    await service.update();
    const txt = statusText(service);
    assert.ok(txt.includes('予定なし') || txt.includes('No upcoming meetings'), `Got: "${txt}"`);
    assert.strictEqual(statusBg(service), undefined);
    assert.strictEqual((service as any).statusBarItem.color, undefined);
  });

  test('shows "明日" / "Tomorrow" for a meeting on the next calendar day (>5 min away)', async () => {
    // now = 2026-09-07 12:00:00
    // tomorrow = 2026-09-08 10:00:00 (22 hours = 1320 minutes away)
    const meeting = makeMeeting(now, 'tomorrow', 1320);
    mockManager.setMeetings([meeting]);
    await service.update();
    const text = statusText(service);
    assert.ok(text.includes('明日') || text.includes('Tomorrow'), `Expected "明日" or "Tomorrow" but got: "${text}"`);
    assert.strictEqual(statusBg(service), undefined);
  });

  test('shows "N日後" / "in N days" for a meeting 2 or more days later', async () => {
    // now = 2026-09-07 12:00:00
    // 2 days later = 2026-09-09 12:00:00 (2880 minutes away)
    const meeting2d = makeMeeting(now, '2days', 2880);
    mockManager.setMeetings([meeting2d]);
    await service.update();
    const text2d = statusText(service);
    assert.ok(text2d.includes('2日後') || text2d.includes('in 2 days'), `Expected "2日後" or "in 2 days" but got: "${text2d}"`);

    // 5 days later = 2026-09-12 12:00:00 (7200 minutes away)
    const meeting5d = makeMeeting(now, '5days', 7200);
    mockManager.setMeetings([meeting5d]);
    await service.update();
    const text5d = statusText(service);
    assert.ok(text5d.includes('5日後') || text5d.includes('in 5 days'), `Expected "5日後" or "in 5 days" but got: "${text5d}"`);
  });

  test('shows warning display when next-day meeting is within 5 minutes', async () => {
    // Custom clock at 23:59:00 on 2026-09-07
    const lateClock: Clock = () => new Date(2026, 8, 7, 23, 59, 0);
    const lateManager = new MockMeetingManager(lateClock);
    const lateService = new ReminderService(lateManager as unknown as MeetingManager, lateClock);

    try {
      // Meeting at 00:04:00 on 2026-09-08 (5 min away, next calendar day)
      const nextDayMeeting: Meeting = {
        id: 'midnight',
        title: '深夜会議',
        url: 'https://teams.microsoft.com/meet/midnight',
        startTime: new Date(2026, 8, 8, 0, 4, 0).toISOString(),
        recurrence: 'once',
        notified5m: false,
        notifiedStart: false,
      };
      lateManager.setMeetings([nextDayMeeting]);
      await lateService.update();

      const text = statusText(lateService);
      // Within 5 min -> warning background and "5分後" / "in 5m"
      assert.ok(text.includes('5分後') || text.includes('in 5m'), `Expected 5m warning text but got: "${text}"`);
      assert.ok(statusBg(lateService) instanceof vscode.ThemeColor, 'Expected ThemeColor background for warning');
    } finally {
      lateService.dispose();
    }
  });

  test('shows countdown with no index suffix for a meeting more than 5 min away', async () => {
    mockManager.setMeetings([makeMeeting(now, 'a', 60)]);
    await service.update();
    const text = statusText(service);
    assert.ok(text.includes('Next Teams'), `Got: "${text}"`);
    assert.ok(text.includes('in '),        `Got: "${text}"`);
    // No rotation index should appear for a non-relevant meeting
    assert.ok(!text.includes('[1/'), `Should not contain "[1/" but got: "${text}"`);
    assert.strictEqual(statusBg(service), undefined);
    assert.strictEqual((service as any).statusBarItem.color, undefined);
  });

  test('shows warning display (in Xm) for a meeting 3 min away', async () => {
    const m = makeMeeting(now, 'b', 3);
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
      ...makeMeeting(now, 'c', 0),
      startTime: new Date(now().getTime() + 30 * 1000).toISOString(),
    };
    mockManager.setMeetings([meeting]);
    await service.update();
    const text = statusText(service);
    assert.ok(text.includes('まもなく開始') || text.includes('Starting soon'), `Got: "${text}"`);
    assert.ok(text.includes(meeting.title), `Expected title in text but got: "${text}"`);
    assert.ok(!text.includes('Next Teams:'), `Should not contain "Next Teams:" but got: "${text}"`);
    assert.ok(statusBg(service) instanceof vscode.ThemeColor, 'Expected ThemeColor background');
  });

  test('shows 開催中 with broadcast icon for an ongoing meeting', async () => {
    const m = makeMeeting(now, 'd', -10); // started 10 min ago
    mockManager.setMeetings([m]);
    await service.update();
    const text = statusText(service);
    assert.ok(text.includes('開催中') || text.includes('In progress'), `Got: "${text}"`);
    assert.ok(text.includes('broadcast'), `Got: "${text}"`);
    assert.ok(text.includes(m.title), `Expected title in text but got: "${text}"`);
    assert.ok(!text.includes('Teams:'), `Should not contain "Teams:" but got: "${text}"`);
    assert.strictEqual(statusBg(service), undefined, 'Expected no background color');
    const color = (service as any).statusBarItem.color;
    assert.ok(color instanceof vscode.ThemeColor, 'Expected ThemeColor text color');
    assert.strictEqual((color as vscode.ThemeColor).id, 'charts.green', 'Expected charts.green text color');
  });

  test('resets text color and background color to standard when transitioning from ongoing to finished/next meeting', async () => {
    const ongoingMeeting = makeMeeting(now, 'ongoing', -10);
    const nextMeeting = makeMeeting(now, 'next', 60);
    mockManager.setMeetings([ongoingMeeting, nextMeeting]);
    await service.update();

    // Verify ongoing meeting styling
    const color = (service as any).statusBarItem.color;
    assert.ok(color instanceof vscode.ThemeColor);
    assert.strictEqual((color as vscode.ThemeColor).id, 'charts.green');
    assert.strictEqual(statusBg(service), undefined);

    // Simulate ongoing meeting finishing by removing it
    mockManager.setMeetings([nextMeeting]);
    await service.update();

    // Verify default styling is restored
    assert.strictEqual((service as any).statusBarItem.color, undefined, 'Expected color to reset to undefined');
    assert.strictEqual(statusBg(service), undefined, 'Expected background color to reset to undefined');
    assert.ok(statusText(service).includes('Next Teams'), `Got: "${statusText(service)}"`);
  });

  test('resets text color and background color when transitioning from ongoing to no meetings', async () => {
    const ongoingMeeting = makeMeeting(now, 'ongoing', -10);
    mockManager.setMeetings([ongoingMeeting]);
    await service.update();

    // Verify ongoing meeting styling before clearing the meeting list.
    const color = (service as any).statusBarItem.color;
    assert.ok(color instanceof vscode.ThemeColor);
    assert.strictEqual((color as vscode.ThemeColor).id, 'charts.green');
    assert.strictEqual(statusBg(service), undefined);

    mockManager.setMeetings([]);
    await service.update();

    assert.strictEqual((service as any).statusBarItem.color, undefined, 'Expected color to reset to undefined');
    assert.strictEqual(statusBg(service), undefined, 'Expected background color to reset to undefined');
  });
});

// ---------------------------------------------------------------------------
// Test suite: Status bar rotation (multiple meetings)
// ---------------------------------------------------------------------------

suite('ReminderService - Status Bar Rotation (multiple meetings)', () => {
  let mockManager: MockMeetingManager;
  let service: ReminderService;
  let now: Clock;

  setup(() => {
    now = createFixedClock();
    mockManager = new MockMeetingManager(now);
    service = new ReminderService(mockManager as unknown as MeetingManager, now);
  });

  teardown(() => {
    service.dispose();
  });

  test('shows [1/2] suffix when two meetings are relevant', async () => {
    mockManager.setMeetings([
      makeMeeting(now, 'a', -5), // ongoing
      makeMeeting(now, 'b', 3),  // 3 min away
    ]);
    await service.update();
    const text = statusText(service);
    // rotationIndex starts at 0 → first meeting with [1/2]
    assert.ok(text.includes('[1/2]'), `Expected "[1/2]" but got: "${text}"`);
  });

  test('shows [2/2] suffix when rotationIndex is manually advanced to 1', async () => {
    mockManager.setMeetings([
      makeMeeting(now, 'a', -5), // ongoing
      makeMeeting(now, 'b', 3),  // 3 min away
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
    const m1 = makeMeeting(now, 'j', -5);
    const m2 = makeMeeting(now, 'k', 3);
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
    const m1 = makeMeeting(now, 'l', -5);
    const m2 = makeMeeting(now, 'm', 3);
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
    mockManager.setMeetings([makeMeeting(now, 'n', 3)]);
    await service.update();
    assert.strictEqual((service as any).currentRelevantMeetings.length, 1);

    // Add another meeting within the window
    mockManager.setMeetings([makeMeeting(now, 'n', 3), makeMeeting(now, 'o', 4)]);
    await service.update();
    assert.strictEqual((service as any).currentRelevantMeetings.length, 2);
  });

  test('currentRelevantMeetings is cleared when all relevant meetings are removed', async () => {
    mockManager.setMeetings([makeMeeting(now, 'p', 3)]);
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
  let now: Clock;

  setup(() => {
    now = createFixedClock();
    mockManager = new MockMeetingManager(now);
    service = new ReminderService(mockManager as unknown as MeetingManager, now);
  });

  teardown(() => {
    service.dispose();
  });

  test('sets notified5m=true for ALL meetings within the 5-min window', async () => {
    const m1: Meeting = { ...makeMeeting(now, 'q', 3), notified5m: false };
    const m2: Meeting = { ...makeMeeting(now, 'r', 4), notified5m: false };
    mockManager.setMeetings([m1, m2]);
    await service.update();

    const meetings = mockManager.getMeetings();
    assert.ok(meetings.find(m => m.id === 'q')?.notified5m, 'Meeting q: notified5m should be true');
    assert.ok(meetings.find(m => m.id === 'r')?.notified5m, 'Meeting r: notified5m should be true');
  });

  test('does not re-set notified5m for meetings already flagged', async () => {
    const meeting: Meeting = { ...makeMeeting(now, 's', 3), notified5m: true };
    mockManager.setMeetings([meeting]);
    // Verify update completes without error; flag stays true
    await assert.doesNotReject(service.update());
    const stored = mockManager.getMeetings();
    assert.ok(stored.find(m => m.id === 's')?.notified5m, 'Flag should remain true');
  });

  test('sets notifiedStart=true for ALL meetings at or just past their start time', async () => {
    // Both meetings started within the last 2 minutes
    const m1: Meeting = {
      ...makeMeeting(now, 't', 0),
      startTime: new Date(now().getTime() - 30 * 1000).toISOString(),  // 30s ago
      notifiedStart: false,
    };
    const m2: Meeting = {
      ...makeMeeting(now, 'u', 0),
      startTime: new Date(now().getTime() - 60 * 1000).toISOString(),  // 1 min ago
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
      ...makeMeeting(now, 'v', 0),
      startTime: new Date(now().getTime() - 3 * 60 * 1000).toISOString(), // 3 min ago
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
    const meeting: Meeting = { ...makeMeeting(now, 'w', 10), notified5m: false };
    mockManager.setMeetings([meeting]);
    await service.update();

    const stored = mockManager.getMeetings();
    assert.strictEqual(
      stored.find(m => m.id === 'w')?.notified5m,
      false,
      'notified5m should remain false for a meeting 10 min away'
    );
  });

  test('5-minute and start-time reminders omit openChat button when meeting has no chat URL', async () => {
    const originalShow = vscode.window.showInformationMessage;
    const calls: { msg: string; items: any[] }[] = [];
    (vscode.window as any).showInformationMessage = (msg: string, ...items: any[]) => {
      calls.push({ msg, items });
      return Promise.resolve(undefined);
    };

    try {
      // Personal Teams meeting (no chat thread ID) starting in 3 mins
      const personalMeeting: Meeting = {
        id: 'personal1',
        title: '個人会議5m',
        url: 'https://teams.live.com/meet/93735498380940?p=6kSddKYY6KaGxK5CF2',
        startTime: new Date(now().getTime() + 3 * 60 * 1000).toISOString(),
        recurrence: 'once',
        notified5m: false,
        notifiedStart: false,
      };

      mockManager.setMeetings([personalMeeting]);
      await service.update();

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].items.length, 1);
      assert.strictEqual(calls[0].items[0], t.joinBtn());

      // Personal Teams meeting starting now (0 mins away), not notified at 5m
      const personalMeetingStart: Meeting = {
        id: 'personal2',
        title: '個人会議Start',
        url: 'https://teams.live.com/meet/93735498380940?p=6kSddKYY6KaGxK5CF2',
        startTime: new Date(now().getTime() - 10 * 1000).toISOString(),
        recurrence: 'once',
        notified5m: false,
        notifiedStart: false,
      };

      calls.length = 0;
      mockManager.setMeetings([personalMeetingStart]);
      await service.update();

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].msg, t.reminderStartMsg(personalMeetingStart.title));
      const buttonItems = calls[0].items.filter(item => typeof item === 'string');
      assert.strictEqual(buttonItems.length, 1);
      assert.strictEqual(buttonItems[0], t.joinBtn());
    } finally {
      (vscode.window as any).showInformationMessage = originalShow;
    }
  });

  test('5-minute and start-time reminders include openChat button when meeting has chat URL', async () => {
    const originalShow = vscode.window.showInformationMessage;
    const calls: { msg: string; items: any[] }[] = [];
    (vscode.window as any).showInformationMessage = (msg: string, ...items: any[]) => {
      calls.push({ msg, items });
      return Promise.resolve(undefined);
    };

    try {
      const enterpriseMeeting: Meeting = {
        id: 'ent1',
        title: '企業会議5m',
        url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_ABC123%40thread.v2/0',
        startTime: new Date(now().getTime() + 3 * 60 * 1000).toISOString(),
        recurrence: 'once',
        notified5m: false,
        notifiedStart: false,
      };

      mockManager.setMeetings([enterpriseMeeting]);
      await service.update();

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].items.length, 2);
      assert.strictEqual(calls[0].items[0], t.joinBtn());
      assert.strictEqual(calls[0].items[1], t.openChatBtn());

      const enterpriseMeetingStart: Meeting = {
        id: 'ent2',
        title: '企業会議Start',
        url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_ABC123%40thread.v2/0',
        startTime: new Date(now().getTime() - 10 * 1000).toISOString(),
        recurrence: 'once',
        notified5m: false,
        notifiedStart: false,
      };

      calls.length = 0;
      mockManager.setMeetings([enterpriseMeetingStart]);
      await service.update();

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].msg, t.reminderStartMsg(enterpriseMeetingStart.title));
      const buttonItems = calls[0].items.filter(item => typeof item === 'string');
      assert.strictEqual(buttonItems.length, 2);
      assert.strictEqual(buttonItems[0], t.joinBtn());
      assert.strictEqual(buttonItems[1], t.openChatBtn());
    } finally {
      (vscode.window as any).showInformationMessage = originalShow;
    }
  });

  test('shows start-time notification even when notified5m is already true', async () => {
    const originalShow = vscode.window.showInformationMessage;
    const calls: { msg: string; items: any[] }[] = [];
    (vscode.window as any).showInformationMessage = (msg: string, ...items: any[]) => {
      calls.push({ msg, items });
      return Promise.resolve(undefined);
    };

    try {
      const meetingAlreadyNotified5m: Meeting = {
        id: 'start1',
        title: '開始時通知テスト',
        url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_ABC123%40thread.v2/0',
        startTime: new Date(now().getTime() - 10 * 1000).toISOString(),
        recurrence: 'once',
        notified5m: true,
        notifiedStart: false,
      };

      mockManager.setMeetings([meetingAlreadyNotified5m]);
      await service.update();

      // showInformationMessage SHOULD be called for start notification
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].msg, t.reminderStartMsg(meetingAlreadyNotified5m.title));

      // And notifiedStart flag should still be updated to true
      const stored = mockManager.getMeetings();
      assert.strictEqual(stored.find(m => m.id === 'start1')?.notifiedStart, true);
    } finally {
      (vscode.window as any).showInformationMessage = originalShow;
    }
  });
});
