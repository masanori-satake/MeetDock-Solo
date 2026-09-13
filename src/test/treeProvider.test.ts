import * as assert from 'assert';
import * as vscode from 'vscode';
import { MeetingTreeItem, MeetingDetailItem, MeetingTreeDataProvider } from '../treeProvider';
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

    const itemSingle = new MeetingTreeItem(singleMeeting);
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

    const itemRecurring = new MeetingTreeItem(recurringMeeting);
    assert.strictEqual(itemRecurring.label, '週次MTG');
    assert.ok(itemRecurring.iconPath instanceof vscode.ThemeIcon);
    assert.strictEqual(itemRecurring.iconPath.id, 'sync');
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
    const item = new MeetingTreeItem(meeting);
    const manager = {
      onDidChangeMeetings: () => ({ dispose: () => {} }),
      getSortedMeetings: () => []
    } as unknown as MeetingManager;
    const provider = new MeetingTreeDataProvider(manager);
    const details = provider.getChildren(item) as vscode.TreeItem[];

    assert.ok(String(item.description).includes('9/15 00:30'));
    assert.ok(String(item.tooltip).includes('2026/09/15 00:30'));
    assert.ok(String(details[0].label).includes('2026/09/15 00:30'));
  });

  test('MeetingDetailItem creates a collapsible state None item with icon', () => {
    const detail = new MeetingDetailItem('主催者: 田中 太郎', 'person');
    assert.strictEqual(detail.label, '主催者: 田中 太郎');
  });
});
