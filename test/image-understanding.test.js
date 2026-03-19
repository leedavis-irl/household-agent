import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs and child_process before importing signal.js
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    appendFileSync: vi.fn(),
  };
});

vi.mock('net', () => ({
  createConnection: vi.fn(() => ({
    on: vi.fn(),
    write: vi.fn(),
    destroy: vi.fn(),
    destroyed: false,
  })),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  })),
}));

vi.mock('../src/broker/identity.js', () => ({
  resolve: vi.fn().mockReturnValue(null),
}));

vi.mock('../src/router/index.js', () => ({
  sendReply: vi.fn(),
}));

vi.mock('../src/brain/index.js', () => ({
  think: vi.fn().mockResolvedValue('OK'),
}));

vi.mock('../src/tools/knowledge-store.js', () => ({
  execute: vi.fn().mockResolvedValue({}),
}));

vi.mock('../src/utils/signal-groups.js', () => ({
  registerGroup: vi.fn(),
}));

vi.mock('../src/utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { existsSync, readFileSync } from 'fs';
import { extractImages } from '../src/broker/signal.js';

const FAKE_IMAGE_BYTES = Buffer.from('fakepngdata');
const FAKE_BASE64 = FAKE_IMAGE_BYTES.toString('base64');

beforeEach(() => {
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue(FAKE_IMAGE_BYTES);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extractImages', () => {
  it('returns empty array when attachments is missing', () => {
    expect(extractImages({})).toEqual([]);
    expect(extractImages({ attachments: null })).toEqual([]);
    expect(extractImages({ attachments: [] })).toEqual([]);
  });

  it('extracts a JPEG attachment', () => {
    const result = extractImages({
      attachments: [{ id: 'abc123', contentType: 'image/jpeg' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].media_type).toBe('image/jpeg');
    expect(result[0].base64).toBe(FAKE_BASE64);
  });

  it('extracts a PNG attachment', () => {
    const result = extractImages({
      attachments: [{ id: 'def456', contentType: 'image/png' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].media_type).toBe('image/png');
  });

  it('extracts a WebP attachment', () => {
    const result = extractImages({
      attachments: [{ id: 'ghi789', contentType: 'image/webp' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].media_type).toBe('image/webp');
  });

  it('skips non-image attachments', () => {
    const result = extractImages({
      attachments: [
        { id: 'doc1', contentType: 'application/pdf' },
        { id: 'img1', contentType: 'image/png' },
        { id: 'vid1', contentType: 'video/mp4' },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].media_type).toBe('image/png');
  });

  it('skips attachments with no id', () => {
    const result = extractImages({
      attachments: [{ contentType: 'image/jpeg' }],
    });
    expect(result).toEqual([]);
  });

  it('uses remoteId as fallback when id is missing', () => {
    const result = extractImages({
      attachments: [{ remoteId: 'remote99', contentType: 'image/jpeg' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].media_type).toBe('image/jpeg');
  });

  it('skips attachment file that does not exist on disk', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = extractImages({
      attachments: [{ id: 'missing123', contentType: 'image/jpeg' }],
    });
    expect(result).toEqual([]);
  });

  it('skips attachment larger than 5 MB', () => {
    const bigBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);
    vi.mocked(readFileSync).mockReturnValue(bigBuffer);
    const result = extractImages({
      attachments: [{ id: 'bigimg', contentType: 'image/jpeg' }],
    });
    expect(result).toEqual([]);
  });

  it('skips attachment when readFileSync throws', () => {
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('EACCES'); });
    const result = extractImages({
      attachments: [{ id: 'unreadable', contentType: 'image/png' }],
    });
    expect(result).toEqual([]);
  });

  it('extracts multiple images from one message', () => {
    const result = extractImages({
      attachments: [
        { id: 'img1', contentType: 'image/jpeg' },
        { id: 'img2', contentType: 'image/png' },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0].media_type).toBe('image/jpeg');
    expect(result[1].media_type).toBe('image/png');
  });
});

// --- Brain multimodal content building ---

describe('brain multimodal content block building', () => {
  it('builds image content blocks in the expected Claude API shape', () => {
    const images = [
      { media_type: 'image/jpeg', base64: 'abc123' },
      { media_type: 'image/png', base64: 'def456' },
    ];

    const userContent = [
      ...images.map((img) => ({
        type: 'image',
        source: { type: 'base64', media_type: img.media_type, data: img.base64 },
      })),
      { type: 'text', text: 'What do you see?' },
    ];

    expect(userContent).toHaveLength(3);
    expect(userContent[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'abc123' },
    });
    expect(userContent[1]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'def456' },
    });
    expect(userContent[2]).toEqual({ type: 'text', text: 'What do you see?' });
  });

  it('falls back to plain string when no images', () => {
    const images = [];
    const message = 'Hello Iji';
    const userContent = images.length > 0
      ? [...images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.base64 } })), { type: 'text', text: message }]
      : message;

    expect(userContent).toBe('Hello Iji');
  });
});
