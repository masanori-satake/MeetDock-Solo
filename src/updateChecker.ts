import * as vscode from 'vscode';
import * as https from 'https';

const MAX_RESPONSE_SIZE = 100 * 1024; // 100KB limit to prevent DoS via unbounded memory growth

/**
 * Helper to fetch latest release tag from GitHub API.
 */
export function fetchLatestReleaseTag(getFn: typeof https.get = https.get): Promise<string> {
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

    const req = getFn(options, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP status code: ${res.statusCode}`));
      }
      let data = '';
      let dataLength = 0;
      res.on('data', (chunk: Buffer | string) => {
        dataLength += chunk.length;
        if (dataLength > MAX_RESPONSE_SIZE) {
          req.destroy(new Error('Response size limit exceeded'));
          return;
        }
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

interface SemVer {
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease?: string[];
  build?: string[];
}

function parseSemVer(version: string): SemVer | undefined {
  const normalized = version.replace(/^v/i, '').trim();
  const match = normalized.match(
    /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
  );

  if (!match) {
    return undefined;
  }

  const [, major, minor, patch, prerelease, build] = match;
  const numericIdentifier = /^(0|[1-9][0-9]*)$/;
  if (!numericIdentifier.test(major) || !numericIdentifier.test(minor) || !numericIdentifier.test(patch)) {
    return undefined;
  }

  const prereleaseIdentifiers = prerelease?.split('.');
  if (prereleaseIdentifiers?.some(identifier => /^[0-9]+$/.test(identifier) && !numericIdentifier.test(identifier))) {
    return undefined;
  }

  return {
    major: BigInt(major),
    minor: BigInt(minor),
    patch: BigInt(patch),
    prerelease: prereleaseIdentifiers,
    build: build?.split('.')
  };
}

/**
 * Compares two version strings (e.g. "1.1.0", "1.0.0", "1.0.0-9007199254740993").
 * Returns true if latestVersion is strictly greater than currentVersion according to SemVer 2.0.0 rules.
 * Invalid version identifiers are rejected by returning false.
 */
export function isNewerVersion(latestVersion: string, currentVersion: string): boolean {
  const latest = parseSemVer(latestVersion);
  const current = parseSemVer(currentVersion);

  if (!latest || !current) {
    return false;
  }

  // Build metadata is parsed for validation but has no effect on precedence.
  for (const component of ['major', 'minor', 'patch'] as const) {
    const p1 = latest[component];
    const p2 = current[component];
    if (p1 > p2) {
      return true;
    }
    if (p1 < p2) {
      return false;
    }
  }

  // Main versions are equal. Handle Prereleases according to SemVer 2.0.0 rules.
  // Normal version has higher precedence than a prerelease version.
  if (latest.prerelease === undefined && current.prerelease !== undefined) {
    return true; // e.g. 1.0.0 > 1.0.0-alpha
  }
  if (latest.prerelease !== undefined && current.prerelease === undefined) {
    return false; // e.g. 1.0.0-alpha < 1.0.0
  }
  if (latest.prerelease === undefined && current.prerelease === undefined) {
    return false; // Both normal & equal main versions
  }

  // Both have prereleases. Compare dot-separated identifiers.
  const ids1 = latest.prerelease!;
  const ids2 = current.prerelease!;
  const maxPreLen = Math.max(ids1.length, ids2.length);

  for (let i = 0; i < maxPreLen; i++) {
    const id1 = ids1[i];
    const id2 = ids2[i];

    if (id1 === undefined) {
      return false; // smaller set of pre-release fields has lower precedence
    }
    if (id2 === undefined) {
      return true; // larger set of pre-release fields has higher precedence
    }

    const isNum1 = /^\d+$/.test(id1);
    const isNum2 = /^\d+$/.test(id2);

    if (isNum1 && isNum2) {
      const b1 = BigInt(id1);
      const b2 = BigInt(id2);
      if (b1 > b2) {
        return true;
      }
      if (b1 < b2) {
        return false;
      }
    } else if (isNum1 && !isNum2) {
      // Numeric identifiers always have lower precedence than non-numeric identifiers
      return false;
    } else if (!isNum1 && isNum2) {
      return true;
    } else {
      // Lexicographical comparison for non-numeric identifiers
      if (id1 > id2) {
        return true;
      }
      if (id1 < id2) {
        return false;
      }
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
