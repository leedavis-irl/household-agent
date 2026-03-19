import { describe, it, expect } from 'vitest';
import { definition, execute } from '../src/tools/generate-document.js';

const mockEnvelope = { person_id: 'lee', person: 'Lee', permissions: ['knowledge_read'] };

describe('generate_document tool definition', () => {
  it('has correct name', () => {
    expect(definition.name).toBe('generate_document');
  });

  it('has a description', () => {
    expect(typeof definition.description).toBe('string');
    expect(definition.description.length).toBeGreaterThan(0);
  });

  it('has input_schema of type object', () => {
    expect(definition.input_schema.type).toBe('object');
  });

  it('requires document_type and title', () => {
    expect(definition.input_schema.required).toContain('document_type');
    expect(definition.input_schema.required).toContain('title');
  });

  it('document_type has enum values', () => {
    const prop = definition.input_schema.properties.document_type;
    expect(Array.isArray(prop.enum)).toBe(true);
    expect(prop.enum).toContain('packing_list');
    expect(prop.enum).toContain('event_prep');
    expect(prop.enum).toContain('summary_report');
    expect(prop.enum).toContain('custom');
  });

  it('has optional sections, context, and notes properties', () => {
    const props = definition.input_schema.properties;
    expect(props.sections).toBeDefined();
    expect(props.context).toBeDefined();
    expect(props.notes).toBeDefined();
  });
});

describe('generate_document execute — packing_list', () => {
  it('returns a document with correct title', async () => {
    const result = await execute(
      { document_type: 'packing_list', title: 'Tahoe Trip Packing List' },
      mockEnvelope
    );
    expect(result.error).toBeUndefined();
    expect(result.document).toContain('# Tahoe Trip Packing List');
    expect(result.document_type).toBe('packing_list');
    expect(result.title).toBe('Tahoe Trip Packing List');
  });

  it('includes context when provided', async () => {
    const result = await execute(
      {
        document_type: 'packing_list',
        title: 'Weekend Trip',
        context: 'Trip is 3 nights. Ryker needs swim gear.',
      },
      mockEnvelope
    );
    expect(result.document).toContain('Trip is 3 nights');
    expect(result.document).toContain('Ryker needs swim gear');
  });

  it('renders structured sections as checkboxes', async () => {
    const result = await execute(
      {
        document_type: 'packing_list',
        title: 'Beach Trip',
        sections: [
          { heading: 'Clothing', items: ['Swimsuit', 'Cover-up', 'Sandals'] },
          { heading: 'Gear', items: ['Sunscreen', 'Towel'] },
        ],
      },
      mockEnvelope
    );
    expect(result.document).toContain('### Clothing');
    expect(result.document).toContain('- [ ] Swimsuit');
    expect(result.document).toContain('- [ ] Cover-up');
    expect(result.document).toContain('### Gear');
    expect(result.document).toContain('- [ ] Sunscreen');
  });

  it('includes default section headers when no sections provided', async () => {
    const result = await execute(
      { document_type: 'packing_list', title: 'Quick Trip' },
      mockEnvelope
    );
    expect(result.document).toContain('### Clothing & Footwear');
    expect(result.document).toContain('### Toiletries & Personal Care');
  });

  it('appends notes when provided', async () => {
    const result = await execute(
      {
        document_type: 'packing_list',
        title: 'Trip',
        notes: 'Check weather before packing.',
      },
      mockEnvelope
    );
    expect(result.document).toContain('Check weather before packing.');
  });
});

describe('generate_document execute — event_prep', () => {
  it('returns a document for event_prep type', async () => {
    const result = await execute(
      {
        document_type: 'event_prep',
        title: "Ryker's Birthday Party Prep",
        context: 'Party is on Saturday, 15 kids attending.',
      },
      mockEnvelope
    );
    expect(result.error).toBeUndefined();
    expect(result.document).toContain("# Ryker's Birthday Party Prep");
    expect(result.document).toContain('15 kids attending');
    expect(result.document_type).toBe('event_prep');
  });

  it('includes default checklist phases when no sections provided', async () => {
    const result = await execute(
      { document_type: 'event_prep', title: 'Dinner Party' },
      mockEnvelope
    );
    expect(result.document).toContain('### Before the Event');
    expect(result.document).toContain('### Day Of');
    expect(result.document).toContain('### After / Follow-up');
  });

  it('uses structured sections when provided', async () => {
    const result = await execute(
      {
        document_type: 'event_prep',
        title: 'House Party',
        sections: [
          { heading: 'Shopping', items: ['Balloons', 'Cake'] },
        ],
      },
      mockEnvelope
    );
    expect(result.document).toContain('### Shopping');
    expect(result.document).toContain('- [ ] Balloons');
    expect(result.document).toContain('- [ ] Cake');
  });
});

describe('generate_document execute — summary_report', () => {
  it('returns a formatted summary report', async () => {
    const result = await execute(
      {
        document_type: 'summary_report',
        title: "This Week's Calendar Summary",
        context: 'Lee has 4 meetings. Steve has a dentist appointment Wednesday.',
        sections: [
          { heading: 'Key Events', items: ['Monday standup', 'Wednesday dentist (Steve)', 'Friday school pickup'] },
        ],
      },
      mockEnvelope
    );
    expect(result.error).toBeUndefined();
    expect(result.document).toContain("# This Week's Calendar Summary");
    expect(result.document).toContain('Lee has 4 meetings');
    expect(result.document).toContain('### Key Events');
    expect(result.document).toContain('- [ ] Monday standup');
  });
});

describe('generate_document execute — custom', () => {
  it('returns a custom document with provided content', async () => {
    const result = await execute(
      {
        document_type: 'custom',
        title: 'House Rules',
        context: 'These are the rules for the household.',
        sections: [
          { heading: 'Kitchen', items: ['Clean up after yourself', 'Label your leftovers'] },
        ],
      },
      mockEnvelope
    );
    expect(result.error).toBeUndefined();
    expect(result.document).toContain('# House Rules');
    expect(result.document).toContain('These are the rules for the household');
    expect(result.document).toContain('### Kitchen');
    expect(result.document).toContain('- [ ] Label your leftovers');
  });
});

describe('generate_document execute — error handling', () => {
  it('returns error for unknown document_type', async () => {
    const result = await execute(
      { document_type: 'unknown_type', title: 'Test' },
      mockEnvelope
    );
    expect(result.error).toMatch(/Unknown document_type/);
  });

  it('includes generation date in output', async () => {
    const result = await execute(
      { document_type: 'packing_list', title: 'Test Doc' },
      mockEnvelope
    );
    expect(result.document).toMatch(/Generated/);
  });
});
