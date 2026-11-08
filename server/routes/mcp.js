// MCP HTTP Router
const express = require('express');
const mcp = require('../mcp');
const mcpAuth = require('../mcp/middleware/mcpAuth');
const SecurityService = require('../services/securityService');

const router = express.Router();

// GET /mcp/tools (Public discovery of capabilities)
router.get('/tools', (req, res) => {
  res.json({
    protocol: 'flowden-mcp-v1',
    server: 'FLOWDEN Knowledge Engine',
    security: {
      authentication: 'Bearer API Key required for /mcp/call',
      default_scope: 'read_only',
      project_isolation: 'enforced',
      prompt_injection_boundary: 'active',
      audit_logging: 'active'
    },
    tools: mcp.listTools()
  });
});

// POST /mcp/call (Authenticated tool execution)
router.post('/call', mcpAuth, async (req, res) => {
  try {
    const { name, arguments: toolArgs = {} } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Tool name is required' });
    }
    if (toolArgs !== null && (typeof toolArgs !== 'object' || Array.isArray(toolArgs))) {
      return res.status(400).json({ error: 'Tool arguments must be a JSON object' });
    }

    const result = await mcp.callTool(req.mcpUser, name, toolArgs || {}, { ip: req.ip });
    res.json({
      tool: name,
      status: 'success',
      result
    });
  } catch (err) {
    const status = err.status || 400;
    await SecurityService.logSecurityEvent({
      userId: req.mcpUser ? req.mcpUser.id : null,
      eventType: err.eventType || 'MCP_TOOL_CALL_REJECTED',
      severity: status === 403 ? 'high' : 'warning',
      ip: req.ip,
      targetType: 'mcp_tool',
      targetId: req.body && req.body.name ? String(req.body.name) : 'unknown',
      details: { error: err.message }
    });
    res.status(status).json({
      tool: req.body?.name,
      status: 'error',
      error: err.message
    });
  }
});

module.exports = router;
