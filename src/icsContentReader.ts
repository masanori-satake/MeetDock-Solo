import * as fs from 'fs';

export const MAX_ICS_CONTENT_SIZE = 1000000;

export class IcsContentTooLargeError extends Error {
  constructor() {
    super(`ICS content exceeds the ${MAX_ICS_CONTENT_SIZE}-byte limit`);
    this.name = 'IcsContentTooLargeError';
  }
}

/**
 * Decodes an in-memory file payload only after enforcing the byte limit.
 */
export function decodeIcsBytes(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_ICS_CONTENT_SIZE) {
    throw new IcsContentTooLargeError();
  }
  return Buffer.from(bytes).toString('utf-8');
}

/**
 * Reads an ICS file through a bounded stream so an oversized file is never
 * accumulated in memory or decoded as text.
 */
export function readIcsFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });

    stream.on('data', (chunk: string | Buffer) => {
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_ICS_CONTENT_SIZE) {
        stream.destroy(new IcsContentTooLargeError());
        return;
      }
      chunks.push(bytes);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks, totalBytes).toString('utf-8')));
  });
}
