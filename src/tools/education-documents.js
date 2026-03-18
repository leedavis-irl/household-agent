import { query, isConfigured } from '../utils/supabase.js';
import log from '../utils/logger.js';

export const definition = {
  name: 'education_documents',
  description:
    "Search the Education Advisor document vault — report cards, assessments (DIBELS, STAR, CAASPP), IEPs, 504 plans, neuropsych evaluations, teacher notes, and school policies. Use when adults ask about a child's academic records, test scores, or school documents.",
  input_schema: {
    type: 'object',
    properties: {
      child_name: {
        type: 'string',
        description: 'The child\'s first name to filter documents (e.g., "Ryker"). Omit to search all documents including school-level ones.',
      },
      search: {
        type: 'string',
        description: 'Keywords to search for in document name or content (e.g., "DIBELS", "report card", "neuropsych", "504 plan")',
      },
      category: {
        type: 'string',
        enum: ['academic_architecture', 'differentiation_opportunity', 'constitution_culture', 'performance_profile', 'operational_basics', 'other'],
        description: 'Filter by document category (optional)',
      },
    },
  },
};

export async function execute(input) {
  if (!isConfigured()) {
    return { error: 'Education Advisor not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env' };
  }

  try {
    // Build query params
    const params = ['select=id,name,category,tags,subjects,doc_type,extracted_date,content,child_id,school_id'];

    // If child_name given, resolve to child_id first
    if (input.child_name) {
      const children = await query('children', `name=ilike.*${encodeURIComponent(input.child_name.trim())}*&select=id,name`);
      if (children.length) {
        params.push(`child_id=eq.${children[0].id}`);
      } else {
        return { error: `No child found matching "${input.child_name}".` };
      }
    }

    if (input.category) {
      params.push(`category=eq.${encodeURIComponent(input.category)}`);
    }

    // Text search on name field
    if (input.search) {
      params.push(`name=ilike.*${encodeURIComponent(input.search.trim())}*`);
    }

    params.push('order=extracted_date.desc.nullslast');
    params.push('limit=20');

    const docs = await query('documents', params.join('&'));

    const results = docs.map((d) => ({
      name: d.name,
      category: d.category,
      doc_type: d.doc_type,
      date: d.extracted_date,
      tags: d.tags,
      subjects: d.subjects,
      // Include first 500 chars of content for context
      content_preview: d.content ? d.content.slice(0, 500) + (d.content.length > 500 ? '...' : '') : null,
    }));

    return {
      total: results.length,
      documents: results,
      message: results.length === 20 ? 'Showing first 20 results. Use more specific search terms to narrow down.' : undefined,
    };
  } catch (err) {
    log.error('education_documents failed', { error: err.message });
    return { error: `Education document search failed: ${err.message}` };
  }
}
