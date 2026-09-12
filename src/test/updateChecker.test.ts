import * as assert from 'assert';
import { isNewerVersion } from '../updateChecker';

suite('UpdateChecker Test Suite', () => {
  test('isNewerVersion correctly compares versions', () => {
    // Newer major
    assert.strictEqual(isNewerVersion('2.0.0', '1.3.1'), true);
    assert.strictEqual(isNewerVersion('v2.0.0', '1.3.1'), true);

    // Newer minor
    assert.strictEqual(isNewerVersion('1.4.0', '1.3.1'), true);
    assert.strictEqual(isNewerVersion('v1.4.0', 'v1.3.1'), true);

    // Newer patch
    assert.strictEqual(isNewerVersion('1.3.2', '1.3.1'), true);

    // Same version
    assert.strictEqual(isNewerVersion('1.3.1', '1.3.1'), false);
    assert.strictEqual(isNewerVersion('v1.3.1', '1.3.1'), false);

    // A stable release succeeds its prerelease of the same version
    assert.strictEqual(isNewerVersion('1.2.3', '1.2.3-beta.1'), true);

    // Older version
    assert.strictEqual(isNewerVersion('1.3.0', '1.3.1'), false);
    assert.strictEqual(isNewerVersion('1.2.9', '1.3.1'), false);
    assert.strictEqual(isNewerVersion('0.9.9', '1.0.0'), false);

    // Multiple digits
    assert.strictEqual(isNewerVersion('1.10.0', '1.2.0'), true);
    assert.strictEqual(isNewerVersion('1.2.0', '1.10.0'), false);
  });
});
