import * as assert from 'assert';
import { isValidTeamsUrl } from '../urlValidator';

suite('URL Validator Test Suite', () => {
  test('validates legitimate Teams URLs correctly', () => {
    assert.strictEqual(isValidTeamsUrl('https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc'), true);
    assert.strictEqual(isValidTeamsUrl('https://teams.live.com/l/meetup-join/19%3ameeting_xyz'), true);
    assert.strictEqual(isValidTeamsUrl('  https://teams.microsoft.com/l/meetup-join/test  '), true);
  });

  test('rejects unsafe schemes and invalid domains', () => {
    assert.strictEqual(isValidTeamsUrl('javascript:alert(1)'), false);
    assert.strictEqual(isValidTeamsUrl('command:workbench.action.openSettings'), false);
    assert.strictEqual(isValidTeamsUrl('file:///etc/passwd'), false);
    assert.strictEqual(isValidTeamsUrl('http://teams.microsoft.com/l/meetup-join/test'), false); // must be https
    assert.strictEqual(isValidTeamsUrl('https://evil-teams.microsoft.com/l/meetup-join'), false);
    assert.strictEqual(isValidTeamsUrl('https://teams.microsoft.com.evil.com/test'), false);
    assert.strictEqual(isValidTeamsUrl('https://example.com'), false);
    assert.strictEqual(isValidTeamsUrl(''), false);
  });
});
