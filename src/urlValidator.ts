import * as vscode from 'vscode';
import { t } from './i18n';

const TEAMS_HOSTNAMES = new Set(['teams.microsoft.com', 'teams.live.com']);
const SAFE_LINKS_HOST_SUFFIX = '.safelinks.protection.outlook.com';

function isDirectTeamsUrl(url: URL): boolean {
  return url.protocol === 'https:' && TEAMS_HOSTNAMES.has(url.hostname.toLowerCase());
}

/**
 * Returns the decoded Teams destination from a Microsoft Safe Links URL.
 */
export function getTeamsUrlFromSafeLink(url: string): string | undefined {
  try {
    const safeLinksUrl = new URL(url.trim());
    const hostname = safeLinksUrl.hostname.toLowerCase();
    if (safeLinksUrl.protocol !== 'https:' || !hostname.endsWith(SAFE_LINKS_HOST_SUFFIX)) {
      return undefined;
    }

    const targetParam = safeLinksUrl.searchParams.get('url');
    if (!targetParam) {
      return undefined;
    }

    const target = targetParam.trim();
    return isDirectTeamsUrl(new URL(target)) ? target : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validates that a string is a valid HTTPS Microsoft Teams URL.
 * Protects against unsafe schemes (e.g. javascript:, command:, file:) and invalid domains.
 */
export function isValidTeamsUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  const trimmed = url.trim();
  try {
    if (isDirectTeamsUrl(new URL(trimmed))) {
      return true;
    }
  } catch {
    return false;
  }
  return getTeamsUrlFromSafeLink(trimmed) !== undefined;
}

/**
 * Opens a Teams meeting URL safely after validating its scheme and host.
 * Displays an error message if the URL is invalid or unsafe.
 */
export async function openTeamsMeetingUrl(url: string): Promise<boolean> {
  if (!isValidTeamsUrl(url)) {
    vscode.window.showErrorMessage(t.unsafeUrlMsg());
    return false;
  }
  return await vscode.env.openExternal(vscode.Uri.parse(url.trim()));
}

/**
 * Extracts the Teams chat URL from a meeting URL (for enterprise Teams meetings with a thread ID).
 * Returns undefined if the URL cannot be converted to a chat URL (e.g. personal Teams meetings).
 */
export function getTeamsChatUrl(url: string): string | undefined {
  if (!isValidTeamsUrl(url)) {
    return undefined;
  }

  let targetUrl = url.trim();
  const safeLink = getTeamsUrlFromSafeLink(targetUrl);
  if (safeLink) {
    targetUrl = safeLink;
  }

  try {
    const target = new URL(targetUrl);
    const meetupJoinMatch = target.pathname.match(/^\/l\/meetup-join\/([^/]+)(?:\/|$)/);
    if (!meetupJoinMatch) {
      return undefined;
    }

    const meetingId = decodeURIComponent(meetupJoinMatch[1]);
    const match = meetingId.match(/^19:[a-zA-Z0-9_\-=%]+@(thread\.[a-zA-Z0-9_\-]+|unq\.gbl\.spaces)$/);
    if (!match) {
      return undefined;
    }
    const chatId = match[0];
    return `https://teams.microsoft.com/l/chat/${chatId}/conversations`;
  } catch {
    return undefined;
  }
}

/**
 * Opens the Teams meeting chat URL if possible.
 * Displays a warning message if the chat URL cannot be extracted.
 */
export async function openTeamsChatUrl(url: string): Promise<boolean> {
  const chatUrl = getTeamsChatUrl(url);
  if (!chatUrl) {
    vscode.window.showWarningMessage(t.cannotOpenChatMsg());
    return false;
  }
  return await vscode.env.openExternal(vscode.Uri.parse(chatUrl));
}
