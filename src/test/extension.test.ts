import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
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

  test('addFromFileCommand parses file and registers meeting correctly', async () => {
    const store: Record<string, any> = {};
    const mockContext: any = {
      globalState: {
        get: (key: string, defaultVal: any) => store[key] ?? defaultVal,
        update: async (key: string, val: any) => { store[key] = val; }
      }
    };
    const manager = new MeetingManager(mockContext);

    const fixturePath = path.join(process.cwd(), 'src', 'test', 'fixtures', 'single_jp.ics');
    const originalShowOpenDialog = vscode.window.showOpenDialog;
    let openDialogOptions: vscode.OpenDialogOptions | undefined;
    (vscode.window as any).showOpenDialog = async (options: vscode.OpenDialogOptions) => {
      openDialogOptions = options;
      return [vscode.Uri.file(fixturePath)];
    };

    try {
      const { addFromFileCommand } = require('../commands');
      await addFromFileCommand(manager);

      const meetings = manager.getMeetings();
      assert.strictEqual(meetings.length, 1);
      assert.strictEqual(meetings[0].title, '単発定例会議');
      assert.strictEqual(openDialogOptions?.openLabel, t.importIcsOpenLabel());
    } finally {
      (vscode.window as any).showOpenDialog = originalShowOpenDialog;
    }
  });

  test('package.json contributes viewsWelcome for meetdock-view and NLS files contain required instructions and recurrence note', () => {
    const rootDir = path.resolve(__dirname, '../../');
    const pkgPath = path.join(rootDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    assert.ok(pkg.contributes?.viewsWelcome, 'viewsWelcome should be defined in package.json contributes');
    const meetdockWelcome = pkg.contributes.viewsWelcome.find((vw: any) => vw.view === 'meetdock-view');
    assert.ok(meetdockWelcome, 'meetdock-view should have viewsWelcome configuration');
    assert.strictEqual(meetdockWelcome.contents, '%meetdock.welcome.contents%');
    const addFromFileCommand = pkg.contributes.commands.find((command: any) => command.command === 'meetdock-solo.addFromFile');
    assert.strictEqual(addFromFileCommand.title, '%meetdock.command.addFromFile.title%');

    // Japanese NLS
    const jaNlsPath = path.join(rootDir, 'package.nls.ja.json');
    assert.ok(fs.existsSync(jaNlsPath), 'package.nls.ja.json should exist');
    const jaNls = JSON.parse(fs.readFileSync(jaNlsPath, 'utf8'));
    const jaContent = jaNls['meetdock.welcome.contents'];
    assert.strictEqual(jaNls['meetdock.command.addFromFile.title'], 'MeetDock: .ics ファイルから会議を追加');
    assert.ok(jaContent.includes('企業 (Enterprise) 向け Teams'), 'Japanese welcome view should contain Enterprise Teams section');
    assert.ok(jaContent.includes('個人 (Personal) 向け Teams'), 'Japanese welcome view should contain Personal Teams section');
    assert.ok(jaContent.includes('一部の .ics ファイル'), 'Japanese welcome view should limit the recurrence warning to some .ics files');
    assert.ok(jaContent.includes('繰り返しルール (RRULE) が含まれていない場合があります'), 'Japanese welcome view should describe the optional lack of a recurrence rule');
    assert.ok(jaContent.includes('会議の登録後に設定を変更してください'), 'Japanese welcome view should state post-registration recurrence configuration');
    assert.ok(jaContent.includes('$(warning)') && jaContent.includes('(command:meetdock-solo.addFromClipboard)') && jaContent.includes('(command:meetdock-solo.addFromFile)'), 'Japanese welcome view should retain the warning icon and command links');
    assert.ok(jaContent.includes('###') && jaContent.includes('**') && jaContent.includes('>'), 'Japanese welcome view should support Markdown headings, bold, and quote formatting');

    // English NLS
    const enNlsPath = path.join(rootDir, 'package.nls.json');
    assert.ok(fs.existsSync(enNlsPath), 'package.nls.json should exist');
    const enNls = JSON.parse(fs.readFileSync(enNlsPath, 'utf8'));
    const enContent = enNls['meetdock.welcome.contents'];
    assert.strictEqual(enNls['meetdock.command.addFromFile.title'], 'MeetDock: Add Meetings from .ics File');
    assert.ok(enContent.includes('Enterprise Teams'), 'English welcome view should contain Enterprise Teams section');
    assert.ok(enContent.includes('Personal Teams'), 'English welcome view should contain Personal Teams section');
    assert.ok(enContent.includes('Some .ics files'), 'English welcome view should limit the recurrence warning to some .ics files');
    assert.ok(enContent.includes('may contain only an individual occurrence (RECURRENCE-ID) and no recurrence rule (RRULE)'), 'English welcome view should describe the optional lack of a recurrence rule');
    assert.ok(enContent.includes('configure recurrence after registering'), 'English welcome view should state post-registration recurrence configuration');
    assert.ok(enContent.includes('$(warning)') && enContent.includes('(command:meetdock-solo.addFromClipboard)') && enContent.includes('(command:meetdock-solo.addFromFile)'), 'English welcome view should retain the warning icon and command links');
    assert.ok(enContent.includes('###') && enContent.includes('**') && enContent.includes('>'), 'English welcome view should support Markdown headings, bold, and quote formatting');
  });
});
