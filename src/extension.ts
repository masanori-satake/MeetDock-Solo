import * as vscode from 'vscode';
import { MeetingManager } from './meetingManager';
import { MeetingTreeDataProvider, MeetingTreeItem } from './treeProvider';
import { ReminderService } from './reminderService';
import { addFromClipboardCommand } from './commands';

/**
 * Activates MeetDock and registers its tree view, reminders, and commands.
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('MeetDock-Solo is now active!');

  const meetingManager = new MeetingManager(context);
  const treeDataProvider = new MeetingTreeDataProvider(meetingManager);
  const reminderService = new ReminderService(meetingManager);

  // Register TreeView with Drag & Drop support
  const treeView = vscode.window.createTreeView('meetdock-view', {
    treeDataProvider,
    dragAndDropController: treeDataProvider
  });

  // Start Reminder Service
  reminderService.start();

  // Register Commands
  const addClipboardDisposable = vscode.commands.registerCommand('meetdock-solo.addFromClipboard', async () => {
    await addFromClipboardCommand(meetingManager);
  });

  const openMeetingDisposable = vscode.commands.registerCommand('meetdock-solo.openMeeting', (item?: MeetingTreeItem) => {
    if (item && item.meeting) {
      vscode.env.openExternal(vscode.Uri.parse(item.meeting.url));
    }
  });

  const deleteMeetingDisposable = vscode.commands.registerCommand('meetdock-solo.deleteMeeting', async (item?: MeetingTreeItem) => {
    if (item && item.meeting) {
      await meetingManager.removeMeeting(item.meeting.id);
      vscode.window.showInformationMessage(`MeetDock: ミーティング「${item.meeting.title}」を削除しました。`);
    }
  });

  const refreshViewDisposable = vscode.commands.registerCommand('meetdock-solo.refreshView', () => {
    treeDataProvider.refresh();
  });

  const selectMeetingDisposable = vscode.commands.registerCommand('meetdock-solo.selectMeeting', async () => {
    const sortedMeetings = meetingManager.getSortedMeetings();
    if (sortedMeetings.length === 0) {
      const choice = await vscode.window.showInformationMessage(
        '登録された Teams ミーティングはありません。クリップボードから追加しますか？',
        '追加する'
      );
      if (choice === '追加する') {
        await addFromClipboardCommand(meetingManager);
      }
      return;
    }

    const items = sortedMeetings.map(m => {
      const start = new Date(m.startTime);
      const timeStr = start.toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
      return {
        label: `$(calendar) ${m.title}`,
        description: `${timeStr} (${m.recurrence})`,
        detail: m.url,
        meeting: m
      };
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Teams ミーティングを選択してブラウザ/アプリで開きます'
    });

    if (selected) {
      vscode.env.openExternal(vscode.Uri.parse(selected.meeting.url));
    }
  });

  context.subscriptions.push(
    treeView,
    reminderService,
    addClipboardDisposable,
    openMeetingDisposable,
    deleteMeetingDisposable,
    refreshViewDisposable,
    selectMeetingDisposable
  );
}

/**
 * Deactivates the extension after VS Code disposes its registered resources.
 */
export function deactivate() {}
