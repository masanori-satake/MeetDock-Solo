import * as vscode from 'vscode';
import * as https from 'https';

/**
 * Helper to fetch latest release tag from GitHub API.
 */
export function fetchLatestReleaseTag(): Promise<string> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path: '/repos/masanori-satake/MeetDock-Solo/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'MeetDock-Solo-VSCode-Extension',
        'Accept': 'application/vnd.github.v3+json'
      },
      timeout: 5000
    };

    const req = https.get(options, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP status code: ${res.statusCode}`));
      }
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed.tag_name === 'string') {
            resolve(parsed.tag_name);
          } else {
            reject(new Error('Invalid response format: tag_name missing'));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

/**
 * Compares two version strings (e.g. "1.1.0" and "1.0.0").
 * Returns true if latestVersion is strictly greater than currentVersion.
 */
export function isNewerVersion(latestVersion: string, currentVersion: string): boolean {
  const cleanLatest = latestVersion.replace(/^v/i, '').trim();
  const cleanCurrent = currentVersion.replace(/^v/i, '').trim();

  const v1Parts = cleanLatest.split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const v2Parts = cleanCurrent.split('-')[0].split('.').map(n => parseInt(n, 10) || 0);

  const maxLength = Math.max(v1Parts.length, v2Parts.length);
  for (let i = 0; i < maxLength; i++) {
    const p1 = v1Parts[i] || 0;
    const p2 = v2Parts[i] || 0;
    if (p1 > p2) {
      return true;
    }
    if (p1 < p2) {
      return false;
    }
  }

  return false;
}

/**
 * Checks GitHub for newer versions of MeetDock-Solo and notifies the user if available.
 */
export async function checkForUpdates(context: vscode.ExtensionContext): Promise<void> {
  try {
    const currentVersion: string = context.extension?.packageJSON?.version;
    if (!currentVersion) {
      return;
    }

    const latestTag = await fetchLatestReleaseTag();
    const cleanTag = latestTag.replace(/^v/i, '').trim();

    if (isNewerVersion(cleanTag, currentVersion)) {
      const displayVersion = `v${cleanTag}`;
      const message = `MeetDock-Solo の新しいバージョン (${displayVersion}) が利用可能です。`;
      const actionTitle = '最新版をダウンロード';

      const selection = await vscode.window.showInformationMessage(message, actionTitle);
      if (selection === actionTitle) {
        await vscode.env.openExternal(
          vscode.Uri.parse('https://github.com/masanori-satake/MeetDock-Solo/releases/latest')
        );
      }
    }
  } catch {
    // Silent fail if offline or API request fails/timeouts
  }
}
