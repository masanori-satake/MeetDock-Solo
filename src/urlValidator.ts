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
