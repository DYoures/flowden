// FLOWDEN MCP Engine Entry
const readProject = require('./tools/readProject');
const searchNotes = require('./tools/searchNotes');
const getTasks = require('./tools/getTasks');
const getResearch = require('./tools/getResearch');
const getConnections = require('./tools/getConnections');
const Note = require('../models/Note');
const Project = require('../models/Project');
const SecurityService = require('../services/securityService');

const createVaultNoteTool = {
  definition: {
    name: 'create_vault_note',
    description: 'Creates a new Knowledge Vault note. Requires read_write MCP scope and explicit confirm: true flag (otherwise returns a non-destructive preview).',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the new note' },
        content: { type: 'string', description: 'Markdown body content' },
        project_id: { type: 'integer', description: 'Optional project ID (must be in enabledProjects)' },
        confirm: { type: 'boolean', description: 'Must be true to commit the write operation' }
      },
      required: ['title']
    }
  },
  async execute(userId, args, mcpContext) {
    if (!mcpContext || mcpContext.scope !== 'read_write') {
      const err = new Error('MCP write access denied: current key scope is read_only.');
      err.status = 403;
      err.eventType = 'MCP_WRITE_SCOPE_DENIED';
      throw err;
    }

    const title = String(args.title || '').trim();
    if (!title || title.length > 255) {
      throw new Error('Valid note title (1-255 characters) is required');
    }
    const content = typeof args.content === 'string' ? args.content : '';
    const projectId = args.project_id ? Number(args.project_id) : null;

    if (projectId) {
      const project = await Project.findById(projectId, userId);
      if (!project) {
        const err = new Error('Target project not found or unauthorized');
        err.status = 403;
        err.eventType = 'MCP_PROJECT_ACCESS_DENIED';
        throw err;
      }
    }

    if (args.confirm !== true) {
      await SecurityService.logSecurityEvent({
        userId,
        eventType: 'MCP_MUTATION_PREVIEW_GENERATED',
        severity: 'info',
        ip: mcpContext.ip || null,
        targetType: 'note',
        details: { title, project_id: projectId }
      });
      return {
        status: 'confirmation_required',
        mutated: false,
        message: 'Write operation requires explicit confirmation (confirm: true). Review the preview before committing.',
        preview: {
          action: 'create_vault_note',
          title,
          project_id: projectId,
          content_length: content.length,
          content_preview: content.slice(0, 240)
        }
      };
    }

    const note = await Note.create({
      user_id: userId,
      project_id: projectId,
      title,
      content,
      is_pinned: false
    });

    await SecurityService.logSecurityEvent({
      userId,
      eventType: 'MCP_MUTATION_EXECUTED',
      severity: 'warning',
      ip: mcpContext.ip || null,
      targetType: 'note',
      targetId: String(note.id),
      details: { tool: 'create_vault_note', title, project_id: projectId }
    });

    return {
      status: 'committed',
      mutated: true,
      note: {
        id: note.id,
        title: note.title,
        project_id: note.project_id,
        created_at: note.created_at
      }
    };
  }
};

const tools = {
  [readProject.definition.name]: readProject,
  [searchNotes.definition.name]: searchNotes,
  [getTasks.definition.name]: getTasks,
  [getResearch.definition.name]: getResearch,
  [getConnections.definition.name]: getConnections,
  [createVaultNoteTool.definition.name]: createVaultNoteTool
};

const FORBIDDEN_DESTRUCTIVE_TOOLS = new Set([
  'delete_note',
  'delete_project',
  'delete_task',
  'delete_research',
  'purge_trash',
  'manage_permissions',
  'update_user_role',
  'revoke_sessions',
  'export_database',
  'modify_security_settings'
]);

function listTools() {
  return Object.values(tools).map(t => t.definition);
}

function normalizeMcpContext(userOrId, meta = {}) {
  if (typeof userOrId === 'object' && userOrId !== null) {
    const enabled = Array.isArray(userOrId.enabledProjects)
      ? userOrId.enabledProjects.map(Number).filter(Boolean)
      : [];
    return {
      id: Number(userOrId.id),
      email: userOrId.email || null,
      role: userOrId.role || 'user',
      scope: userOrId.scope === 'read_write' ? 'read_write' : 'read_only',
      enabledProjects: enabled,
      enforceProjectAllowlist: true,
      ip: meta.ip || null
    };
  }
  return {
    id: Number(userOrId),
    email: null,
    role: 'user',
    scope: 'read_only',
    enabledProjects: [],
    enforceProjectAllowlist: true,
    ip: meta.ip || null
  };
}

function assertProjectAllowedInMcp(mcpContext, projectId) {
  if (projectId === undefined || projectId === null || projectId === '') return;
  const pid = Number(projectId);
  if (!Number.isInteger(pid) || pid <= 0) {
    const err = new Error('Invalid project_id parameter');
    err.status = 400;
    err.eventType = 'MCP_INVALID_ARGUMENTS';
    throw err;
  }
  if (!mcpContext.enabledProjects.includes(pid)) {
    const err = new Error(`Project ${pid} is not enabled for MCP access in your AI boundary settings`);
    err.status = 403;
    err.eventType = 'MCP_PROJECT_SCOPE_DENIED';
    throw err;
  }
}

async function callTool(userOrId, toolName, args = {}, meta = {}) {
  const mcpContext = normalizeMcpContext(userOrId, meta);
  if (!mcpContext.id) {
    const err = new Error('Authentication required for MCP execution');
    err.status = 401;
    err.eventType = 'MCP_AUTH_REQUIRED';
    throw err;
  }

  if (FORBIDDEN_DESTRUCTIVE_TOOLS.has(toolName)) {
    const err = new Error(`Destructive or privilege-modifying operation "${toolName}" is permanently prohibited via MCP`);
    err.status = 403;
    err.eventType = 'MCP_DESTRUCTIVE_TOOL_BLOCKED';
    throw err;
  }

  const tool = tools[toolName];
  if (!tool) {
    const err = new Error(`Unknown or unsupported MCP tool: ${toolName}`);
    err.status = 400;
    err.eventType = 'MCP_UNKNOWN_TOOL_REJECTED';
    throw err;
  }

  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    const err = new Error('Tool arguments must be a valid JSON object');
    err.status = 400;
    err.eventType = 'MCP_INVALID_ARGUMENTS';
    throw err;
  }

  // Enforce enabledProjects boundary whenever project_id is provided
  if (args.project_id !== undefined && args.project_id !== null) {
    assertProjectAllowedInMcp(mcpContext, args.project_id);
  }

  const rawResult = await tool.execute(mcpContext.id, args, mcpContext);

  await SecurityService.logSecurityEvent({
    userId: mcpContext.id,
    eventType: 'MCP_TOOL_CALLED',
    severity: 'info',
    ip: mcpContext.ip,
    targetType: 'mcp_tool',
    targetId: toolName,
    details: {
      scope: mcpContext.scope,
      project_id: args.project_id || null
    }
  });

  return SecurityService.wrapUntrustedWorkspaceData(toolName, rawResult);
}

module.exports = {
  listTools,
  callTool
};
