import log from '../utils/logger.js';

const DOCUMENT_TYPES = ['packing_list', 'event_prep', 'summary_report', 'custom'];

function formatDate(date = new Date()) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function renderSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return '';
  return sections
    .map((s) => {
      const heading = s.heading ? `\n### ${s.heading}\n` : '';
      const items = Array.isArray(s.items) && s.items.length > 0
        ? s.items.map((item) => `- [ ] ${item}`).join('\n')
        : '';
      return `${heading}${items}`;
    })
    .join('\n\n');
}

function buildPackingList(title, context, sections, notes) {
  const lines = [
    `# ${title}`,
    `*Generated ${formatDate()}*`,
    '',
  ];

  if (context) {
    lines.push('## Overview', '', context, '');
  }

  if (sections && sections.length > 0) {
    lines.push('## Packing List', '', renderSections(sections));
  } else {
    lines.push(
      '## Packing List',
      '',
      '### Clothing & Footwear',
      '',
      '### Toiletries & Personal Care',
      '',
      '### Electronics & Chargers',
      '',
      '### Documents & Essentials',
      '',
      '### Miscellaneous',
      '',
    );
  }

  if (notes) {
    lines.push('', '---', `*Notes: ${notes}*`);
  }

  return lines.join('\n');
}

function buildEventPrep(title, context, sections, notes) {
  const lines = [
    `# ${title}`,
    `*Generated ${formatDate()}*`,
    '',
  ];

  if (context) {
    lines.push('## Event Details', '', context, '');
  }

  if (sections && sections.length > 0) {
    lines.push('## Prep Checklist', '', renderSections(sections));
  } else {
    lines.push(
      '## Prep Checklist',
      '',
      '### Before the Event',
      '',
      '### Day Of',
      '',
      '### During',
      '',
      '### After / Follow-up',
      '',
    );
  }

  if (notes) {
    lines.push('', '---', `*Notes: ${notes}*`);
  }

  return lines.join('\n');
}

function buildSummaryReport(title, context, sections, notes) {
  const lines = [
    `# ${title}`,
    `*Generated ${formatDate()}*`,
    '',
  ];

  if (context) {
    lines.push('## Summary', '', context, '');
  }

  if (sections && sections.length > 0) {
    lines.push(renderSections(sections));
  }

  if (notes) {
    lines.push('', '---', `*Notes: ${notes}*`);
  }

  return lines.join('\n');
}

function buildCustom(title, context, sections, notes) {
  const lines = [
    `# ${title}`,
    `*Generated ${formatDate()}*`,
    '',
  ];

  if (context) {
    lines.push(context, '');
  }

  if (sections && sections.length > 0) {
    lines.push(renderSections(sections));
  }

  if (notes) {
    lines.push('', '---', `*Notes: ${notes}*`);
  }

  return lines.join('\n');
}

export const definition = {
  name: 'generate_document',
  description:
    'Generate a structured, formatted document — packing list, event prep checklist, summary report, or custom doc. Call this after gathering relevant context via knowledge_search and calendar_query. Returns formatted markdown text.',
  input_schema: {
    type: 'object',
    properties: {
      document_type: {
        type: 'string',
        enum: DOCUMENT_TYPES,
        description:
          'Type of document to generate: packing_list, event_prep, summary_report, or custom.',
      },
      title: {
        type: 'string',
        description: 'Document title (e.g. "Tahoe Trip Packing List", "Ryker\'s Birthday Party Prep").',
      },
      context: {
        type: 'string',
        description:
          'Context and content gathered from knowledge_search, calendar_query, and other tools. Include all relevant details to incorporate into the document.',
      },
      sections: {
        type: 'array',
        description:
          'Optional structured sections. Each section has a heading and a list of items. Items appear as checkboxes.',
        items: {
          type: 'object',
          properties: {
            heading: {
              type: 'string',
              description: 'Section heading',
            },
            items: {
              type: 'array',
              items: { type: 'string' },
              description: 'List items for this section',
            },
          },
          required: ['heading'],
        },
      },
      notes: {
        type: 'string',
        description: 'Optional footer notes or reminders to append at the bottom.',
      },
    },
    required: ['document_type', 'title'],
  },
};

export async function execute(input, _envelope) {
  const { document_type, title, context, sections, notes } = input;

  if (!DOCUMENT_TYPES.includes(document_type)) {
    return { error: `Unknown document_type: ${document_type}. Use one of: ${DOCUMENT_TYPES.join(', ')}` };
  }

  log.info('Generating document', { document_type, title });

  try {
    let document;
    switch (document_type) {
      case 'packing_list':
        document = buildPackingList(title, context, sections, notes);
        break;
      case 'event_prep':
        document = buildEventPrep(title, context, sections, notes);
        break;
      case 'summary_report':
        document = buildSummaryReport(title, context, sections, notes);
        break;
      case 'custom':
        document = buildCustom(title, context, sections, notes);
        break;
    }

    return { document, document_type, title };
  } catch (err) {
    log.error('Document generation failed', { error: err.message });
    return { error: `Document generation failed: ${err.message}` };
  }
}
