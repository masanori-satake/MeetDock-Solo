import * as assert from 'assert';
import * as vscode from 'vscode';
import { getMeetingStatusState, MeetingTreeItem, MeetingDetailItem, MeetingTreeDataProvider } from '../treeProvider';
import { MeetingManager } from '../meetingManager';
import { Meeting } from '../types';

suite('TreeProvider Test Suite', () => {
  test('MeetingTreeItem uses calendar icon for single meeting and sync icon for recurring meeting', () => {
    const singleMeeting: Meeting = {
      id: '1',
      title: '単発MTG',
      url: 'https://teams.microsoft.com/l/meetup-join/1',
      startTime: '2026-09-14T08:30:00.000Z',
      endTime: '2026-09-14T09:30:00.000Z',
      recurrence: 'once',
      organizer: 'Satake Masanori'
    };

    const itemSingle = new MeetingTreeItem(singleMeeting, new Date('2026-09-10T00:00:00.000Z'));
    assert.strictEqual(itemSingle.label, '単発MTG');
    assert.ok(itemSingle.iconPath instanceof vscode.ThemeIcon);
    assert.strictEqual(itemSingle.iconPath.id, 'calendar');

    const recurringMeeting: Meeting = {
      id: '2',
      title: '週次MTG',
      url: 'https://teams.microsoft.com/l/meetup-join/2',
      startTime: '2026-09-14T08:30:00.000Z',
      endTime: '2026-09-14T09:30:00.000Z',
      recurrence: 'weekly',
      organizer: 'Satake Masanori'
    };

    const itemRecurring = new MeetingTreeItem(recurringMeeting, new Date('2026-09-10T00:00:00.000Z'));
    assert.strictEqual(itemRecurring.label, '週次MTG');
    assert.ok(itemRecurring.iconPath instanceof vscode.ThemeIcon);
    assert.strictEqual(itemRecurring.iconPath.id, 'sync');
  });

  test('MeetingTreeItem applies status visuals based on meeting status', () => {
    const meeting: Meeting = {
      id: 'm1',
      title: 'ステータステスト会議',
      url: 'https://teams.microsoft.com/l/meetup-join/1',
      startTime: '2026-09-14T10:00:00.000Z',
      endTime: '2026-09-14T10:30:00.000Z',
      recurrence: 'once'
    };

    // 1. Normal state (far in advance)
    const normalItem = new MeetingTreeItem(meeting, new Date('2026-09-14T09:00:00.000Z'));
    assert.strictEqual((normalItem.iconPath as vscode.ThemeIcon).id, 'calendar');
    assert.ok(!String(normalItem.description).includes('分前'));

    // 2. Warning state (3 minutes before)
    const warningItem = new MeetingTreeItem(meeting, new Date('2026-09-14T09:57:00.000Z'));
    assert.strictEqual((warningItem.iconPath as vscode.ThemeIcon).id, 'warning');
    assert.strictEqual((warningItem.iconPath as vscode.ThemeIcon).color?.id, 'charts.yellow');
    assert.ok(String(warningItem.description).includes('(3分後)') || String(warningItem.description).includes('(In 3m)'));

    // 3. Starting soon state (30 seconds before)
    const soonItem = new MeetingTreeItem(meeting, new Date('2026-09-14T09:59:30.000Z'));
    assert.strictEqual((soonItem.iconPath as vscode.ThemeIcon).id, 'error');
    assert.strictEqual((soonItem.iconPath as vscode.ThemeIcon).color?.id, 'charts.red');
    assert.ok(String(soonItem.description).includes('(まもなく開始)') || String(soonItem.description).includes('(Starting soon)'));

    // 4. Ongoing state
    const ongoingItem = new MeetingTreeItem(meeting, new Date('2026-09-14T10:15:00.000Z'));
    assert.strictEqual((ongoingItem.iconPath as vscode.ThemeIcon).id, 'radio-tower');
    assert.strictEqual((ongoingItem.iconPath as vscode.ThemeIcon).color?.id, 'charts.green');
    assert.ok(String(ongoingItem.description).includes('(開催中)') || String(ongoingItem.description).includes('(In progress)'));

    assert.strictEqual(getMeetingStatusState(meeting, new Date('2026-09-14T09:55:00.000Z')), 'warning');
    assert.strictEqual(getMeetingStatusState(meeting, new Date('2026-09-14T09:54:59.999Z')), 'normal');
  });

  test('MeetingTreeDataProvider checkStatusChange triggers refresh only when state changes', () => {
    let mockNow = new Date('2026-09-14T09:00:00.000Z');
    const meeting: Meeting = {
      id: 'm1',
      title: 'タイマーテスト会議',
      url: 'https://teams.microsoft.com/l/meetup-join/1',
      startTime: '2026-09-14T10:00:00.000Z',
      endTime: '2026-09-14T10:30:00.000Z',
      recurrence: 'once'
    };

    const manager = {
      onDidChangeMeetings: () => ({ dispose: () => {} }),
      getSortedMeetings: () => [meeting]
    } as unknown as MeetingManager;

    const provider = new MeetingTreeDataProvider(manager, () => mockNow);
    provider.stopStatusCheckTimer(); // Stop automatic interval for manual invocation

    let refreshFired = 0;
    provider.onDidChangeTreeData(() => {
      refreshFired++;
    });

    // 1. First check - no state change from initial
    provider.checkStatusChange();
    assert.strictEqual(refreshFired, 0, 'Should not fire refresh if status state did not change');

    // 2. Advance time slightly within normal state (9:00:10)
    mockNow = new Date('2026-09-14T09:00:10.000Z');
    provider.checkStatusChange();
    assert.strictEqual(refreshFired, 0, 'Should not fire refresh if status remains normal');

    // 3. Advance time to warning state (9:56:00 - 4 mins before)
    mockNow = new Date('2026-09-14T09:56:00.000Z');
    provider.checkStatusChange();
    assert.strictEqual(refreshFired, 1, 'Should fire refresh when state transitions to warning');

    // 4. Advance time slightly within warning state (9:57:00)
    provider.checkStatusChange();
    assert.strictEqual(refreshFired, 1, 'Should not fire refresh again while remaining in warning state');

    provider.dispose();
  });

  test('includes the end date for a meeting that spans calendar dates', () => {
    const start = new Date(2026, 8, 14, 23, 30);
    const end = new Date(2026, 8, 15, 0, 30);
    const meeting: Meeting = {
      id: 'overnight',
      title: 'Overnight meeting',
      url: 'https://teams.microsoft.com/meet/overnight',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      recurrence: 'once'
    };
    const item = new MeetingTreeItem(meeting, new Date(2026, 8, 14, 10, 0));
    const manager = {
      onDidChangeMeetings: () => ({ dispose: () => {} }),
      getSortedMeetings: () => []
    } as unknown as MeetingManager;
    const provider = new MeetingTreeDataProvider(manager, () => new Date(2026, 8, 14, 10, 0));
    provider.stopStatusCheckTimer();
    const details = provider.getChildren(item) as vscode.TreeItem[];

    assert.ok(String(item.description).includes('9/15 00:30'));
    assert.ok(String(item.tooltip).includes('2026/09/15 00:30'));
    assert.ok(String(details[0].label).includes('2026/09/15 00:30'));
    provider.dispose();
  });

  test('MeetingDetailItem creates a collapsible state None item with icon', () => {
    const detail = new MeetingDetailItem('主催者: 田中 太郎', 'person');
    assert.strictEqual(detail.label, '主催者: 田中 太郎');
  });
});
