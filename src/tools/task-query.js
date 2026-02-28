import { getDb } from '../utils/db.js';
import { getHousehold } from '../utils/config.js';
import { resolveMemberId, formatPacific } from '../utils/resolve-member.js';
import log from '../utils/logger.js';

export const definition = {
  name: 'task_query',
  description:
    "List tasks. Can filter by assignee, creator, status, and whether overdue. Use when someone asks 'what are my tasks?', 'what did I assign?', 'what's overdue?', 'show tasks for Steve'.",
  input_schema: {
    type: 'object',
    properties: {
      assignee_id: {
        type: 'string',
        description: "Filter by assignee (person id or display name). 'me' = the person asking.",
      },
      creator_id: {
        type: 'string',
        description: "Filter by who created the task. 'me' = the person asking.",
      },
      status: {
        type: 'string',
        enum: ['open', 'in_progress', 'done', 'cancelled', 'active'],
        description: "Filter by status. 'active' means open + in_progress (default).",
      },
      include_overdue_only: {
        type: 'boolean',
        description: 'If true, only return tasks past their due date.',
      },
    },
  },
};

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

export async function execute(input, envelope) {
  try {
    const actorId = resolveMemberId(envelope.person_id, null);
    if (!actorId) return { error: 'Could not identify who is requesting tasks.' };

    const status = input?.status || 'active';
    const includeOverdueOnly = input?.include_overdue_only === true;

    // Resolve assignee/creator filters
    let assigneeId = null;
    let creatorId = null;

    if (input?.assignee_id) {
      assigneeId = resolveMemberId(input.assignee_id, actorId);
      if (!assigneeId) return { error: 'Unknown assignee_id. Use a valid household member id or name.' };
    }
    if (input?.creator_id) {
      creatorId = resolveMemberId(input.creator_id, actorId);
      if (!creatorId) return { error: 'Unknown creator_id. Use a valid household member id or name.' };
    }

    // Default: assignee = caller if no filters
    if (!assigneeId && !creatorId) {
      assigneeId = actorId;
    }

    // Cross-person query requires tasks_others
    const perms = envelope.permissions || [];
    if (assigneeId && assigneeId !== actorId && !perms.includes('tasks_others')) {
      return { error: "Permission denied: you can only view your own tasks." };
    }
    if (creatorId && creatorId !== actorId && !perms.includes('tasks_others')) {
      return { error: "Permission denied: you can only view your own tasks." };
    }

    // Build query
    const conditions = [];
    const params = [];

    if (status === 'active') {
      conditions.push("status IN ('open', 'in_progress')");
    } else {
      conditions.push('status = ?');
      params.push(status);
    }

    if (assigneeId) {
      conditions.push('assignee_id = ?');
      params.push(assigneeId);
    }
    if (creatorId) {
      conditions.push('creator_id = ?');
      params.push(creatorId);
    }

    if (includeOverdueOnly) {
      conditions.push("due_at IS NOT NULL AND due_at < datetime('now')");
      // Override status to only active tasks
      conditions[0] = "status IN ('open', 'in_progress')";
      // Remove the status param if it was added
      if (status !== 'active') {
        params.shift();
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT id, title, description, creator_id, assignee_id, status, priority, due_at, created_at, completed_at
                 FROM tasks ${whereClause}
                 ORDER BY created_at DESC`;

    const db = getDb();
    const rows = db.prepare(sql).all(...params);

    const household = getHousehold();
    const now = new Date();

    const tasks = rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      assignee: household.members[r.assignee_id]?.display_name || r.assignee_id,
      creator: household.members[r.creator_id]?.display_name || r.creator_id,
      status: r.status,
      priority: r.priority,
      due_at_local: r.due_at ? formatPacific(r.due_at) : null,
      created_at_local: formatPacific(r.created_at),
      is_overdue: r.due_at ? new Date(r.due_at) < now && ['open', 'in_progress'].includes(r.status) : false,
    }));

    // Sort: overdue first, then priority, then created_at desc (already from SQL)
    tasks.sort((a, b) => {
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
      const pa = PRIORITY_ORDER[a.priority] ?? 2;
      const pb = PRIORITY_ORDER[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return 0; // preserve SQL created_at desc order
    });

    const targetName = assigneeId
      ? (household.members[assigneeId]?.display_name || assigneeId)
      : 'matching filters';

    return {
      tasks,
      count: tasks.length,
      message: tasks.length === 0
        ? `No ${status === 'active' ? 'active' : status} tasks found for ${targetName}.`
        : `Found ${tasks.length} task${tasks.length === 1 ? '' : 's'}.`,
    };
  } catch (err) {
    log.error('task_query failed', { error: err.message });
    return { error: `Failed to query tasks: ${err.message}` };
  }
}
