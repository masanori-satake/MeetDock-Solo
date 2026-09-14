import * as vscode from 'vscode';
import { MeetingManager } from './meetingManager';
import { MeetingTreeDataProvider, MeetingTreeItem } from './treeProvider';
import { ReminderService } from './reminderService';
import { addFromClipboardCommand, editRecurrenceCommand } from './commands';
import { checkForUpdates } from './updateChecker';
import { getTeamsChatUrl, openTeamsChatUrl, openTeamsMeetingUrl } from './urlValidator';
import { Meeting } from './types';
import { t } from './i18n';

/**
 * Activates MeetDock and registers its tree view, reminders, and commands.
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('MeetDock-Solo is now active!');

  // Check for updates in background asynchronously without blocking activation
  checkForUpdates(context).catch(() => {});

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

  const openMeetingDisposable = vscode.commands.registerCommand('meetdock-solo.openMeeting', async (item?: MeetingTreeItem) => {
    if (item && item.meeting) {
      await openTeamsMeetingUrl(item.meeting.url);
      return;
    }
    await vscode.commands.executeCommand('meetdock-solo.selectMeeting');
  });

  const openChatDisposable = vscode.commands.registerCommand('meetdock-solo.openChat', async (item?: MeetingTreeItem) => {
    if (item && item.meeting) {
      await openTeamsChatUrl(item.meeting.url);
      return;
    }

    const sortedMeetings = meetingManager.getSortedMeetings();
    if (sortedMeetings.length === 0) {
      const choice = await vscode.window.showInformationMessage(
        t.noMeetingsPrompt(),
        t.addBtn()
      );
      if (choice === t.addBtn()) {
        await addFromClipboardCommand(meetingManager);
      }
      return;
    }

    const meetingsWithChat = sortedMeetings.filter(m => getTeamsChatUrl(m.url) !== undefined);
    if (meetingsWithChat.length === 0) {
      vscode.window.showWarningMessage(t.cannotOpenChatMsg());
      return;
    }

    if (meetingsWithChat.length === 1) {
      await openTeamsChatUrl(meetingsWithChat[0].url);
      return;
    }

    type MeetingQuickPickItem = vscode.QuickPickItem & { meeting: Meeting };
    const items: MeetingQuickPickItem[] = meetingsWithChat.map(m => {
      const start = new Date(m.startTime);
      const timeStr = start.toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
      return {
        label: `$(comment-discussion) ${m.title}`,
        description: `${timeStr} (${m.recurrence})`,
        meeting: m
      };
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: t.selectMeetingPlaceholder()
    });

    if (selected) {
      await openTeamsChatUrl(selected.meeting.url);
    }
  });

  const deleteMeetingDisposable = vscode.commands.registerCommand('meetdock-solo.deleteMeeting', async (item?: MeetingTreeItem) => {
    if (item && item.meeting) {
      await meetingManager.removeMeeting(item.meeting.id);
      vscode.window.showInformationMessage(t.meetingDeleted(item.meeting.title));
    }
  });

  const editRecurrenceDisposable = vscode.commands.registerCommand('meetdock-solo.editRecurrence', async (item?: any) => {
    await editRecurrenceCommand(meetingManager, item);
  });

  const refreshViewDisposable = vscode.commands.registerCommand('meetdock-solo.refreshView', () => {
    treeDataProvider.refresh();
  });

  const selectMeetingDisposable = vscode.commands.registerCommand('meetdock-solo.selectMeeting', async () => {
    const sortedMeetings = meetingManager.getSortedMeetings();
    if (sortedMeetings.length === 0) {
      const choice = await vscode.window.showInformationMessage(
        t.noMeetingsPrompt(),
        t.addBtn()
      );
      if (choice === t.addBtn()) {
        await addFromClipboardCommand(meetingManager);
      }
      return;
    }

    type MeetingQuickPickItem = vscode.QuickPickItem & { meeting: Meeting };

    const quickPick = vscode.window.createQuickPick<MeetingQuickPickItem>();
    quickPick.placeholder = t.selectMeetingPlaceholder();

    quickPick.items = sortedMeetings.map(m => {
      const start = new Date(m.startTime);
      const timeStr = start.toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
      const hasChat = getTeamsChatUrl(m.url) !== undefined;
      return {
        label: `$(calendar) ${m.title}`,
        description: `${timeStr} (${m.recurrence})`,
        buttons: hasChat ? [{
          iconPath: new vscode.ThemeIcon('comment-discussion'),
          tooltip: t.openChatBtn()
        }] : [],
        meeting: m
      };
    });

    quickPick.onDidTriggerItemButton((e) => {
      openTeamsChatUrl(e.item.meeting.url);
      quickPick.hide();
    });

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected) {
        openTeamsMeetingUrl(selected.meeting.url);
      }
      quickPick.hide();
    });

    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
  });

  context.subscriptions.push(
    treeView,
    treeDataProvider,
    reminderService,
    addClipboardDisposable,
    openMeetingDisposable,
    openChatDisposable,
    deleteMeetingDisposable,
    editRecurrenceDisposable,
    refreshViewDisposable,
    selectMeetingDisposable
  );
}

/**
 * Deactivates the extension after VS Code disposes its registered resources.
 */
export function deactivate() {}
