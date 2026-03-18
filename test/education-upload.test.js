import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase before importing the tool
vi.mock('../src/utils/supabase.js', () => ({
  isConfigured: vi.fn(),
  query: vi.fn(),
  insert: vi.fn(),
  uploadFile: vi.fn(),
}));

import { definition, execute } from '../src/tools/education-upload.js';
import * as supabase from '../src/utils/supabase.js';

const MOCK_CHILD = { id: 'child-uuid-1', name: 'Ryker' };

const MOCK_IMAGE = {
  media_type: 'image/jpeg',
  base64: Buffer.from('fake-image-data').toString('base64'),
};

const MOCK_ENVELOPE_SIGNAL = {
  person: 'Lee',
  person_id: 'lee',
  permissions: ['education'],
  images: [MOCK_IMAGE],
  message: 'Upload this as Ryker\'s Q2 report card',
  source_channel: 'signal',
};

const MOCK_ENVELOPE_EMAIL = {
  person: 'Lee',
  person_id: 'lee',
  permissions: ['education'],
  images: [],
  message: `Please upload this assessment result.

---------- Forwarded message ---------
From: teacher@school.edu <teacher@school.edu>
Subject: DIBELS Assessment Results - Ryker
Date: Mon, 10 Mar 2026

Dear Parent,

Ryker's DIBELS reading fluency score for Q2 is 85 words per minute, which is on grade level.`,
  source_channel: 'signal',
};

// ---------------------------------------------------------------------------
// Definition tests
// ---------------------------------------------------------------------------

describe('education_upload tool definition', () => {
  it('has correct name', () => {
    expect(definition.name).toBe('education_upload');
  });

  it('has a description', () => {
    expect(typeof definition.description).toBe('string');
    expect(definition.description.length).toBeGreaterThan(0);
  });

  it('requires child_name and description', () => {
    expect(definition.input_schema.required).toContain('child_name');
    expect(definition.input_schema.required).toContain('description');
  });

  it('has optional category, doc_type, doc_date properties', () => {
    expect(definition.input_schema.properties.category).toBeDefined();
    expect(definition.input_schema.properties.doc_type).toBeDefined();
    expect(definition.input_schema.properties.doc_date).toBeDefined();
  });

  it('category enum contains expected values', () => {
    const enumVals = definition.input_schema.properties.category.enum;
    expect(enumVals).toContain('performance_profile');
    expect(enumVals).toContain('constitution_culture');
    expect(enumVals).toContain('academic_architecture');
  });
});

// ---------------------------------------------------------------------------
// Execute tests
// ---------------------------------------------------------------------------

describe('education_upload execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when supabase is not configured', async () => {
    supabase.isConfigured.mockReturnValue(false);
    const result = await execute({ child_name: 'Ryker', description: 'Q2 report card' }, MOCK_ENVELOPE_SIGNAL);
    expect(result.error).toMatch(/not configured/i);
  });

  it('returns error when child not found', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockResolvedValue([]);
    const result = await execute({ child_name: 'Ghost', description: 'Q2 report card' }, MOCK_ENVELOPE_SIGNAL);
    expect(result.error).toMatch(/No child found/i);
    expect(result.error).toContain('Ghost');
  });

  it('returns error when no image and no forwarded email', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockResolvedValue([MOCK_CHILD]);
    const envelope = { ...MOCK_ENVELOPE_SIGNAL, images: [], message: 'Upload this document' };
    const result = await execute({ child_name: 'Ryker', description: 'Q2 report card' }, envelope);
    expect(result.error).toMatch(/no image or forwarded email/i);
  });

  it('uploads Signal image and inserts document row', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockResolvedValue([MOCK_CHILD]);
    supabase.uploadFile.mockResolvedValue('https://supabase.co/storage/v1/object/public/education-documents/child-uuid-1/123-q2.jpg');
    supabase.insert.mockResolvedValue([{ id: 'doc-uuid-1', name: 'Q2 report card' }]);

    const result = await execute(
      { child_name: 'Ryker', description: 'Q2 report card' },
      MOCK_ENVELOPE_SIGNAL
    );

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.document.child).toBe('Ryker');
    expect(result.document.name).toBe('Q2 report card');
    expect(result.document.doc_type).toBe('report_card');
    expect(result.document.category).toBe('performance_profile');
    expect(result.document.source).toBe('signal_image');
    expect(result.document.has_file).toBe(true);
    expect(supabase.uploadFile).toHaveBeenCalledOnce();
    expect(supabase.insert).toHaveBeenCalledOnce();
  });

  it('infers doc_type and category from description', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockResolvedValue([MOCK_CHILD]);
    supabase.uploadFile.mockResolvedValue('https://example.com/file.jpg');
    supabase.insert.mockResolvedValue([{ id: 'doc-uuid-2' }]);

    // IEP description
    const result = await execute(
      { child_name: 'Ryker', description: 'Updated IEP 2025' },
      MOCK_ENVELOPE_SIGNAL
    );
    expect(result.document.doc_type).toBe('iep');
    expect(result.document.category).toBe('constitution_culture');
  });

  it('respects explicit doc_type and category from input', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockResolvedValue([MOCK_CHILD]);
    supabase.uploadFile.mockResolvedValue('https://example.com/file.jpg');
    supabase.insert.mockResolvedValue([{ id: 'doc-uuid-3' }]);

    const result = await execute(
      {
        child_name: 'Ryker',
        description: 'School document',
        doc_type: 'neuropsych',
        category: 'academic_architecture',
        doc_date: '2026-01-15',
      },
      MOCK_ENVELOPE_SIGNAL
    );
    expect(result.document.doc_type).toBe('neuropsych');
    expect(result.document.category).toBe('academic_architecture');
    expect(result.document.date).toBe('2026-01-15');
  });

  it('extracts document from forwarded email body', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockResolvedValue([MOCK_CHILD]);
    supabase.insert.mockResolvedValue([{ id: 'doc-uuid-4' }]);

    const result = await execute(
      { child_name: 'Ryker', description: 'DIBELS assessment Q2 2026' },
      MOCK_ENVELOPE_EMAIL
    );

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.document.source).toBe('email');
    expect(result.document.has_file).toBe(false);
    // Storage upload should NOT have been called for email
    expect(supabase.uploadFile).not.toHaveBeenCalled();
    // Insert should have been called with the email content
    const insertCall = supabase.insert.mock.calls[0];
    expect(insertCall[1].content).toContain('Forwarded message');
  });

  it('continues without file URL when storage upload fails', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockResolvedValue([MOCK_CHILD]);
    supabase.uploadFile.mockRejectedValue(new Error('bucket does not exist'));
    supabase.insert.mockResolvedValue([{ id: 'doc-uuid-5' }]);

    const result = await execute(
      { child_name: 'Ryker', description: 'Q2 report card' },
      MOCK_ENVELOPE_SIGNAL
    );

    // Should succeed — storage failure is non-fatal
    expect(result.success).toBe(true);
    expect(result.document.has_file).toBe(false);
    expect(supabase.insert).toHaveBeenCalledOnce();
  });

  it('returns error when insert fails', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockResolvedValue([MOCK_CHILD]);
    supabase.uploadFile.mockResolvedValue('https://example.com/file.jpg');
    supabase.insert.mockRejectedValue(new Error('RLS policy violation'));

    const result = await execute(
      { child_name: 'Ryker', description: 'Q2 report card' },
      MOCK_ENVELOPE_SIGNAL
    );

    expect(result.error).toMatch(/Education upload failed/i);
    expect(result.error).toMatch(/RLS policy violation/);
  });

  it('inserts document row with correct child_id', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockResolvedValue([MOCK_CHILD]);
    supabase.uploadFile.mockResolvedValue('https://example.com/file.jpg');
    supabase.insert.mockResolvedValue([{ id: 'doc-uuid-6' }]);

    await execute(
      { child_name: 'Ryker', description: 'Q2 report card' },
      MOCK_ENVELOPE_SIGNAL
    );

    const insertCall = supabase.insert.mock.calls[0];
    expect(insertCall[0]).toBe('documents');
    expect(insertCall[1].child_id).toBe('child-uuid-1');
    expect(insertCall[1].name).toBe('Q2 report card');
  });
});
