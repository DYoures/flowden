// MCP Tool: get_knowledge_connections
const db = require('../../config/database');

const definition = {
  name: 'get_knowledge_connections',
  description: 'Queries graph topology and bi-directional smart connections between projects, notes, and research.',
  parameters: {
    type: 'object',
    properties: {
      source_id: {
        type: 'string',
        description: 'Optional entity ID filter'
      }
    }
  }
};

async function execute(userId, { source_id } = {}, mcpContext = null) {
  if (mcpContext && mcpContext.enforceProjectAllowlist && mcpContext.enabledProjects.length === 0) {
    return { connections: [] };
  }

  let sql = 'SELECT * FROM smart_connections WHERE user_id = ?';
  const params = [userId];

  if (source_id) {
    sql += ' AND (source_id = ? OR target_id = ?)';
    params.push(source_id);
    params.push(source_id);
  }

  let connections = await db.query(sql, params);

  if (mcpContext && mcpContext.enforceProjectAllowlist) {
    const allowedSet = new Set(mcpContext.enabledProjects.map(Number));
    connections = (connections || []).filter(c => {
      if (c.source_type === 'project' && !allowedSet.has(Number(c.source_id))) return false;
      if (c.target_type === 'project' && !allowedSet.has(Number(c.target_id))) return false;
      return true;
    });
  }

  return { connections: connections || [] };
}

module.exports = { definition, execute };
