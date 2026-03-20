import { getDb } from '../utils/db.js';
import { getHousehold } from '../utils/config.js';
import { resolveMemberId, formatPacific } from '../utils/resolve-member.js';
import { sendMessage } from '../broker/signal.js';
import log from '../utils/logger.js';

export const definition = {
  name: 'task_create',
  description:
    "Create a task and optionally assign it to a household member. Defaults to assigning to yourself. Use when someone says 'I need to...', 'can you ask X to...', 'add a task for...', 'we need someone to...'",
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short task title (what needs to be done)',
      },
      description: {
        type: 'string',
        description: 'Optional longer description or context',
      },
      assignee_id: {
        type: 'string',
        description:
          "Person id or display name to assign to. Defaults to the person asking. 'me' means yourself.",
      },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'urgent'],
        description: 'Task priority. Defaults to normal.',
      },
      due_at: {
        type: 'string',
        description:
          'Optional ISO datetime for when the task is due. Claude should resolve natural language relative to current Pacific time.',
      },
      category: {
        type: 'string',
        description:
          "Optional category for the task. Use 'grounds' for landscaping and outdoor maintenance tasks (mowing, irrigation, planting, tree trimming, etc.). Leave blank for general household tasks.",
      },
    },
    required: ['title'],
  },
};

export async function execute(input, envelope) {
  try {
    const creatorId = resolveMemberId(envelope.person_id, null);
    if (!creatorId) {
      return { error: 'Could not identify who is creating this task.' };
    }

    const title = (input?.title || '').trim();
    if (!title) return { error: 'title is required.' };

    const description = (input?.description || '').trim() || null;
    const priority = input?.priority || 'normal';
    if (!['low', 'normal', 'high', 'urgent'].includes(priority)) {
      return { error: 'priority must be one of: low, normal, high, urgent.' };
    }

    const assigneeId = resolveMemberId(input?.assignee_id, creatorId);
    if (!assigneeId) {
      return { error: 'Unknown assignee_id. Use a valid household member id or name.' };
    }

    // Cross-person assignment requires tasks_others
    const isOtherAssignee = assigneeId !== creatorId;
    if (isOtherAssignee && !(envelope.permissions || []).includes('tasks_others')) {
      return { error: 'Permission denied: you can only assign tasks to yourself.' };
    }

    let dueAtIso = null;
    if (input?.due_at) {
      const dueDate = new Date(input.due_at);
      if (Number.isNaN(dueDate.getTime())) {
        return { error: 'due_at must be a valid ISO 8601 timestamp.' };
      }
      dueAtIso = dueDate.toISOString();
    }

    const category = (input?.category || '').trim().toLowerCase() || null;

    const db = getDb();
    const result = db.prepare(
      `INSERT INTO tasks (title, description, creator_id, assignee_id, status, priority, due_at, category)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`
    ).run(title, description, creatorId, assigneeId, priority, dueAtIso, category);

    const household = getHousehold();
    const assignee = household.members[assigneeId];
    const assigneeName = assignee?.display_name || assigneeId;
    const creatorName = household.members[creatorId]?.display_name || creatorId;

    // Notify assignee if different from creator
    if (isOtherAssignee && assignee?.identifiers?.signal) {
      sendMessage(assignee.identifiers.signal, `📋 New task from ${creatorName}: ${title}`);
    }

    log.info('Task created', { task_id: result.lastInsertRowid, creator: creatorId, assignee: assigneeId });

    return {
      task_id: result.lastInsertRowid,
      title,
      assignee: assigneeName,
      assignee_id: assigneeId,
      priority,
      due_at_local: dueAtIso ? formatPacific(dueAtIso) : null,
      category: category || null,
      status: 'open',
    };
  } catch (err) {
    log.error('task_create failed', { error: err.message });
    return { error: `Failed to create task: ${err.message}` };
  }
}
