import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MeetingTreeItem } from '../treeProvider';
import { MeetingManager } from '../meetingManager';
import { Meeting } from '../types';
import { getTeamsChatUrl, openTeamsChatUrl } from '../urlValidator';
import { deleteMeetingCommand } from '../commands';
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

  test('deleteMeeting command cancels when modal dialog is dismissed and deletes when confirmed', async () => {
    const meeting: Meeting = {
      id: 'm-del',
      title: '削除用会議',
      url: 'https://teams.microsoft.com/l/meetup-join/1',
      startTime: '2026-09-14T10:00:00.000Z',
      recurrence: 'once'
    };
    const quickPickMeeting: Meeting = {
      id: 'm-del-picked',
      title: '選択された削除用会議',
      url: 'https://teams.microsoft.com/l/meetup-join/2',
      startTime: '2026-09-14T11:00:00.000Z',
      recurrence: 'once'
    };

    let confirmResponse: string | undefined = undefined;
    const warningModalCalls: { msg: string; modal: boolean; buttons: string[] }[] = [];
    const removedMeetingIds: string[] = [];

    (vscode.window as any).showWarningMessage = (msg: string, options?: any, ...buttons: string[]) => {
      if (options && typeof options === 'object' && options.modal) {
        warningModalCalls.push({ msg, modal: true, buttons });
        return Promise.resolve(confirmResponse);
      }
      return Promise.resolve(undefined);
    };

    const mockManager: any = {
      getSortedMeetings: () => [meeting, quickPickMeeting],
      removeMeeting: async (id: string) => {
        removedMeetingIds.push(id);
      }
    };

    const treeItem = new MeetingTreeItem(meeting);

    // Scenario A: User cancels confirmation -> meeting is NOT deleted
    confirmResponse = undefined;
    await deleteMeetingCommand(mockManager, treeItem);
    assert.strictEqual(warningModalCalls.length, 1);
    assert.strictEqual(warningModalCalls[0].msg, t.deleteConfirm(meeting.title));
    assert.strictEqual(warningModalCalls[0].buttons[0], t.deleteBtn());
    assert.deepStrictEqual(removedMeetingIds, []);

    // Scenario B: User confirms deletion from a tree item
    confirmResponse = t.deleteBtn();
    await deleteMeetingCommand(mockManager, treeItem);
    assert.strictEqual(warningModalCalls.length, 2);
    assert.deepStrictEqual(removedMeetingIds, [meeting.id]);

    // Scenario C: Command palette invocation selects a meeting before confirmation
    removedMeetingIds.length = 0;
    (vscode.window as any).showQuickPick = (items: any[]) => {
      quickPickItemsList.push(items);
      return Promise.resolve(items.find(item => item.meeting.id === quickPickMeeting.id));
    };
    await deleteMeetingCommand(mockManager);
    assert.strictEqual(quickPickItemsList.length, 1);
    assert.deepStrictEqual(quickPickItemsList[0].map(item => item.meeting.id), [meeting.id, quickPickMeeting.id]);
    assert.strictEqual(warningModalCalls.length, 3);
    assert.strictEqual(warningModalCalls[2].msg, t.deleteConfirm(quickPickMeeting.title));
    assert.deepStrictEqual(removedMeetingIds, [quickPickMeeting.id]);
    assert.strictEqual(infoCalls.at(-1)?.msg, t.meetingDeleted(quickPickMeeting.title));
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

  test('addFromFileCommand persists once and reports an already registered meeting', async () => {
    const store: Record<string, any> = {};
    let updateCount = 0;
    const mockContext: any = {
      globalState: {
        get: (key: string, defaultVal: any) => store[key] ?? defaultVal,
        update: async (key: string, val: any) => {
          updateCount++;
          store[key] = val;
        }
      }
    };
    const manager = new MeetingManager(mockContext);

    const fixturePath = path.join(process.cwd(), 'src', 'test', 'fixtures', 'single_jp.ics');
    const originalShowOpenDialog = vscode.window.showOpenDialog;
    const originalShowInformationMessage = vscode.window.showInformationMessage;
    const informationMessages: string[] = [];
    (vscode.window as any).showOpenDialog = async () => [vscode.Uri.file(fixturePath)];
    (vscode.window as any).showInformationMessage = async (message: string) => {
      informationMessages.push(message);
      return undefined;
    };

    try {
      const { addFromFileCommand } = require('../commands');
      await addFromFileCommand(manager);
      await addFromFileCommand(manager);

      const meetings = manager.getMeetings();
      assert.strictEqual(meetings.length, 1);
      assert.strictEqual(meetings[0].title, '単発定例会議');
      assert.strictEqual(updateCount, 1, 'the duplicate import should not trigger another save');
      assert.strictEqual(informationMessages.at(-1), t.icsAlreadyRegistered());
    } finally {
      (vscode.window as any).showOpenDialog = originalShowOpenDialog;
      (vscode.window as any).showInformationMessage = originalShowInformationMessage;
    }
  });

  test('package.json contributes viewsWelcome for meetdock-guide-view and NLS files contain required instructions and recurrence note', () => {
    const rootDir = path.resolve(__dirname, '../../');
    const pkgPath = path.join(rootDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    assert.ok(pkg.contributes?.viewsWelcome, 'viewsWelcome should be defined in package.json contributes');
    const meetdockWelcome = pkg.contributes.viewsWelcome.find((vw: any) => vw.view === 'meetdock-guide-view');
    assert.ok(meetdockWelcome, 'meetdock-guide-view should have viewsWelcome configuration');
    assert.strictEqual(meetdockWelcome.contents, '%meetdock.welcome.contents%');

    // Japanese NLS
    const jaNlsPath = path.join(rootDir, 'package.nls.ja.json');
    assert.ok(fs.existsSync(jaNlsPath), 'package.nls.ja.json should exist');
    const jaNls = JSON.parse(fs.readFileSync(jaNlsPath, 'utf8'));
    const jaContent = jaNls['meetdock.welcome.contents'];
    assert.ok(jaContent.includes('企業 (Enterprise) 向け Teams'), 'Japanese welcome view should contain Enterprise Teams section');
    assert.ok(jaContent.includes('個人 (Personal) 向け Teams'), 'Japanese welcome view should contain Personal Teams section');
    assert.ok(jaContent.includes('一部の .ics ファイル'), 'Japanese welcome view should limit the recurrence warning to some .ics files');
    assert.ok(jaContent.includes('繰り返しルール (RRULE) が含まれていない場合があります'), 'Japanese welcome view should describe the optional lack of a recurrence rule');
    assert.ok(jaContent.includes('会議の登録後に設定を変更してください'), 'Japanese welcome view should state post-registration recurrence configuration');
    assert.ok(jaContent.includes('$(warning)') && jaContent.includes('(command:meetdock-solo.addFromClipboard)') && jaContent.includes('(command:meetdock-solo.addFromFile)'), 'Japanese welcome view should retain the warning icon and command links');
    assert.ok(jaContent.includes('ドラッグ＆ドロップ'), 'Japanese welcome view should contain drag-and-drop instructions');
    assert.ok(!jaContent.includes('###') && !jaContent.includes('**') && !jaContent.includes('>'), 'Japanese welcome view should avoid unsupported Markdown syntax (###, **, >)');
    assert.ok(!jaContent.split('\n').map((l: string) => l.trim()).some((l: string) => l.startsWith('-')), 'Japanese welcome view should not contain list items starting with -');

    // English NLS
    const enNlsPath = path.join(rootDir, 'package.nls.json');
    assert.ok(fs.existsSync(enNlsPath), 'package.nls.json should exist');
    const enNls = JSON.parse(fs.readFileSync(enNlsPath, 'utf8'));
    const enContent = enNls['meetdock.welcome.contents'];
    assert.ok(enContent.includes('Enterprise Teams'), 'English welcome view should contain Enterprise Teams section');
    assert.ok(enContent.includes('Personal Teams'), 'English welcome view should contain Personal Teams section');
    assert.ok(enContent.includes('Some .ics files'), 'English welcome view should limit the recurrence warning to some .ics files');
    assert.ok(enContent.includes('may contain only an individual occurrence (RECURRENCE-ID) and no recurrence rule (RRULE)'), 'English welcome view should describe the optional lack of a recurrence rule');
    assert.ok(enContent.includes('configure recurrence after registering'), 'English welcome view should state post-registration recurrence configuration');
    assert.ok(enContent.includes('$(warning)') && enContent.includes('(command:meetdock-solo.addFromClipboard)') && enContent.includes('(command:meetdock-solo.addFromFile)'), 'English welcome view should retain the warning icon and command links');
    assert.ok(enContent.toLowerCase().includes('drag'), 'English welcome view should contain drag-and-drop instructions');
    assert.ok(!enContent.includes('###') && !enContent.includes('**') && !enContent.includes('>'), 'English welcome view should avoid unsupported Markdown syntax (###, **, >)');
    assert.ok(!enContent.split('\n').map((l: string) => l.trim()).some((l: string) => l.startsWith('-')), 'English welcome view should not contain list items starting with -');

    // Verify view visibility configuration in package.json
    const guideView = pkg.contributes.views['meetdock-container'].find((v: any) => v.id === 'meetdock-guide-view');
    assert.ok(guideView, 'meetdock-guide-view should exist in contributes.views');
    assert.strictEqual(guideView.visibility, 'collapsed', 'meetdock-guide-view visibility should be set to collapsed');
    assert.strictEqual(guideView.when, undefined, 'meetdock-guide-view should not have when condition hiding it');
  });

  test('package.json activationEvents includes onView activation events for all contributed views', () => {
    const rootDir = path.resolve(__dirname, '../../');
    const pkgPath = path.join(rootDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    assert.ok(Array.isArray(pkg.activationEvents), 'activationEvents should be an array in package.json');

    const viewsContainers = pkg.contributes?.views || {};
    for (const containerId of Object.keys(viewsContainers)) {
      const views = viewsContainers[containerId];
      if (Array.isArray(views)) {
        for (const view of views) {
          const expectedActivationEvent = `onView:${view.id}`;
          assert.ok(
            pkg.activationEvents.includes(expectedActivationEvent),
            `activationEvents should include '${expectedActivationEvent}' for contributed view '${view.id}'`
          );
        }
      }
    }
  });
});
