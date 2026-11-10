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

// -----------------------------------------------------------------------------
// MCP Stdio Server Bridge for Claude Desktop / External MCP Clients
// -----------------------------------------------------------------------------
async function startStdioServer() {
  const apiUrlRaw = process.env.FLOWDEN_API_URL;
  const apiKey = process.env.FLOWDEN_API_KEY;

  if (!apiUrlRaw || !apiKey) {
    console.error('[FLOWDEN MCP ERROR] Both FLOWDEN_API_URL and FLOWDEN_API_KEY environment variables are required.');
    if (!apiUrlRaw) console.error('[FLOWDEN MCP ERROR] Missing FLOWDEN_API_URL (e.g., http://127.0.0.1:3000/mcp)');
    if (!apiKey) console.error('[FLOWDEN MCP ERROR] Missing FLOWDEN_API_KEY (personal access key starting with fld_mcp_)');
    process.exit(1);
  }

  const apiUrl = apiUrlRaw.replace(/\/+$/, '');
  const toolsUrl = `${apiUrl}/tools`;
  const callUrl = `${apiUrl}/call`;

  console.error(`[FLOWDEN MCP] Fetching tool definitions from ${toolsUrl}...`);

  let toolsList = [];
  try {
    const res = await fetch(toolsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[FLOWDEN MCP ERROR] Failed to fetch tools from ${toolsUrl}: HTTP ${res.status} ${res.statusText}. ${errBody}`);
      process.exit(1);
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.tools)) {
      console.error('[FLOWDEN MCP ERROR] Invalid tools response format from Flowden server.');
      process.exit(1);
    }
    toolsList = data.tools;
  } catch (err) {
    console.error(`[FLOWDEN MCP ERROR] Network error connecting to Flowden at ${toolsUrl}: ${err.message}`);
    process.exit(1);
  }

  console.error(`[FLOWDEN MCP] Discovered ${toolsList.length} tool(s) from Flowden backend.`);

  const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
  const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

  const server = new Server(
    {
      name: 'flowden',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  const mcpTools = toolsList.map(t => {
    const schema = t.inputSchema || t.parameters || { type: 'object', properties: {} };
    return {
      name: t.name,
      description: t.description || '',
      inputSchema: {
        type: 'object',
        properties: schema.properties || {},
        ...(Array.isArray(schema.required) ? { required: schema.required } : {})
      }
    };
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: mcpTools
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: toolArgs } = request.params || {};
    try {
      const callRes = await fetch(callUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          name,
          arguments: toolArgs || {}
        })
      });

      const data = await callRes.json().catch(() => null);

      if (!callRes.ok || (data && data.status === 'error')) {
        const errMsg = (data && (data.error || data.message))
          ? (data.error || data.message)
          : `HTTP ${callRes.status}: ${callRes.statusText || 'Tool execution failed'}`;
        console.error(`[FLOWDEN MCP Error] Tool "${name}" execution failed:`, errMsg);

        return {
          content: [
            {
              type: 'text',
              text: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg, null, 2)
            }
          ],
          isError: true
        };
      }

      const resultPayload = data && data.result !== undefined ? data.result : data;
      const textOutput = typeof resultPayload === 'string'
        ? resultPayload
        : JSON.stringify(resultPayload, null, 2);

      return {
        content: [
          {
            type: 'text',
            text: textOutput
          }
        ],
        isError: false
      };
    } catch (err) {
      console.error(`[FLOWDEN MCP Exception] Tool "${name}" call failed:`, err.message);
      return {
        content: [
          {
            type: 'text',
            text: `Tool execution failed: ${err.message}`
          }
        ],
        isError: true
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[FLOWDEN MCP] Stdio server connected and listening for MCP client requests.');
}

if (require.main === module) {
  startStdioServer().catch(err => {
    console.error('[FLOWDEN MCP FATAL]', err);
    process.exit(1);
  });
}
