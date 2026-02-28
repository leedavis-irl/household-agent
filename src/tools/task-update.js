import { getDb } from '../utils/db.js';
import { getHousehold } from '../utils/config.js';
import { resolveMemberId, formatPacific } from '../utils/resolve-member.js';
import { sendMessage } from '../broker/signal.js';
import log from '../utils/logger.js';

export const definition = {
  name: 'task_update',
  description:
    "Update a task's status, priority, assignee, or due date. Use when someone says 'mark that as done', 'I started working on X', 'reassign to Steve', 'push the deadline to Friday', 'cancel that task'.",
  input_schema: {
    type: 'object',
    properties: {
      task_id: {
        type: 'integer',
        description: 'The task ID to update',
      },
      status: {
        type: 'string',
        enum: ['open', 'in_progress', 'done', 'cancelled'],
        description: 'New status',
      },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'urgent'],
        description: 'New priority',
      },
      assignee_id: {
        type: 'string',
        description: 'Reassign to a different person (id or display name)',
      },
      due_at: {
        type: 'string',
        description: 'New due date (ISO datetime)',
      },
    },
    required: ['task_id'],
  },
};

export async function execute(input, envelope) {
  try {
    const actorId = resolveMemberId(envelope.person_id, null);
    if (!actorId) return { error: 'Could not identify who is making this request.' };

    const taskId = Number(input?.task_id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return { error: 'task_id must be a positive integer.' };
    }

    // Check at least one update field
    const hasStatus = input?.status != null;
    const hasPriority = input?.priority != null;
    const hasAssignee = input?.assignee_id != null;
    const hasDueAt = input?.due_at != null;
    if (!hasStatus && !hasPriority && !hasAssignee && !hasDueAt) {
      return { error: 'At least one field besides task_id must be provided.' };
    }

    const db = getDb();
    const task = db.prepare(
      'SELECT id, title, creator_id, assignee_id, status, priority, due_at FROM tasks WHERE id = ?'
    ).get(taskId);
    if (!task) return { error: `Task #${taskId} not found.` };

    // Permission: can update if you're creator, assignee, or have tasks_others
    const perms = envelope.permissions || [];
    const isCreator = task.creator_id === actorId;
    const isAssignee = task.assignee_id === actorId;
    if (!isCreator && !isAssignee && !perms.includes('tasks_others')) {
      return { error: 'Permission denied: you can only update tasks you created or are assigned to.' };
    }

    const household = getHousehold();
    const sets = [];
    const params = [];

    // Status update
    if (hasStatus) {
      const newStatus = input.status;
      if (!['open', 'in_progress', 'done', 'cancelled'].includes(newStatus)) {
        return { error: 'status must be one of: open, in_progress, done, cancelled.' };
      }
      sets.push('status = ?');
      params.push(newStatus);

      if (newStatus === 'done') {
        sets.push("completed_at = datetime('now')");
      }
    }

    // Priority update
    if (hasPriority) {
      if (!['low', 'normal', 'high', 'urgent'].includes(input.priority)) {
        return { error: 'priority must be one of: low, normal, high, urgent.' };
      }
      sets.push('priority = ?');
      params.push(input.priority);
    }

    // Reassignment
    let newAssigneeId = null;
    if (hasAssignee) {
      newAssigneeId = resolveMemberId(input.assignee_id, actorId);
      if (!newAssigneeId) {
        return { error: 'Unknown assignee_id. Use a valid household member id or name.' };
      }
      if (newAssigneeId !== actorId && !perms.includes('tasks_others')) {
        return { error: 'Permission denied: you cannot reassign tasks to others.' };
      }
      sets.push('assignee_id = ?');
      params.push(newAssigneeId);
    }

    // Due date update
    if (hasDueAt) {
      const dueDate = new Date(input.due_at);
      if (Number.isNaN(dueDate.getTime())) {
        return { error: 'due_at must be a valid ISO 8601 timestamp.' };
      }
      sets.push('due_at = ?');
      params.push(dueDate.toISOString());
    }

    sets.push("updated_at = datetime('now')");
    params.push(taskId);

    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params);

    // Re-read updated task
    const updated = db.prepare(
      'SELECT id, title, description, creator_id, assignee_id, status, priority, due_at, created_at, updated_at, completed_at FROM tasks WHERE id = ?'
    ).get(taskId);

    const assigneeName = household.members[updated.assignee_id]?.display_name || updated.assignee_id;
    const creatorName = household.members[updated.creator_id]?.display_name || updated.creator_id;
    const oldAssigneeName = household.members[task.assignee_id]?.display_name || task.assignee_id;

    // Notifications
    if (hasStatus && input.status === 'done' && updated.creator_id !== updated.assignee_id) {
      const creatorSignal = household.members[updated.creator_id]?.identifiers?.signal;
      if (creatorSignal) {
        sendMessage(creatorSignal, `✅ ${assigneeName} completed: ${updated.title}`);
      }
    }

    if (hasStatus && input.status === 'cancelled' && updated.creator_id !== updated.assignee_id) {
      const creatorSignal = household.members[updated.creator_id]?.identifiers?.signal;
      if (creatorSignal) {
        sendMessage(creatorSignal, `🚫 ${assigneeName} cancelled task: ${updated.title}`);
      }
    }

    if (hasAssignee && newAssigneeId && newAssigneeId !== task.assignee_id) {
      const newAssigneeSignal = household.members[newAssigneeId]?.identifiers?.signal;
      if (newAssigneeSignal) {
        sendMessage(newAssigneeSignal, `📋 Task reassigned to you from ${oldAssigneeName}: ${updated.title}`);
      }
    }

    log.info('Task updated', { task_id: taskId, actor: actorId });

    const now = new Date();
    return {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      assignee: assigneeName,
      creator: creatorName,
      status: updated.status,
      priority: updated.priority,
      due_at_local: updated.due_at ? formatPacific(updated.due_at) : null,
      created_at_local: formatPacific(updated.created_at),
      is_overdue: updated.due_at ? new Date(updated.due_at) < now && ['open', 'in_progress'].includes(updated.status) : false,
    };
  } catch (err) {
    log.error('task_update failed', { error: err.message });
    return { error: `Failed to update task: ${err.message}` };
  }
}
