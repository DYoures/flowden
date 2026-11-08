// MCP Tool: get_workflow_tasks
const db = require('../../config/database');

const definition = {
  name: 'get_workflow_tasks',
  description: 'Lists workflow tasks filtered by status, priority, or project.',
  parameters: {
    type: 'object',
    properties: {
      project_id: {
        type: 'integer',
        description: 'Optional project ID filter'
      },
      status: {
        type: 'string',
        description: 'Optional status filter: planned, in_progress, review, done'
      },
      priority: {
        type: 'string',
        description: 'Optional priority filter: low, medium, high, urgent'
      }
    }
  }
};

async function execute(userId, { project_id, status, priority } = {}, mcpContext = null) {
  if (project_id && mcpContext && mcpContext.enforceProjectAllowlist && !mcpContext.enabledProjects.includes(Number(project_id))) {
    const err = new Error(`Project ${project_id} is not enabled for MCP access in your AI boundary settings`);
    err.status = 403;
    err.eventType = 'MCP_PROJECT_SCOPE_DENIED';
    throw err;
  }

  if (mcpContext && mcpContext.enforceProjectAllowlist && mcpContext.enabledProjects.length === 0) {
    return { count: 0, tasks: [] };
  }

  let sql = 'SELECT id, project_id, title, description, status, priority, due_date, created_at FROM tasks WHERE user_id = ?';
  const params = [userId];

  if (project_id) {
    sql += ' AND project_id = ?';
    params.push(Number(project_id));
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (priority) {
    sql += ' AND priority = ?';
    params.push(priority);
  }

  sql += ' ORDER BY created_at DESC';
  let tasks = await db.query(sql, params);

  if (mcpContext && mcpContext.enforceProjectAllowlist) {
    const allowedSet = new Set(mcpContext.enabledProjects.map(Number));
    tasks = (tasks || []).filter(t => t.project_id && allowedSet.has(Number(t.project_id)));
  }

  return { count: (tasks || []).length, tasks: tasks || [] };
}

module.exports = { definition, execute };
