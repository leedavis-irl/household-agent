import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock supabase before importing the tool modules
vi.mock('../src/utils/supabase.js', () => ({
  isConfigured: vi.fn(),
  query: vi.fn(),
}));

import { definition as profileDef, execute as profileExecute } from '../src/tools/education-profile.js';
import { definition as documentsDef, execute as documentsExecute } from '../src/tools/education-documents.js';
import { definition as goalsDef, execute as goalsExecute } from '../src/tools/education-goals.js';
import { definition as teamDef, execute as teamExecute } from '../src/tools/education-team.js';
import * as supabase from '../src/utils/supabase.js';

// ---------------------------------------------------------------------------
// education_profile
// ---------------------------------------------------------------------------

describe('education_profile tool definition', () => {
  it('has correct name', () => {
    expect(profileDef.name).toBe('education_profile');
  });

  it('has a description', () => {
    expect(typeof profileDef.description).toBe('string');
    expect(profileDef.description.length).toBeGreaterThan(0);
  });

  it('requires child_name param', () => {
    expect(profileDef.input_schema.required).toContain('child_name');
  });
});

describe('education_profile execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when supabase is not configured', async () => {
    supabase.isConfigured.mockReturnValue(false);
    const result = await profileExecute({ child_name: 'Ryker' });
    expect(result.error).toMatch(/not configured/i);
  });

  it('returns error when child not found', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockResolvedValue([]);
    const result = await profileExecute({ child_name: 'UnknownChild' });
    expect(result.error).toMatch(/No child found/i);
    expect(result.error).toContain('UnknownChild');
  });

  it('returns profile data for a known child', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockResolvedValue([
      {
        name: 'Ryker',
        grade_level: '5th',
        diagnoses: ['ADHD'],
        profile_context: {
          holistic: { strengths: ['Creative', 'Curious'], interests: ['Minecraft', 'Drawing'] },
          clinical: { diagnoses: ['ADHD'], executive_function: ['Working memory challenges'] },
          support: { accommodations: ['Extended time'], legal_framework: '504 Plan', school_type: 'Public' },
          psychometrics: { scores: { reading: 85, math: 90 } },
          narrative: { headline: 'Creative thinker with ADHD' },
        },
        learner_profile: {
          summary: 'Strong visual learner',
          strengths: ['Art', 'Storytelling'],
          challenges: ['Sustained focus'],
          interests: ['Gaming', 'Building'],
        },
      },
    ]);
    const result = await profileExecute({ child_name: 'Ryker' });
    expect(result.error).toBeUndefined();
    expect(result.name).toBe('Ryker');
    expect(result.grade_level).toBe('5th');
    expect(result.learner_summary).toBe('Strong visual learner');
    expect(result.strengths).toContain('Art');
    expect(result.challenges).toContain('Sustained focus');
    expect(result.diagnoses).toContain('ADHD');
    expect(result.accommodations).toContain('Extended time');
    expect(result.legal_framework).toBe('504 Plan');
  });

  it('returns error on supabase query failure', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockRejectedValue(new Error('Connection refused'));
    const result = await profileExecute({ child_name: 'Ryker' });
    expect(result.error).toMatch(/Education profile lookup failed/i);
    expect(result.error).toMatch(/Connection refused/);
  });
});

// ---------------------------------------------------------------------------
// education_documents
// ---------------------------------------------------------------------------

describe('education_documents tool definition', () => {
  it('has correct name', () => {
    expect(documentsDef.name).toBe('education_documents');
  });

  it('has a description', () => {
    expect(typeof documentsDef.description).toBe('string');
    expect(documentsDef.description.length).toBeGreaterThan(0);
  });

  it('has child_name, search, and category properties', () => {
    expect(documentsDef.input_schema.properties.child_name).toBeDefined();
    expect(documentsDef.input_schema.properties.search).toBeDefined();
    expect(documentsDef.input_schema.properties.category).toBeDefined();
  });
});

describe('education_documents execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when supabase is not configured', async () => {
    supabase.isConfigured.mockReturnValue(false);
    const result = await documentsExecute({});
    expect(result.error).toMatch(/not configured/i);
  });

  it('returns error when child_name not found', async () => {
    supabase.isConfigured.mockReturnValue(true);
    // First query is for children lookup
    supabase.query.mockResolvedValueOnce([]);
    const result = await documentsExecute({ child_name: 'Ghost' });
    expect(result.error).toMatch(/No child found/i);
    expect(result.error).toContain('Ghost');
  });

  it('returns documents without child filter', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockResolvedValue([
      {
        id: 'doc1',
        name: 'DIBELS Report 2025',
        category: 'performance_profile',
        doc_type: 'assessment',
        extracted_date: '2025-10-01',
        tags: ['DIBELS', 'reading'],
        subjects: ['Reading'],
        content: 'Student showed improvement in fluency.',
        child_id: 'child1',
        school_id: null,
      },
    ]);
    const result = await documentsExecute({ search: 'DIBELS' });
    expect(result.error).toBeUndefined();
    expect(result.total).toBe(1);
    expect(result.documents[0].name).toBe('DIBELS Report 2025');
    expect(result.documents[0].content_preview).toContain('Student showed improvement');
  });

  it('returns documents for a specific child', async () => {
    supabase.isConfigured.mockReturnValue(true);
    // First call: children lookup
    supabase.query.mockResolvedValueOnce([{ id: 'child1', name: 'Ryker' }]);
    // Second call: documents query
    supabase.query.mockResolvedValueOnce([
      {
        id: 'doc2',
        name: 'IEP 2024',
        category: 'constitution_culture',
        doc_type: 'iep',
        extracted_date: '2024-09-01',
        tags: ['IEP'],
        subjects: [],
        content: 'IEP goals for the year.',
        child_id: 'child1',
        school_id: null,
      },
    ]);
    const result = await documentsExecute({ child_name: 'Ryker' });
    expect(result.error).toBeUndefined();
    expect(result.total).toBe(1);
    expect(result.documents[0].name).toBe('IEP 2024');
  });

  it('truncates content_preview to 500 chars', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockResolvedValue([
      {
        id: 'doc3',
        name: 'Long Document',
        category: 'other',
        doc_type: 'notes',
        extracted_date: '2025-01-01',
        tags: [],
        subjects: [],
        content: 'A'.repeat(600),
        child_id: null,
        school_id: null,
      },
    ]);
    const result = await documentsExecute({});
    expect(result.documents[0].content_preview).toMatch(/\.\.\.$/);
    expect(result.documents[0].content_preview.length).toBeLessThanOrEqual(503); // 500 + '...'
  });

  it('returns error on supabase query failure', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockRejectedValue(new Error('Timeout'));
    const result = await documentsExecute({});
    expect(result.error).toMatch(/Education document search failed/i);
    expect(result.error).toMatch(/Timeout/);
  });
});

// ---------------------------------------------------------------------------
// education_goals
// ---------------------------------------------------------------------------

describe('education_goals tool definition', () => {
  it('has correct name', () => {
    expect(goalsDef.name).toBe('education_goals');
  });

  it('has a description', () => {
    expect(typeof goalsDef.description).toBe('string');
    expect(goalsDef.description.length).toBeGreaterThan(0);
  });

  it('requires child_name param', () => {
    expect(goalsDef.input_schema.required).toContain('child_name');
  });

  it('has type enum property', () => {
    expect(goalsDef.input_schema.properties.type).toBeDefined();
    expect(goalsDef.input_schema.properties.type.enum).toContain('North Star');
    expect(goalsDef.input_schema.properties.type.enum).toContain('Objective');
    expect(goalsDef.input_schema.properties.type.enum).toContain('Tactic');
  });
});

describe('education_goals execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when supabase is not configured', async () => {
    supabase.isConfigured.mockReturnValue(false);
    const result = await goalsExecute({ child_name: 'Ryker' });
    expect(result.error).toMatch(/not configured/i);
  });

  it('returns error when child not found', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockResolvedValueOnce([]);
    const result = await goalsExecute({ child_name: 'Unknown' });
    expect(result.error).toMatch(/No child found/i);
  });

  it('returns goals grouped by type', async () => {
    supabase.isConfigured.mockReturnValue(true);
    // children lookup
    supabase.query.mockResolvedValueOnce([{ id: 'child1', name: 'Ryker' }]);
    // goals query
    supabase.query.mockResolvedValueOnce([
      {
        id: 'goal1',
        type: 'North Star',
        description: 'Become a confident, self-directed learner',
        status: 'active',
        execution_status: 'in_progress',
        progress: 40,
        target_date: '2026-06-01',
        assigned_to: ['member1'],
        parent_id: null,
      },
      {
        id: 'goal2',
        type: 'Objective',
        description: 'Improve reading fluency to grade level',
        status: 'active',
        execution_status: 'in_progress',
        progress: 60,
        target_date: '2026-03-01',
        assigned_to: [],
        parent_id: 'goal1',
      },
    ]);
    // team members lookup (for assigned_to)
    supabase.query.mockResolvedValueOnce([{ id: 'member1', name: 'Ms. Smith', role: 'Teacher' }]);

    const result = await goalsExecute({ child_name: 'Ryker' });
    expect(result.error).toBeUndefined();
    expect(result.child).toBe('Ryker');
    expect(result.north_star).toHaveLength(1);
    expect(result.north_star[0].description).toContain('self-directed learner');
    expect(result.north_star[0].progress).toBe('40%');
    expect(result.north_star[0].assigned_to).toContain('Ms. Smith (Teacher)');
    expect(result.objectives).toHaveLength(1);
    expect(result.tactics).toHaveLength(0);
    expect(result.total).toBe(2);
  });

  it('returns error on supabase query failure', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockRejectedValue(new Error('DB error'));
    const result = await goalsExecute({ child_name: 'Ryker' });
    expect(result.error).toMatch(/Education goals query failed/i);
    expect(result.error).toMatch(/DB error/);
  });
});

// ---------------------------------------------------------------------------
// education_team
// ---------------------------------------------------------------------------

describe('education_team tool definition', () => {
  it('has correct name', () => {
    expect(teamDef.name).toBe('education_team');
  });

  it('has a description', () => {
    expect(typeof teamDef.description).toBe('string');
    expect(teamDef.description.length).toBeGreaterThan(0);
  });

  it('has child_name and role properties', () => {
    expect(teamDef.input_schema.properties.child_name).toBeDefined();
    expect(teamDef.input_schema.properties.role).toBeDefined();
  });
});

describe('education_team execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when supabase is not configured', async () => {
    supabase.isConfigured.mockReturnValue(false);
    const result = await teamExecute({});
    expect(result.error).toMatch(/not configured/i);
  });

  it('returns all team members when no filter given', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockResolvedValue([
      { id: 'm1', name: 'Ms. Smith', role: 'Teacher', organization: 'Lincoln Elementary', email: 'smith@lincoln.edu', phone: null, status: 'active' },
      { id: 'm2', name: 'Dr. Jones', role: 'Psychologist', organization: 'Clinic', email: 'jones@clinic.com', phone: '510-555-1234', status: 'active' },
    ]);
    const result = await teamExecute({});
    expect(result.error).toBeUndefined();
    expect(result.total).toBe(2);
    expect(result.team_members[0].name).toBe('Ms. Smith');
    expect(result.team_members[1].name).toBe('Dr. Jones');
  });

  it('filters team members by child when child_name provided', async () => {
    supabase.isConfigured.mockReturnValue(true);
    // team_members query
    supabase.query.mockResolvedValueOnce([
      { id: 'm1', name: 'Ms. Smith', role: 'Teacher', organization: 'Lincoln', email: null, phone: null, status: 'active' },
      { id: 'm2', name: 'Dr. Jones', role: 'Psychologist', organization: 'Clinic', email: null, phone: null, status: 'active' },
    ]);
    // children lookup
    supabase.query.mockResolvedValueOnce([{ id: 'child1', name: 'Ryker' }]);
    // goals lookup (assigned_to)
    supabase.query.mockResolvedValueOnce([{ assigned_to: ['m1'] }]);
    // profile_context lookup
    supabase.query.mockResolvedValueOnce([{ profile_context: { support: { team: [] } } }]);

    const result = await teamExecute({ child_name: 'Ryker' });
    expect(result.error).toBeUndefined();
    // Only m1 (Ms. Smith) is assigned to Ryker's goals
    expect(result.total).toBe(1);
    expect(result.team_members[0].name).toBe('Ms. Smith');
  });

  it('returns error on supabase query failure', async () => {
    supabase.isConfigured.mockReturnValue(true);
    supabase.query.mockRejectedValue(new Error('Network failure'));
    const result = await teamExecute({});
    expect(result.error).toMatch(/Education team lookup failed/i);
    expect(result.error).toMatch(/Network failure/);
  });
});
