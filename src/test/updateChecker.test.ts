import * as assert from 'assert';
import * as https from 'https';
import { EventEmitter } from 'events';
import { fetchLatestReleaseTag, isNewerVersion } from '../updateChecker';

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

    // Older version
    assert.strictEqual(isNewerVersion('1.3.0', '1.3.1'), false);
    assert.strictEqual(isNewerVersion('1.2.9', '1.3.1'), false);
    assert.strictEqual(isNewerVersion('0.9.9', '1.0.0'), false);

    // Multiple digits
    assert.strictEqual(isNewerVersion('1.10.0', '1.2.0'), true);
    assert.strictEqual(isNewerVersion('1.2.0', '1.10.0'), false);

    // Large BigInt / Prerelease SemVer comparison test
    assert.strictEqual(isNewerVersion('1.0.0-9007199254740993', '1.0.0-9007199254740992'), true);
    assert.strictEqual(isNewerVersion('1.0.0-9007199254740992', '1.0.0-9007199254740993'), false);

    // Prerelease vs Normal
    assert.strictEqual(isNewerVersion('1.0.0', '1.0.0-alpha'), true);
    assert.strictEqual(isNewerVersion('1.0.0-alpha', '1.0.0'), false);

    // Prerelease numeric vs non-numeric
    assert.strictEqual(isNewerVersion('1.0.0-alpha', '1.0.0-1'), true);

    // Build metadata is valid but does not affect precedence.
    assert.strictEqual(isNewerVersion('1.2.3+build.1', '1.2.2'), true);
    assert.strictEqual(isNewerVersion('1.2.3+build.1', '1.2.3+build.2'), false);

    // Invalid SemVer identifiers are rejected instead of being coerced to zero.
    assert.strictEqual(isNewerVersion('1.2', '1.1.0'), false);
    assert.strictEqual(isNewerVersion('01.2.3', '1.2.2'), false);
    assert.strictEqual(isNewerVersion('1.2.3-01', '1.2.3-1'), false);
    assert.strictEqual(isNewerVersion('1.2.3+build_1', '1.2.2'), false);
  });

  test('fetchLatestReleaseTag rejects when response size exceeds limit', async () => {
    const mockGet = ((
      options: https.RequestOptions | string | URL,
      callback?: (res: EventEmitter & { statusCode?: number }) => void
    ) => {
      const req = new EventEmitter() as EventEmitter & { destroy: (err?: Error) => void };
      req.destroy = (err?: Error) => {
        req.emit('error', err || new Error('Request destroyed'));
      };

      process.nextTick(() => {
        const res = new EventEmitter() as EventEmitter & { statusCode: number };
        res.statusCode = 200;
        if (callback) {
          callback(res);
        }
        // Emit chunk larger than 100KB MAX_RESPONSE_SIZE
        const oversizedChunk = Buffer.alloc(105 * 1024, 'a');
        res.emit('data', oversizedChunk);
        res.emit('end');
      });

      return req;
    }) as typeof https.get;

    await assert.rejects(
      async () => {
        await fetchLatestReleaseTag(mockGet);
      },
      (err: Error) => {
        return err.message.includes('Response size limit exceeded') || err.message.includes('Request destroyed');
      }
    );
  });
});
