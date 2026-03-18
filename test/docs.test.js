import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock google-oauth before importing the tool modules
vi.mock('../src/utils/google-oauth.js', () => ({
  hasToken: vi.fn(),
  getClient: vi.fn(),
}));

// Mock googleapis dynamic import
vi.mock('googleapis', () => {
  const mockFilesList = vi.fn();
  const mockFilesGet = vi.fn();
  const mockFilesExport = vi.fn();
  const mockDocumentsGet = vi.fn();

  return {
    google: {
      drive: vi.fn(() => ({
        files: {
          list: mockFilesList,
          get: mockFilesGet,
          export: mockFilesExport,
        },
      })),
      docs: vi.fn(() => ({
        documents: {
          get: mockDocumentsGet,
        },
      })),
    },
  };
});

import { definition as searchDef, execute as searchExecute } from '../src/tools/docs-search.js';
import { definition as readDef, execute as readExecute } from '../src/tools/docs-read.js';
import * as googleOAuth from '../src/utils/google-oauth.js';
import { google } from 'googleapis';

const mockEnvelope = { person_id: 'lee', person: 'lee', permissions: ['docs_read', 'docs_all'] };

describe('docs_search tool definition', () => {
  it('has correct name', () => {
    expect(searchDef.name).toBe('docs_search');
  });

  it('has a description', () => {
    expect(typeof searchDef.description).toBe('string');
    expect(searchDef.description.length).toBeGreaterThan(0);
  });

  it('has input_schema of type object', () => {
    expect(searchDef.input_schema.type).toBe('object');
  });

  it('has person and query properties', () => {
    expect(searchDef.input_schema.properties.person).toBeDefined();
    expect(searchDef.input_schema.properties.query).toBeDefined();
  });

  it('has max_results property', () => {
    expect(searchDef.input_schema.properties.max_results).toBeDefined();
    expect(searchDef.input_schema.properties.max_results.type).toBe('number');
  });
});

describe('docs_search execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when person cannot be resolved', async () => {
    const result = await searchExecute({}, { person_id: '', person: '', permissions: [] });
    expect(result.error).toMatch(/Could not identify/);
  });

  it('returns error when person has no Google token', async () => {
    googleOAuth.hasToken.mockReturnValue(false);
    const result = await searchExecute({ person: 'lee' }, mockEnvelope);
    expect(result.error).toMatch(/don't have access/i);
    expect(result.error).toMatch(/gmail-auth/i);
  });

  it('returns error on expired auth (invalid_grant)', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockRejectedValue(new Error('invalid_grant'));
    const result = await searchExecute({ person: 'lee' }, mockEnvelope);
    expect(result.error).toMatch(/expired/i);
    expect(result.error).toMatch(/gmail-auth/i);
  });

  it('returns empty results with message when no files found', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockResolvedValue({});
    const mockDrive = { files: { list: vi.fn().mockResolvedValue({ data: { files: [] } }) } };
    google.drive.mockReturnValue(mockDrive);

    const result = await searchExecute({ person: 'lee', query: 'nonexistent-doc-xyz' }, mockEnvelope);
    expect(result.results).toEqual([]);
    expect(result.message).toMatch(/No files found/i);
  });

  it('returns formatted results on success', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockResolvedValue({});
    const mockFiles = [
      { id: 'abc123', name: 'Budget 2026', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: '2026-01-01', webViewLink: 'https://docs.google.com/spreadsheets/d/abc123' },
      { id: 'def456', name: 'House Notes', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-02-01', webViewLink: 'https://docs.google.com/document/d/def456' },
    ];
    const mockDrive = { files: { list: vi.fn().mockResolvedValue({ data: { files: mockFiles } }) } };
    google.drive.mockReturnValue(mockDrive);

    const result = await searchExecute({ person: 'lee', query: "name contains 'Budget'" }, mockEnvelope);
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].id).toBe('abc123');
    expect(result.results[0].name).toBe('Budget 2026');
    expect(result.results[0].url).toBe('https://docs.google.com/spreadsheets/d/abc123');
    expect(result.message).toMatch(/Found 2/);
  });

  it('clamps max_results to 25 maximum', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockResolvedValue({});
    const mockList = vi.fn().mockResolvedValue({ data: { files: [] } });
    const mockDrive = { files: { list: mockList } };
    google.drive.mockReturnValue(mockDrive);

    await searchExecute({ person: 'lee', max_results: 100 }, mockEnvelope);
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 25 }));
  });

  it('uses default query for Docs+Sheets when no query provided', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockResolvedValue({});
    const mockList = vi.fn().mockResolvedValue({ data: { files: [] } });
    const mockDrive = { files: { list: mockList } };
    google.drive.mockReturnValue(mockDrive);

    await searchExecute({ person: 'lee' }, mockEnvelope);
    const callArgs = mockList.mock.calls[0][0];
    expect(callArgs.q).toMatch(/google-apps\.document/);
    expect(callArgs.q).toMatch(/google-apps\.spreadsheet/);
  });

  it('returns error on 403 (access denied)', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockResolvedValue({});
    const err = new Error('Access denied');
    err.code = 403;
    const mockDrive = { files: { list: vi.fn().mockRejectedValue(err) } };
    google.drive.mockReturnValue(mockDrive);

    const result = await searchExecute({ person: 'lee' }, mockEnvelope);
    expect(result.error).toMatch(/Drive access denied/i);
    expect(result.error).toMatch(/gmail-auth/i);
  });

  it('returns error on rate limiting (429)', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockResolvedValue({});
    const err = new Error('rate limit');
    err.code = 429;
    const mockDrive = { files: { list: vi.fn().mockRejectedValue(err) } };
    google.drive.mockReturnValue(mockDrive);

    const result = await searchExecute({ person: 'lee' }, mockEnvelope);
    expect(result.error).toMatch(/rate-limiting/i);
  });

  it('resolves person from envelope when person param omitted', async () => {
    googleOAuth.hasToken.mockReturnValue(false);
    const result = await searchExecute({}, mockEnvelope);
    // Should attempt to look up 'lee' from the envelope
    expect(googleOAuth.hasToken).toHaveBeenCalledWith('lee');
  });
});

describe('docs_read tool definition', () => {
  it('has correct name', () => {
    expect(readDef.name).toBe('docs_read');
  });

  it('has a description', () => {
    expect(typeof readDef.description).toBe('string');
    expect(readDef.description.length).toBeGreaterThan(0);
  });

  it('requires file_id param', () => {
    expect(readDef.input_schema.required).toContain('file_id');
  });

  it('has person and file_id properties', () => {
    expect(readDef.input_schema.properties.person).toBeDefined();
    expect(readDef.input_schema.properties.file_id).toBeDefined();
  });
});

describe('docs_read execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when person cannot be resolved', async () => {
    const result = await readExecute({ file_id: 'abc123' }, { person_id: '', person: '', permissions: [] });
    expect(result.error).toMatch(/Could not identify/);
  });

  it('returns error when file_id is missing', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    const result = await readExecute({ person: 'lee' }, mockEnvelope);
    expect(result.error).toMatch(/file_id is required/i);
  });

  it('returns error when file_id is not a valid ID or URL', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    const result = await readExecute({ person: 'lee', file_id: 'short' }, mockEnvelope);
    expect(result.error).toMatch(/file_id is required/i);
  });

  it('returns error when person has no Google token', async () => {
    googleOAuth.hasToken.mockReturnValue(false);
    const result = await readExecute({ person: 'lee', file_id: 'abc1234567890123456789012' }, mockEnvelope);
    expect(result.error).toMatch(/don't have access/i);
    expect(result.error).toMatch(/gmail-auth/i);
  });

  it('returns error on expired auth', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockRejectedValue(new Error('invalid_grant'));
    const result = await readExecute({ person: 'lee', file_id: 'abc1234567890123456789012' }, mockEnvelope);
    expect(result.error).toMatch(/expired/i);
  });

  it('returns error when file not found (404)', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockResolvedValue({});
    const err = new Error('File not found');
    err.code = 404;
    const mockDrive = { files: { get: vi.fn().mockRejectedValue(err) } };
    google.drive.mockReturnValue(mockDrive);

    const result = await readExecute({ person: 'lee', file_id: 'abc1234567890123456789012' }, mockEnvelope);
    expect(result.error).toMatch(/not found/i);
  });

  it('returns error when file access denied (403)', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockResolvedValue({});
    const err = new Error('Access denied');
    err.code = 403;
    const mockDrive = { files: { get: vi.fn().mockRejectedValue(err) } };
    google.drive.mockReturnValue(mockDrive);

    const result = await readExecute({ person: 'lee', file_id: 'abc1234567890123456789012' }, mockEnvelope);
    expect(result.error).toMatch(/Access denied/i);
    expect(result.error).toMatch(/gmail-auth/i);
  });

  it('returns error for unsupported MIME type', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockResolvedValue({});
    const mockDrive = {
      files: {
        get: vi.fn().mockResolvedValue({
          data: { id: 'abc123', name: 'image.png', mimeType: 'image/png', modifiedTime: '2026-01-01', webViewLink: 'https://drive.google.com/file/d/abc123' },
        }),
      },
    };
    google.drive.mockReturnValue(mockDrive);

    const result = await readExecute({ person: 'lee', file_id: 'abc1234567890123456789012' }, mockEnvelope);
    expect(result.error).toMatch(/Unsupported file type/i);
    expect(result.error).toMatch(/image\/png/);
  });

  it('reads Google Doc content via Docs API', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockResolvedValue({});
    const mockDrive = {
      files: {
        get: vi.fn().mockResolvedValue({
          data: {
            id: 'docid123456789012345678',
            name: 'My Document',
            mimeType: 'application/vnd.google-apps.document',
            modifiedTime: '2026-03-01',
            webViewLink: 'https://docs.google.com/document/d/docid123456789012345678',
          },
        }),
      },
    };
    const mockDocs = {
      documents: {
        get: vi.fn().mockResolvedValue({
          data: {
            body: {
              content: [
                {
                  paragraph: {
                    elements: [
                      { textRun: { content: 'Hello, world!\n' } },
                    ],
                  },
                },
                {
                  paragraph: {
                    elements: [
                      { textRun: { content: 'Second paragraph.\n' } },
                    ],
                  },
                },
              ],
            },
          },
        }),
      },
    };
    google.drive.mockReturnValue(mockDrive);
    google.docs.mockReturnValue(mockDocs);

    const result = await readExecute({ person: 'lee', file_id: 'docid123456789012345678' }, mockEnvelope);
    expect(result.error).toBeUndefined();
    expect(result.name).toBe('My Document');
    expect(result.content).toContain('Hello, world!');
    expect(result.content).toContain('Second paragraph.');
    expect(result.truncated).toBe(false);
    expect(result.url).toBe('https://docs.google.com/document/d/docid123456789012345678');
  });

  it('reads Google Sheet content as CSV', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockResolvedValue({});
    const csvData = 'Name,Amount\nGroceries,50.00\nUtilities,120.00';
    const mockDrive = {
      files: {
        get: vi.fn().mockResolvedValue({
          data: {
            id: 'sheetid12345678901234567',
            name: 'Budget',
            mimeType: 'application/vnd.google-apps.spreadsheet',
            modifiedTime: '2026-03-01',
            webViewLink: 'https://docs.google.com/spreadsheets/d/sheetid12345678901234567',
          },
        }),
        export: vi.fn().mockResolvedValue({ data: csvData }),
      },
    };
    google.drive.mockReturnValue(mockDrive);

    const result = await readExecute({ person: 'lee', file_id: 'sheetid12345678901234567' }, mockEnvelope);
    expect(result.error).toBeUndefined();
    expect(result.name).toBe('Budget');
    expect(result.content).toBe(csvData);
    expect(result.truncated).toBe(false);
  });

  it('truncates content exceeding 8000 chars', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockResolvedValue({});
    const longContent = 'A'.repeat(10000);
    const mockDrive = {
      files: {
        get: vi.fn().mockResolvedValue({
          data: {
            id: 'sheetid12345678901234567',
            name: 'Big Sheet',
            mimeType: 'application/vnd.google-apps.spreadsheet',
            modifiedTime: '2026-03-01',
            webViewLink: 'https://docs.google.com/spreadsheets/d/sheetid12345678901234567',
          },
        }),
        export: vi.fn().mockResolvedValue({ data: longContent }),
      },
    };
    google.drive.mockReturnValue(mockDrive);

    const result = await readExecute({ person: 'lee', file_id: 'sheetid12345678901234567' }, mockEnvelope);
    expect(result.truncated).toBe(true);
    expect(result.content).toMatch(/Content truncated/);
    expect(result.content.length).toBeLessThan(10000);
  });

  it('parses file ID from Google Docs URL', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockResolvedValue({});
    const mockDrive = {
      files: {
        get: vi.fn().mockResolvedValue({
          data: {
            id: 'extractedFileId1234567890',
            name: 'Doc from URL',
            mimeType: 'application/vnd.google-apps.document',
            modifiedTime: '2026-03-01',
            webViewLink: 'https://docs.google.com/document/d/extractedFileId1234567890/edit',
          },
        }),
      },
    };
    const mockDocs = {
      documents: {
        get: vi.fn().mockResolvedValue({
          data: {
            body: {
              content: [
                { paragraph: { elements: [{ textRun: { content: 'Content\n' } }] } },
              ],
            },
          },
        }),
      },
    };
    google.drive.mockReturnValue(mockDrive);
    google.docs.mockReturnValue(mockDocs);

    const result = await readExecute(
      { person: 'lee', file_id: 'https://docs.google.com/document/d/extractedFileId1234567890/edit' },
      mockEnvelope
    );
    expect(result.error).toBeUndefined();
    // Should have extracted the ID from the URL and passed it to drive.files.get
    expect(mockDrive.files.get).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'extractedFileId1234567890' })
    );
  });

  it('extracts text from nested table cells in Google Doc', async () => {
    googleOAuth.hasToken.mockReturnValue(true);
    googleOAuth.getClient.mockResolvedValue({});
    const mockDrive = {
      files: {
        get: vi.fn().mockResolvedValue({
          data: {
            id: 'docid123456789012345678',
            name: 'Table Doc',
            mimeType: 'application/vnd.google-apps.document',
            modifiedTime: '2026-03-01',
            webViewLink: 'https://docs.google.com/document/d/docid123456789012345678',
          },
        }),
      },
    };
    const mockDocs = {
      documents: {
        get: vi.fn().mockResolvedValue({
          data: {
            body: {
              content: [
                {
                  table: {
                    tableRows: [
                      {
                        tableCells: [
                          {
                            content: [
                              { paragraph: { elements: [{ textRun: { content: 'Cell A1' } }] } },
                            ],
                          },
                          {
                            content: [
                              { paragraph: { elements: [{ textRun: { content: 'Cell B1' } }] } },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          },
        }),
      },
    };
    google.drive.mockReturnValue(mockDrive);
    google.docs.mockReturnValue(mockDocs);

    const result = await readExecute({ person: 'lee', file_id: 'docid123456789012345678' }, mockEnvelope);
    expect(result.error).toBeUndefined();
    expect(result.content).toContain('Cell A1');
    expect(result.content).toContain('Cell B1');
  });
});
