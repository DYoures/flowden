// MCP Tool: search_vault_knowledge
const db = require('../../config/database');
const SearchService = require('../../services/searchService');

const definition = {
  name: 'search_vault_knowledge',
  description: 'Searches across the user Knowledge Vault notes, tags, and markdown content.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query string to match note titles or content'
      },
      tag: {
        type: 'string',
        description: 'Optional tag name filter'
      },
      project_id: {
        type: 'integer',
        description: 'Optional project ID filter'
      }
    }
  }
};

async function execute(userId, { query, tag, project_id } = {}, mcpContext = null) {
  let enabledProjects = mcpContext && Array.isArray(mcpContext.enabledProjects)
    ? mcpContext.enabledProjects.map(Number).filter(Boolean)
    : [];

  if (!mcpContext) {
    try {
      const rows = await db.query('SELECT settings_json FROM users WHERE id = ?', [userId]);
      const userRow = Array.isArray(rows) && rows[0] ? rows[0] : null;
      if (userRow && userRow.settings_json) {
        const parsed = typeof userRow.settings_json === 'string' ? JSON.parse(userRow.settings_json) : userRow.settings_json;
        if (parsed && parsed.mcp && Array.isArray(parsed.mcp.enabledProjects)) {
          enabledProjects = parsed.mcp.enabledProjects.map(Number).filter(Boolean);
        }
      }
    } catch (_) {}
  }

  if (project_id && !enabledProjects.includes(Number(project_id))) {
    const err = new Error(`Project ${project_id} is not enabled for MCP access in your AI boundary settings`);
    err.status = 403;
    err.eventType = 'MCP_PROJECT_SCOPE_DENIED';
    throw err;
  }

  // Zero-trust boundary: If no projects are enabled, MCP access is strictly empty
  if (enabledProjects.length === 0) {
    return {
      count: 0,
      results: [],
      notes: []
    };
  }

  let results = [];
  if (query && query.trim()) {
    const searchOpts = {
      entityTypes: ['note'],
      activeProjectId: project_id ? parseInt(project_id, 10) : null,
      isMcp: true,
      enabledProjectIds: enabledProjects,
      limit: 20
    };
    const rawEntities = await SearchService.universalSearch(db, userId, query, searchOpts);
    results = rawEntities.map(e => ({
      id: e.entity_id,
      entity_id: e.entity_id,
      title: e.title,
      project_id: e.primary_project_id,
      plain_text: e.search_text || ''
    }));
  } else {
    const Note = require('../../models/Note');
    results = await Note.findAll(userId, {
      projectId: project_id,
      tag
    });
  }

  // Strictly enforce enabledProjects allowlist across all results
  const allowedSet = new Set(enabledProjects.map(Number));
  results = results.filter(n => n.project_id && allowedSet.has(Number(n.project_id)));

  if (tag && query && query.trim()) {
    const Note = require('../../models/Note');
    const taggedNotes = await Note.findAll(userId, { projectId: project_id, tag });
    const taggedIds = new Set(taggedNotes.map(n => Number(n.id)));
    results = results.filter(r => taggedIds.has(Number(r.id)));
  }

  const formattedItems = results.slice(0, 15).map(n => ({
    id: n.id,
    entity_id: n.entity_id !== undefined ? n.entity_id : n.id,
    title: n.title,
    project_id: n.project_id,
    tags: (n.tags || []).map(t => typeof t === 'string' ? t : t.name),
    excerpt: (n.plain_text || n.content || '').slice(0, 350),
    updated_at: n.updated_at
  }));

  return {
    count: results.length,
    results: formattedItems,
    notes: formattedItems
  };
}

module.exports = { definition, execute };
