import { query, isConfigured } from '../utils/supabase.js';
import log from '../utils/logger.js';

export const definition = {
  name: 'education_goals',
  description:
    "Query a child's education goals from Education Advisor — North Star vision, objectives, and tactics. Shows what's been planned, who's assigned, and progress. Use when adults ask about education strategy, what's being worked on, or what to focus on.",
  input_schema: {
    type: 'object',
    properties: {
      child_name: {
        type: 'string',
        description: 'The child\'s first name (e.g., "Ryker", "Logan")',
      },
      type: {
        type: 'string',
        enum: ['North Star', 'Objective', 'Tactic'],
        description: 'Filter by goal type (optional). North Star is the high-level vision, Objectives are measurable milestones, Tactics are specific actions.',
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
    const children = await query('children', `name=ilike.*${encodeURIComponent(input.child_name.trim())}*&select=id,name`);
    if (!children.length) {
      return { error: `No child found matching "${input.child_name}".` };
    }
    const child = children[0];

    const params = [
      `child_id=eq.${child.id}`,
      'select=id,type,description,status,execution_status,progress,target_date,assigned_to,parent_id',
      'order=type.asc,created_at.asc',
    ];

    if (input.type) {
      params.push(`type=eq.${encodeURIComponent(input.type)}`);
    }

    const goals = await query('goals', params.join('&'));

    // Resolve assigned team member names
    let teamMap = {};
    const allAssigned = [...new Set(goals.flatMap((g) => g.assigned_to || []))];
    if (allAssigned.length) {
      const teamMembers = await query('team_members', `id=in.(${allAssigned.join(',')})&select=id,name,role`);
      teamMap = Object.fromEntries(teamMembers.map((t) => [t.id, `${t.name} (${t.role})`]));
    }

    const results = goals.map((g) => ({
      type: g.type,
      description: g.description,
      status: g.status,
      execution_status: g.execution_status,
      progress: g.progress != null ? `${g.progress}%` : null,
      target_date: g.target_date,
      assigned_to: (g.assigned_to || []).map((id) => teamMap[id] || id),
    }));

    // Group by type for readability
    const northStar = results.filter((r) => r.type === 'North Star');
    const objectives = results.filter((r) => r.type === 'Objective');
    const tactics = results.filter((r) => r.type === 'Tactic');

    return {
      child: child.name,
      north_star: northStar,
      objectives,
      tactics,
      total: results.length,
    };
  } catch (err) {
    log.error('education_goals failed', { error: err.message });
    return { error: `Education goals query failed: ${err.message}` };
  }
}
