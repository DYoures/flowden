# Flowden — Model Context Protocol (MCP) Architecture

Flowden exposes standardized, permission-gated tools via the Model Context Protocol (MCP) to connect external agentic reasoning models (e.g. Anthropic Claude Desktop, Google Antigravity, Cursor) directly to your project knowledge.

---

## 1. Core Principles

1. **Strict User Authorization**: MCP queries are strictly scoped to the authenticated user and explicitly authorized projects.
2. **Anti-Hallucination & Anti-Fake**: Flowden never fabricates simulated responses. If no external model provider or MCP client is connected, the UI explicitly indicates `Architecture Ready · Unconfigured`.
3. **Read-Only by Default**: Tools defaults to non-destructive inspection. Mutation tools require explicit user scope approval.

---

## 2. Standardized Primitives (Tool Catalog)

| Tool Name | Scope | Purpose |
|---|---|---|
| `read_project_context` | `read:projects` | Retrieves project briefs, spatial board cards, and decision logs (ADRs). |
| `search_vault_knowledge` | `read:notes` | Semantic and keyword search across markdown notes, folders, and `[[wikilinks]]`. |
| `get_workflow_tasks` | `read:tasks` | Queries prioritized task deliverables across Planned, In Progress, and Done. |
| `get_research_sources` | `read:research` | Extracts indexed literature citations, summaries, and extracted text. |
| `get_knowledge_connections` | `read:connections` | Queries the bi-directional graph topology and typed relationship wires. |

---

## 3. Configuration in External MCP Clients

Add Flowden to your client configuration (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "flowden": {
      "command": "node",
      "args": ["server/mcp/index.js"],
      "env": {
        "FLOWDEN_API_URL": "http://localhost:3000/api/v1",
        "FLOWDEN_API_KEY": "your_personal_access_token"
      }
    }
  }
}
```

---

## 4. Security & Permissions

All incoming MCP requests must pass through `server/mcp/middleware/mcpAuth.js`, validating the API token and ensuring user isolation.

