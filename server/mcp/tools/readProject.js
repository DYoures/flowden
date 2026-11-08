// MCP Tool: read_project_context
const Project = require('../../models/Project');
const Board = require('../../models/Board');
const Note = require('../../models/Note');
const db = require('../../config/database');

const definition = {
  name: 'read_project_context',
  description: 'Reads comprehensive context, stats, boards, and linked entities for a specific FLOWDEN project.',
  parameters: {
    type: 'object',
    properties: {
      project_id: {
        type: 'integer',
        description: 'The ID of the project to retrieve context for'
      }
    },
    required: ['project_id']
  }
};

async function execute(userId, { project_id }, mcpContext = null) {
  if (!project_id) throw new Error('project_id is required');
  const pid = Number(project_id);

  if (mcpContext && mcpContext.enforceProjectAllowlist && !mcpContext.enabledProjects.includes(pid)) {
    const err = new Error(`Project ${pid} is not enabled for MCP access in your AI boundary settings`);
    err.status = 403;
    err.eventType = 'MCP_PROJECT_SCOPE_DENIED';
    throw err;
  }

  const project = await Project.findById(pid, userId);
  if (!project) {
    const err = new Error('Project not found or unauthorized');
    err.status = 403;
    err.eventType = 'MCP_PROJECT_ACCESS_DENIED';
    throw err;
  }

  const stats = await Project.getStats(pid, userId);
  const boards = await Board.findByProject(pid, userId);
  const notes = await Note.findAll(userId, { projectId: pid });
  const tasks = await db.query('SELECT * FROM tasks WHERE project_id = ? AND user_id = ?', [pid, userId]);
  const research = await db.query('SELECT id, title, file_type, summary, source_url, created_at FROM research_documents WHERE project_id = ? AND user_id = ?', [pid, userId]);

  return {
    project: {
      ...project,
      stats
    },
    boards: (boards || []).map(b => ({ id: b.id, title: b.title })),
    recent_notes: (notes || []).slice(0, 10).map(n => ({ id: n.id, title: n.title, snippet: (n.plain_text || n.content || '').slice(0, 180) })),
    active_tasks: (tasks || []).filter(t => t.status !== 'done').map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })),
    research_sources: research || []
  };
}

module.exports = { definition, execute };
