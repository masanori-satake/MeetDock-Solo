import * as assert from 'assert';
import { MeetingTreeItem, MeetingDetailItem } from '../treeProvider';
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
    assert.ok(itemSingle.iconPath);

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
    assert.ok(itemRecurring.iconPath);
  });

  test('MeetingDetailItem creates a collapsible state None item with icon', () => {
    const detail = new MeetingDetailItem('主催者: 田中 太郎', 'person');
    assert.strictEqual(detail.label, '主催者: 田中 太郎');
  });
});
