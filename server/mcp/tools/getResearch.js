// MCP Tool: get_research_sources
const db = require('../../config/database');

const definition = {
  name: 'get_research_sources',
  description: 'Retrieves literature citations, extracted abstracts, and source papers from the Research Bridge.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Optional search term to filter research literature'
      },
      project_id: {
        type: 'integer',
        description: 'Optional project ID filter'
      }
    }
  }
};

async function execute(userId, { query, project_id } = {}, mcpContext = null) {
  if (project_id && mcpContext && mcpContext.enforceProjectAllowlist && !mcpContext.enabledProjects.includes(Number(project_id))) {
    const err = new Error(`Project ${project_id} is not enabled for MCP access in your AI boundary settings`);
    err.status = 403;
    err.eventType = 'MCP_PROJECT_SCOPE_DENIED';
    throw err;
  }

  if (mcpContext && mcpContext.enforceProjectAllowlist && mcpContext.enabledProjects.length === 0) {
    return { documents: [] };
  }

  let sql = 'SELECT id, project_id, title, file_name, file_type, file_size, summary, source_url, created_at FROM research_documents WHERE user_id = ?';
  const params = [userId];

  if (project_id) {
    sql += ' AND project_id = ?';
    params.push(Number(project_id));
  }

  let documents = await db.query(sql, params);

  if (mcpContext && mcpContext.enforceProjectAllowlist) {
    const allowedSet = new Set(mcpContext.enabledProjects.map(Number));
    documents = (documents || []).filter(d => d.project_id && allowedSet.has(Number(d.project_id)));
  }

  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    documents = (documents || []).filter(d =>
      (d.title && d.title.toLowerCase().includes(q)) ||
      (d.summary && d.summary.toLowerCase().includes(q))
    );
  }

  return { documents: documents || [] };
}

module.exports = { definition, execute };
