import * as assert from 'assert';
import * as vscode from 'vscode';
import { MeetingTreeItem } from '../treeProvider';
import { MeetingManager } from '../meetingManager';
import { Meeting } from '../types';
import { getTeamsChatUrl, openTeamsChatUrl } from '../urlValidator';
import { t } from '../i18n';

suite('Extension & openChat Command Test Suite', () => {
  let originalWarning: typeof vscode.window.showWarningMessage;
  let originalInfo: typeof vscode.window.showInformationMessage;
  let originalExternal: typeof vscode.env.openExternal;
  let originalQuickPick: typeof vscode.window.showQuickPick;

  let warningCalls: string[] = [];
  let infoCalls: { msg: string; items: any[] }[] = [];
  let externalCalls: string[] = [];
  let quickPickItemsList: any[][] = [];

  setup(() => {
    originalWarning = vscode.window.showWarningMessage;
    originalInfo = vscode.window.showInformationMessage;
    originalExternal = vscode.env.openExternal;
    originalQuickPick = vscode.window.showQuickPick;

    warningCalls = [];
    infoCalls = [];
    externalCalls = [];
    quickPickItemsList = [];

    (vscode.window as any).showWarningMessage = (msg: string) => {
      warningCalls.push(msg);
      return Promise.resolve(undefined);
    };

    (vscode.window as any).showInformationMessage = (msg: string, ...items: any[]) => {
      infoCalls.push({ msg, items });
      return Promise.resolve(undefined);
    };

    (vscode.env as any).openExternal = (uri: vscode.Uri) => {
      externalCalls.push(uri.toString());
      return Promise.resolve(true);
    };

    (vscode.window as any).showQuickPick = (items: any[]) => {
      quickPickItemsList.push(items);
      return Promise.resolve(items[0]);
    };
  });

  teardown(() => {
    (vscode.window as any).showWarningMessage = originalWarning;
    (vscode.window as any).showInformationMessage = originalInfo;
    (vscode.env as any).openExternal = originalExternal;
    (vscode.window as any).showQuickPick = originalQuickPick;
  });

  test('openTeamsChatUrl returns false and shows warning for personal Teams URL', async () => {
    const personalUrl = 'https://teams.live.com/meet/93735498380940?p=6kSddKYY6KaGxK5CF2';
    const result = await openTeamsChatUrl(personalUrl);

    assert.strictEqual(result, false);
    assert.strictEqual(warningCalls.length, 1);
    assert.strictEqual(warningCalls[0], t.cannotOpenChatMsg());
    assert.strictEqual(externalCalls.length, 0);
  });

  test('openTeamsChatUrl opens external URL for enterprise Teams URL with thread ID', async () => {
    const enterpriseUrl = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_Y2M3YWQwYjEt%40thread.v2/0?context=123';
    const result = await openTeamsChatUrl(enterpriseUrl);

    assert.strictEqual(result, true);
    assert.strictEqual(warningCalls.length, 0);
    assert.strictEqual(externalCalls.length, 1);
    assert.strictEqual(externalCalls[0], vscode.Uri.parse('https://teams.microsoft.com/l/chat/19:meeting_Y2M3YWQwYjEt@thread.v2/conversations').toString());
  });

  test('filtering meetings for openChat produces expected subsets', () => {
    const personalMeeting: Meeting = {
      id: 'p1',
      title: '個人会議',
      url: 'https://teams.live.com/meet/93735498380940?p=6kSddKYY6KaGxK5CF2',
      startTime: '2026-09-14T10:00:00.000Z',
      recurrence: 'once'
    };

    const enterpriseMeeting1: Meeting = {
      id: 'e1',
      title: '組織会議1',
      url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_AAA111%40thread.v2/0',
      startTime: '2026-09-14T11:00:00.000Z',
      recurrence: 'once'
    };

    const enterpriseMeeting2: Meeting = {
      id: 'e2',
      title: '組織会議2',
      url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_BBB222%40thread.v2/0',
      startTime: '2026-09-14T12:00:00.000Z',
      recurrence: 'once'
    };

    const allMeetings = [personalMeeting, enterpriseMeeting1, enterpriseMeeting2];

    // Scenario 1: Zero chat-capable meetings (only personal)
    const zeroChat = [personalMeeting].filter(m => getTeamsChatUrl(m.url) !== undefined);
    assert.strictEqual(zeroChat.length, 0);

    // Scenario 2: One chat-capable meeting
    const oneChat = [personalMeeting, enterpriseMeeting1].filter(m => getTeamsChatUrl(m.url) !== undefined);
    assert.strictEqual(oneChat.length, 1);
    assert.strictEqual(oneChat[0].id, 'e1');

    // Scenario 3: Multiple chat-capable meetings
    const multiChat = allMeetings.filter(m => getTeamsChatUrl(m.url) !== undefined);
    assert.strictEqual(multiChat.length, 2);
    assert.deepStrictEqual(multiChat.map(m => m.id), ['e1', 'e2']);
  });

  test('MeetingTreeItem contextValue differs for chat-capable and non-chat meetings', () => {
    const personalMeeting: Meeting = {
      id: 'p1',
      title: '個人会議',
      url: 'https://teams.live.com/meet/93735498380940?p=6kSddKYY6KaGxK5CF2',
      startTime: '2026-09-14T10:00:00.000Z',
      recurrence: 'once'
    };

    const enterpriseMeeting: Meeting = {
      id: 'e1',
      title: '組織会議',
      url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_AAA111%40thread.v2/0',
      startTime: '2026-09-14T11:00:00.000Z',
      recurrence: 'once'
    };

    const itemPersonal = new MeetingTreeItem(personalMeeting);
    const itemEnterprise = new MeetingTreeItem(enterpriseMeeting);

    assert.strictEqual(itemPersonal.contextValue, 'meetingItem');
    assert.strictEqual(itemEnterprise.contextValue, 'meetingItemWithChat');
  });
});
