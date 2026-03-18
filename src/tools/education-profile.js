import { query, isConfigured } from '../utils/supabase.js';
import log from '../utils/logger.js';

export const definition = {
  name: 'education_profile',
  description:
    "Look up a child's education profile from Education Advisor — learning identity, diagnoses, accommodations, grade level, strengths, challenges, and psychometric scores. Use when adults ask about a child's educational situation, learning needs, or school context.",
  input_schema: {
    type: 'object',
    properties: {
      child_name: {
        type: 'string',
        description: 'The child\'s first name (e.g., "Ryker", "Logan", "Hazel", "AJ", "Alex")',
      },
    },
    required: ['child_name'],
  },
};

export async function execute(input) {
  if (!isConfigured()) {
    return { error: 'Education Advisor not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env' };
  }

  try {
    const name = input.child_name.trim();
    const children = await query('children', `name=ilike.*${encodeURIComponent(name)}*&select=name,grade_level,diagnoses,profile_context,learner_profile`);

    if (!children.length) {
      return { error: `No child found matching "${name}". Available: Ryker, Logan, Hazel, AJ, Alex.` };
    }

    const child = children[0];
    const profile = child.profile_context || {};
    const learner = child.learner_profile || {};

    return {
      name: child.name,
      grade_level: child.grade_level,
      learner_summary: learner.summary || null,
      strengths: learner.strengths || profile.holistic?.strengths || [],
      challenges: learner.challenges || [],
      interests: learner.interests || profile.holistic?.interests || [],
      diagnoses: profile.clinical?.diagnoses || child.diagnoses || [],
      accommodations: profile.support?.accommodations || [],
      legal_framework: profile.support?.legal_framework || null,
      school_type: profile.support?.school_type || null,
      executive_function: profile.clinical?.executive_function || [],
      psychometrics: profile.psychometrics?.scores || null,
      narrative_headline: profile.narrative?.headline || null,
    };
  } catch (err) {
    log.error('education_profile failed', { error: err.message });
    return { error: `Education profile lookup failed: ${err.message}` };
  }
}
