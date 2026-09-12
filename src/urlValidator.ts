import * as vscode from 'vscode';

/**
 * Validates that a string is a valid HTTPS Microsoft Teams URL.
 * Protects against unsafe schemes (e.g. javascript:, command:, file:) and invalid domains.
 */
export function isValidTeamsUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  const trimmed = url.trim();
  // Ensure strict match for https://teams.microsoft.com/ or https://teams.live.com/
  return /^https:\/\/teams\.(microsoft|live)\.com\//i.test(trimmed);
}

/**
 * Opens a Teams meeting URL safely after validating its scheme and host.
 * Displays an error message if the URL is invalid or unsafe.
 */
export async function openTeamsMeetingUrl(url: string): Promise<boolean> {
  if (!isValidTeamsUrl(url)) {
    vscode.window.showErrorMessage('不安全または無効な Teams URL です。開くことができません。');
    return false;
  }
  return await vscode.env.openExternal(vscode.Uri.parse(url.trim()));
}
