import { query, isConfigured } from '../utils/supabase.js';
import log from '../utils/logger.js';

export const definition = {
  name: 'education_team',
  description:
    "Look up the education support team — teachers, tutors, coaches, specialists, therapists. Shows names, roles, organizations, contact info, and whether they're active. Use when adults ask about who's working with a child or need contact information.",
  input_schema: {
    type: 'object',
    properties: {
      child_name: {
        type: 'string',
        description: 'Filter team members to those associated with a specific child (optional). Omit to see all team members.',
      },
      role: {
        type: 'string',
        description: 'Filter by role keyword (e.g., "Teacher", "Tutor", "Coach", "Parent")',
      },
    },
  },
};

export async function execute(input) {
  if (!isConfigured()) {
    return { error: 'Education Advisor not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env' };
  }

  try {
    const params = ['select=id,name,role,organization,email,phone,status'];

    if (input.role) {
      params.push(`role=ilike.*${encodeURIComponent(input.role.trim())}*`);
    }

    params.push('order=status.asc,name.asc');

    let members = await query('team_members', params.join('&'));

    // If child_name given, filter to team members assigned to that child's goals
    if (input.child_name) {
      const children = await query('children', `name=ilike.*${encodeURIComponent(input.child_name.trim())}*&select=id,name`);
      if (children.length) {
        const goals = await query('goals', `child_id=eq.${children[0].id}&select=assigned_to`);
        const assignedIds = new Set(goals.flatMap((g) => g.assigned_to || []));
        // Also include members from the child's profile_context.support.team
        const profileData = await query('children', `id=eq.${children[0].id}&select=profile_context`);
        const profileTeam = profileData[0]?.profile_context?.support?.team || [];
        const profileNames = new Set(profileTeam.map((t) => t.name?.toLowerCase()));

        members = members.filter((m) =>
          assignedIds.has(m.id) || profileNames.has(m.name?.toLowerCase())
        );
      }
    }

    const results = members.map((m) => ({
      name: m.name,
      role: m.role,
      organization: m.organization,
      email: m.email,
      phone: m.phone,
      status: m.status,
    }));

    return {
      total: results.length,
      team_members: results,
    };
  } catch (err) {
    log.error('education_team failed', { error: err.message });
    return { error: `Education team lookup failed: ${err.message}` };
  }
}
