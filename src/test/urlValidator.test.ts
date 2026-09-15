import * as assert from 'assert';
import { getTeamsChatUrl, isValidTeamsUrl, openTeamsChatUrl } from '../urlValidator';

suite('URL Validator Test Suite', () => {
  test('validates legitimate Teams URLs correctly', () => {
    assert.strictEqual(isValidTeamsUrl('https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc'), true);
    assert.strictEqual(isValidTeamsUrl('https://teams.live.com/l/meetup-join/19%3ameeting_xyz'), true);
    assert.strictEqual(isValidTeamsUrl('https://teams.live.com/meet/9398636609731?p=5tlDf18IUn3zDYR0UR'), true);
    assert.strictEqual(isValidTeamsUrl('https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fteams.microsoft.com'), true);
    assert.strictEqual(isValidTeamsUrl('https://teams.microsoft.com:443/l/meetup-join/test'), true);
    assert.strictEqual(isValidTeamsUrl('  https://teams.microsoft.com/l/meetup-join/test  '), true);
  });

  test('rejects unsafe schemes and invalid domains', () => {
    assert.strictEqual(isValidTeamsUrl('javascript:alert(1)'), false);
    assert.strictEqual(isValidTeamsUrl('command:workbench.action.openSettings'), false);
    assert.strictEqual(isValidTeamsUrl('file:///etc/passwd'), false);
    assert.strictEqual(isValidTeamsUrl('http://teams.microsoft.com/l/meetup-join/test'), false); // must be https
    assert.strictEqual(isValidTeamsUrl('https://evil-teams.microsoft.com/l/meetup-join'), false);
    assert.strictEqual(isValidTeamsUrl('https://teams.microsoft.com.evil.com/test'), false);
    assert.strictEqual(isValidTeamsUrl('https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com%2Fphishing'), false);
    assert.strictEqual(isValidTeamsUrl('https://nam12.safelinks.protection.outlook.com/?url=http%3A%2F%2Fteams.microsoft.com%2Fmeet%2F123'), false);
    assert.strictEqual(isValidTeamsUrl('https://example.com'), false);
    assert.strictEqual(isValidTeamsUrl(''), false);
  });

  test('extracts chat URL from enterprise Teams URLs', () => {
    const rawUrl = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_Y2M3YWQwYjEt%40thread.v2/0?context=123';
    assert.strictEqual(
      getTeamsChatUrl(rawUrl),
      'https://teams.microsoft.com/l/chat/19:meeting_Y2M3YWQwYjEt@thread.v2/conversations'
    );
  });

  test('extracts chat URL from SafeLinks wrapping enterprise Teams URLs', () => {
    const safeLinkUrl = 'https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fteams.microsoft.com%2Fl%2Fmeetup-join%2F19%253ameeting_ABC123%2540thread.v2%2F0';
    assert.strictEqual(
      getTeamsChatUrl(safeLinkUrl),
      'https://teams.microsoft.com/l/chat/19:meeting_ABC123@thread.v2/conversations'
    );
  });

  test('returns undefined for personal Teams URLs without thread ID', () => {
    const personalUrl = 'https://teams.live.com/meet/939100970';
    assert.strictEqual(getTeamsChatUrl(personalUrl), undefined);
  });

  test('returns undefined for invalid or unsafe URLs', () => {
    assert.strictEqual(getTeamsChatUrl('javascript:alert(1)'), undefined);
    assert.strictEqual(getTeamsChatUrl('https://example.com'), undefined);
    // Malformed thread ID with path separators or control characters
    assert.strictEqual(getTeamsChatUrl('https://teams.microsoft.com/l/meetup-join/19%3ameeting_ABC%2fDEF%40thread.v2/0'), undefined);
  });

  test('openTeamsChatUrl validates generated chat URL before opening external link', async () => {
    // Verified that openTeamsChatUrl returns true for valid enterprise Teams URL
    const validUrl = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_ABC123%40thread.v2/0';
    const result = await openTeamsChatUrl(validUrl);
    assert.strictEqual(result, true);
  });
});
