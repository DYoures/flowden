// Flowden AI Assistant & Knowledge Exchange Interface
// Architecture: Three Distinct Views (Overview | MCP Integration | Knowledge Exchange)
// Design: Minimalist · Modern · Premium · Structured · Knowledge-Focused
// Accent: Muted Teal (#78C8B2) · Surfaces: Deep Charcoal (#191D20), Neutral Grays

const UNIVERSAL_RESEARCH_PROMPT = `Research this topic thoroughly. Follow the attached FLOWDEN_RESEARCH_SPEC.md exactly. Organize the findings into multiple focused, interconnected Notes using Flowden's required Markdown structure. Preserve reliable sources, citations, and relationships. Deliver one downloadable structured \`.md\` document or a complete \`.flowden.zip\` package.

Topic: [INSERT RESEARCH TOPIC]`;

async function renderAssistantPage(container) {
  if (!container) {
    container = document.getElementById('page-container') || document.getElementById('app-content');
  }
  const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';
  const esc = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let user = (window.Auth && window.Auth.getUser && window.Auth.getUser()) || {};
  let projects = [];
  let securityEvents = [];

  try {
    const [meRes, pRes, evRes] = await Promise.all([
      window.API.get('/users/me').catch(() => ({ user })),
      window.API.get('/projects').catch(() => ({ projects: [] })),
      window.API.get('/users/security-events?limit=8').catch(() => ({ events: [] }))
    ]);
    if (meRes && meRes.user) user = meRes.user;
    projects = (pRes && pRes.projects) || [];
    securityEvents = (evRes && evRes.events) || [];
  } catch (e) {}

  let userSettings = {};
  try {
    userSettings = typeof user.settings_json === 'string'
      ? JSON.parse(user.settings_json || '{}')
      : (user.settings_json || {});
  } catch (e) {
    userSettings = {};
  }

  const mcpConfig = userSettings.mcp || {
    serverUrl: 'http://localhost:3000/mcp',
    apiKey: '',
    scope: 'read_only',
    enabledProjects: []
  };

  const isConfigured = Boolean(mcpConfig.apiKey || mcpConfig.hasApiKey);
  const origin = (typeof window !== 'undefined' && window.location.origin) ? window.location.origin : 'http://localhost:3000';
  const mcpServerUrl = mcpConfig.serverUrl || `${origin}/mcp`;
  const displayedApiKey = mcpConfig.apiKey || mcpConfig.apiKeyMasked || '';

  const enabledCount = Array.isArray(mcpConfig.enabledProjects)
    ? mcpConfig.enabledProjects.filter(id => projects.some(p => p.id === id)).length
    : projects.length;

  const statusBadge = (state, label) => {
    const map = {
      active: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)', color: 'var(--status-success, #10b981)' },
      config_required: { bg: 'rgba(224, 160, 64, 0.12)', border: 'rgba(224, 160, 64, 0.35)', color: 'var(--status-warning, #e0a040)' },
      not_configured: { bg: 'rgba(148, 163, 184, 0.10)', border: 'rgba(148, 163, 184, 0.28)', color: 'var(--text-secondary, #94a3b8)' },
      not_available: { bg: 'rgba(224, 82, 77, 0.10)', border: 'rgba(224, 82, 77, 0.30)', color: 'var(--status-error, #e0524d)' }
    };
    const st = map[state] || map.not_configured;
    return `<span class="badge sec-status-pill" data-status="${state}" style="display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:var(--radius-sm);font-size:11px;font-weight:500;background:${st.bg};border:1px solid ${st.border};color:${st.color};white-space:nowrap;"><span style="width:5px;height:5px;border-radius:50%;background-color:${st.color};"></span><span>${esc(label)}</span></span>`;
  };

  container.innerHTML = `
    <div class="assistant-page-container" style="padding: var(--space-6); max-width: 1040px; margin: 0 auto; box-sizing: border-box;">
      
      <!-- Sticky Navigation Bar (Three Navigable Views) -->
      <div class="assistant-tabs-wrapper" style="position: sticky; top: 0; z-index: 25; margin: -24px -24px var(--space-6) -24px; padding: 12px 24px; background: var(--assistant-sticky-bg, rgba(25, 29, 32, 0.95)); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-bottom: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3);">
        <nav class="assistant-tab-bar" id="assistant-sticky-nav" role="tablist" aria-label="AI Assistant Views" style="display: flex; align-items: center; gap: 4px; background-color: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-md); padding: 3px;">
          <a href="#ai-overview" class="assistant-nav-tab active assistant-nav-link" data-target="ai-overview" id="tab-btn-overview" role="tab" aria-selected="true" aria-controls="ai-overview" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: var(--radius-sm); font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); text-decoration: none; border: 1px solid var(--border-primary); background-color: var(--bg-elevated); cursor: pointer; transition: all var(--transition-fast);">
            ${getIcon('layout-grid')} <span>Overview</span>
          </a>
          <a href="#mcp-integration" class="assistant-nav-tab assistant-nav-link" data-target="mcp-integration" id="tab-btn-mcp" role="tab" aria-selected="false" aria-controls="mcp-integration" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: var(--radius-sm); font-size: var(--text-xs); font-weight: 600; color: var(--text-secondary); text-decoration: none; border: 1px solid transparent; background-color: transparent; cursor: pointer; transition: all var(--transition-fast);">
            ${getIcon('settings')} <span>MCP Integration</span>
            <span class="nav-tab-indicator ${isConfigured ? 'nav-tab-indicator--active' : 'nav-tab-indicator--warning'}" style="width: 6px; height: 6px; border-radius: 50%; background-color: ${isConfigured ? 'var(--status-success)' : 'var(--status-warning)'};"></span>
          </a>
          <a href="#knowledge-exchange" class="assistant-nav-tab assistant-nav-link" data-target="knowledge-exchange" id="tab-btn-exchange" role="tab" aria-selected="false" aria-controls="knowledge-exchange" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: var(--radius-sm); font-size: var(--text-xs); font-weight: 600; color: var(--text-secondary); text-decoration: none; border: 1px solid transparent; background-color: transparent; cursor: pointer; transition: all var(--transition-fast);">
            ${getIcon('share-2')} <span>Knowledge Exchange</span>
            <span style="font-size: 10px; font-family: var(--font-mono); padding: 1px 5px; border-radius: 3px; background-color: var(--bg-tertiary); color: var(--brand-teal); border: 1px solid rgba(120, 200, 178, 0.25);">FKF 2.0</span>
          </a>
        </nav>
        
        <div class="assistant-header-badges" style="display: flex; align-items: center; gap: var(--space-2);">
          <button class="btn btn--secondary btn--sm" id="btn-header-mcp-guide" type="button" title="View step-by-step MCP setup guide" style="display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-xs);">
            ${getIcon('book-open')} <span>MCP Guide</span>
          </button>
          <span class="badge" id="mcp-status-badge" style="${isConfigured ? 'background-color: var(--status-success-bg); color: var(--status-success); border: 1px solid rgba(16,185,129,0.3);' : 'background-color: var(--status-warning-bg); color: var(--status-warning); border: 1px solid rgba(224,160,64,0.2);'}; font-size: 11px; padding: 3px 8px;">
            ${isConfigured ? `<span style="display:inline-flex; align-items:center; gap:4px;">${getIcon('check')} MCP Server Ready: Configured</span>` : 'Architecture Ready: Unconfigured'}
          </span>
        </div>
      </div>

      <!-- Page Title & Header -->
      <div class="assistant-page-header" style="margin-bottom: var(--space-6);">
        <h1 class="assistant-page-title" style="font-family: var(--font-heading); font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); margin: 0 0 4px 0; letter-spacing: -0.015em; display: flex; align-items: center; gap: 8px;">
          <span style="color: var(--accent-deep, var(--brand-teal)); display: inline-flex;">${getIcon('bot')}</span>
          <span>AI Assistant</span>
        </h1>
        <p class="assistant-page-desc" style="font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--lh-relaxed); margin: 0; max-width: 720px;">
          Connect external AI tools to your workspace or transform AI research into structured knowledge inside Flowden.
        </p>
      </div>

      <!-- =================================================================== -->
      <!-- VIEW A: OVERVIEW PANEL (#ai-overview)                               -->
      <!-- =================================================================== -->
      <section id="ai-overview" class="assistant-view-panel active" role="tabpanel" aria-labelledby="tab-btn-overview" style="margin-bottom: var(--space-8);">
        
        <div style="margin-bottom: var(--space-4);">
          <h2 style="font-size: var(--text-md); font-weight: 600; color: var(--text-primary); margin: 0 0 2px 0;">Workspace AI Systems Overview</h2>
          <p class="text-xs text-secondary" style="margin: 0; line-height: 1.5;">Two complementary, independent capabilities for external AI collaboration:</p>
        </div>

        <!-- Two Primary Capabilities Side-by-Side -->
        <div class="assistant-overview-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-6);">
          
          <!-- Card 1: Model Context Protocol (MCP) -->
          <div class="card assistant-capability-card" style="padding: var(--space-5); background-color: var(--bg-secondary); border: 1px solid var(--border-primary); display: flex; flex-direction: column; justify-content: space-between; border-radius: var(--radius-md); transition: border-color var(--transition-fast);">
            <div class="assistant-capability-body">
              <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-3);">
                <div style="display: flex; align-items: center; gap: var(--space-2);">
                  <div class="assistant-card-icon" style="width: 32px; height: 32px; border-radius: var(--radius-sm); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: center; color: var(--accent-primary); flex-shrink: 0;">
                    ${getIcon('settings')}
                  </div>
                  <div>
                    <h3 style="font-size: var(--text-base); font-weight: 600; margin: 0; color: var(--text-primary);">MCP Integration</h3>
                    <span class="text-xs text-secondary">Live Contextual Bridge</span>
                  </div>
                </div>
                ${isConfigured ? statusBadge('active', 'Active: Configured') : statusBadge('config_required', 'Configuration Required')}
              </div>
              <p class="text-xs text-secondary" style="line-height: 1.6; margin-bottom: var(--space-3);">
                Connect external reasoning tools (such as Claude Desktop, Cursor, or custom IDE agents) directly to Flowden through the Model Context Protocol. External models query project briefs, search vault notes, and retrieve literature citations in real-time under strict boundary enforcement.
              </p>
              <ul class="assistant-capability-features" style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65; padding-left: 18px; margin: 0;">
                <li>Constant-time Bearer token verification at <code>/mcp/tools</code> and <code>/mcp/call</code></li>
                <li>Safe default <code>read_only</code> scope with explicit <code>confirm: true</code> for note creation</li>
                <li>Strict project workspace allowlists (<code>enabledProjects</code>)</li>
                <li>Automatic secret redaction and untrusted data boundary framing</li>
              </ul>
            </div>
            <div class="assistant-capability-actions" style="margin-top: var(--space-4); pt: var(--space-3); border-top: 1px solid var(--border-secondary);">
              <button type="button" class="btn btn--secondary btn--sm assistant-jump-btn" data-target="mcp-integration" id="btn-overview-to-mcp" style="display: inline-flex; align-items: center; gap: 6px; width: 100%; justify-content: center;">
                ${getIcon('settings')} <span>Configure MCP Bridge & Permissions</span>
              </button>
            </div>
          </div>

          <!-- Card 2: Knowledge Exchange -->
          <div class="card assistant-capability-card" style="padding: var(--space-5); background-color: var(--bg-secondary); border: 1px solid var(--border-primary); display: flex; flex-direction: column; justify-content: space-between; border-radius: var(--radius-md); transition: border-color var(--transition-fast);">
            <div class="assistant-capability-body">
              <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-3);">
                <div style="display: flex; align-items: center; gap: var(--space-2);">
                  <div class="assistant-card-icon" style="width: 32px; height: 32px; border-radius: var(--radius-sm); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: center; color: var(--brand-teal); flex-shrink: 0;">
                    ${getIcon('share-2')}
                  </div>
                  <div>
                    <h3 style="font-size: var(--text-base); font-weight: 600; margin: 0; color: var(--text-primary);">Knowledge Exchange</h3>
                    <span class="text-xs text-secondary">FKF 2.0 Standard (.fkf, FKF v1.0.0 Standard Supported)</span>
                  </div>
                </div>
                ${statusBadge('active', 'FKF 2.0 Active')}
              </div>
              <p class="text-xs text-secondary" style="line-height: 1.6; margin-bottom: var(--space-3);">
                Transfer complete, interconnected research workspaces between external AI engines (Claude, ChatGPT, NotebookLM) and Flowden using the open Flowden Knowledge Format (<code>.fkf</code>) and package standard (<code>.flowden.zip</code>). Synthesizes multi-document research into structured, relational knowledge.
              </p>
              <ul class="assistant-capability-features" style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65; padding-left: 18px; margin: 0;">
                <li>Standardized package specification and strict JSON Schema contract</li>
                <li>Converts AI findings into canonical Notes, Sources, Excerpts, Tasks & Graphs</li>
                <li>Safe archive pre-inspection: zip-bomb defense & magic-byte scanning</li>
                <li>Transactional crash-safe database importer engine with zero partial writes</li>
              </ul>
            </div>
            <div class="assistant-capability-actions" style="display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-4); pt: var(--space-3); border-top: 1px solid var(--border-secondary);">
              <button type="button" class="btn btn--primary btn--sm" id="btn-top-import-package" style="background-color: var(--brand-teal); border-color: var(--brand-teal); color: #0d1117; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; flex: 1; justify-content: center;">
                ${getIcon('upload')} <span>Import Package</span>
              </button>
              <button type="button" class="btn btn--secondary btn--sm btn-download-resource" data-resource="research-spec" data-filename="FLOWDEN_RESEARCH_SPEC.md" style="display: inline-flex; align-items: center; gap: 6px; flex: 1; justify-content: center;">
                ${getIcon('download')} <span>Download Spec</span>
              </button>
              <button type="button" class="btn btn--secondary btn--sm assistant-jump-btn" data-target="knowledge-exchange" id="btn-overview-to-ke" style="display: inline-flex; align-items: center; gap: 6px; width: 100%; justify-content: center; margin-top: 2px;">
                ${getIcon('book-open')} <span>View Specification & Architecture</span>
              </button>
            </div>
          </div>

        </div>

        <!-- Quick Status Strip -->
        <div class="assistant-status-strip" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3); padding: var(--space-3) var(--space-4); background-color: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm);">
          <div style="display: flex; align-items: center; gap: var(--space-3);">
            <span style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); display: inline-flex; align-items: center; gap: 6px;">
              ${getIcon('shield-check')} <span>Workspace AI Status</span>
            </span>
            <span class="text-xs text-secondary">
              MCP: <strong>${isConfigured ? 'Active & Enforced' : 'Configuration Required'}</strong> · 
              Knowledge Exchange: <strong>FKF v1.0.0 Active</strong> · 
              Importer: <strong>Implemented & Verified</strong>
            </span>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            ${isConfigured ? statusBadge('active', 'MCP Configured') : statusBadge('config_required', 'MCP Unconfigured')}
            ${statusBadge('active', 'Exchange Active')}
          </div>
        </div>

      </section>

      <!-- =================================================================== -->
      <!-- VIEW B: MCP INTEGRATION PANEL (#mcp-integration)                   -->
      <!-- =================================================================== -->
      <section id="mcp-integration" class="assistant-view-panel" role="tabpanel" aria-labelledby="tab-btn-mcp" style="margin-bottom: var(--space-8); display: none;">
        
        <div style="margin-bottom: var(--space-4); padding-bottom: var(--space-2); border-bottom: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2);">
          <div>
            <h2 style="font-size: var(--text-lg); font-weight: 600; color: var(--text-primary); margin: 0 0 2px 0; display: flex; align-items: center; gap: 8px;">
              <span style="color: var(--accent-primary);">${getIcon('settings')}</span>
              <span>Model Context Protocol (MCP) Integration</span>
            </h2>
            <p class="text-xs text-secondary" style="margin: 0;">Live contextual query bridge and defense-in-depth permission boundaries for external reasoning models.</p>
          </div>
          ${isConfigured ? statusBadge('active', 'Active: Configured') : statusBadge('config_required', 'Configuration Required')}
        </div>

        <!-- Section 1: Real Connection Status Bar -->
        <div class="assistant-card" style="padding: var(--space-4) var(--space-5); margin-bottom: var(--space-5); background-color: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-md);">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3);">
            <div style="display: flex; align-items: center; gap: var(--space-3);">
              <div style="width: 32px; height: 32px; border-radius: var(--radius-sm); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: center; color: ${isConfigured ? 'var(--status-success)' : 'var(--status-warning)'}; flex-shrink: 0;">
                ${isConfigured ? getIcon('check') : getIcon('alert-circle')}
              </div>
              <div>
                <div style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary);">
                  ${isConfigured ? 'MCP Live Endpoint Configured' : 'MCP Access Key Required'}
                </div>
                <div class="text-xs text-secondary">
                  ${isConfigured 
                    ? `Scope: <code>${esc(mcpConfig.scope)}</code> · ${enabledCount} of ${projects.length} project workspace(s) authorized`
                    : 'Generate a personal access token below to connect Claude Desktop, Cursor, or external IDE tools.'}
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              ${isConfigured ? statusBadge('active', 'Ready for Queries') : statusBadge('config_required', 'Setup Needed')}
            </div>
          </div>
        </div>

        <!-- Section 2: Connection Configuration Settings Panel -->
        <div class="assistant-card" style="padding: var(--space-5); background-color: var(--bg-secondary); border: 1px solid var(--border-primary); margin-bottom: var(--space-6); border-radius: var(--radius-md);">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4);">
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <span style="color: var(--accent-primary);">${getIcon('settings')}</span>
              <h3 style="font-size: var(--text-md); font-weight: 600; color: var(--text-primary); margin: 0;">MCP Access & Context Boundary Configuration</h3>
            </div>
            <div style="display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap;">
              ${isConfigured ? statusBadge('active', 'Active: Key Configured') : statusBadge('config_required', 'Configuration required')}
              <button class="btn btn--secondary btn--sm" id="btn-generate-mcp-key" type="button">
                ${getIcon('plus')} Generate New Key
              </button>
              ${isConfigured ? `
                <button class="btn btn--secondary btn--sm" id="btn-disconnect-mcp" type="button" style="color: var(--status-error); border-color: rgba(224, 82, 77, 0.3);">
                  ${getIcon('trash')} Disconnect MCP
                </button>
              ` : ''}
            </div>
          </div>

          <form id="form-mcp-config">
            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label" for="mcp-server-url" style="font-size: var(--text-xs); font-weight: 600; margin-bottom: 4px; display: block;">MCP Server Endpoint URL</label>
              <input type="text" id="mcp-server-url" class="input input--compact" value="${esc(mcpServerUrl)}" style="font-family: var(--font-mono); font-size: 12px; width: 100%; box-sizing: border-box;" />
              <span class="form-hint" style="font-size: 11px; color: var(--text-secondary); margin-top: 4px; display: block;">HTTP endpoint consumed by external MCP clients, Claude Desktop, or developer agents.</span>
            </div>

            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label" for="mcp-api-key" style="font-size: var(--text-xs); font-weight: 600; margin-bottom: 4px; display: block;">Personal Access Key / Bearer Token</label>
              <div style="display: flex; gap: var(--space-2);">
                <input type="text" id="mcp-api-key" class="input input--compact" value="${esc(displayedApiKey)}" placeholder="Click 'Generate New Key' to issue token" style="font-family: var(--font-mono); font-size: 12px; flex: 1;" />
                <button type="button" class="btn btn--secondary btn--sm" id="btn-copy-mcp-key" title="Copy Token">
                  ${getIcon('file-text')} <span>Copy Key</span>
                </button>
              </div>
              <span class="form-hint" style="font-size: 11px; color: var(--text-secondary); margin-top: 4px; display: block;">Supplied in the <code>Authorization: Bearer &lt;token&gt;</code> HTTP header by external clients. Verified via constant-time comparison.</span>
            </div>

            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label" for="mcp-scope-select" style="font-size: var(--text-xs); font-weight: 600; margin-bottom: 4px; display: block;">Access Permission Level</label>
              <select id="mcp-scope-select" class="select" style="font-size: var(--text-xs); width: 100%;">
                <option value="read_only" ${mcpConfig.scope === 'read_only' ? 'selected' : ''}>Strict Read-Only (Safe default: queries and search only)</option>
                <option value="read_write" ${mcpConfig.scope === 'read_write' ? 'selected' : ''}>Read & Suggest (Requires explicit confirm: true for note creation)</option>
              </select>
              <span class="form-hint" style="font-size: 11px; color: var(--text-secondary); margin-top: 4px; display: block;">Read-Only mode blocks all mutating MCP tools with HTTP 403 Forbidden.</span>
            </div>

            <div class="form-group" style="margin-bottom: var(--space-4);">
              <label class="form-label" style="font-size: var(--text-xs); font-weight: 600; margin-bottom: 4px; display: block;">Authorized Project Workspaces</label>
              <div style="display: flex; flex-direction: column; gap: 6px; padding: var(--space-3); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm); max-height: 150px; overflow-y: auto;">
                ${projects.length === 0 ? `<span class="text-xs text-secondary">No projects created yet.</span>` : projects.map(p => {
                  const isChecked = !mcpConfig.projectFilterActive
                    ? (!mcpConfig.enabledProjects || mcpConfig.enabledProjects.length === 0 || mcpConfig.enabledProjects.includes(p.id))
                    : (Array.isArray(mcpConfig.enabledProjects) && mcpConfig.enabledProjects.includes(p.id));
                  return `
                    <label style="display: flex; align-items: center; gap: 8px; font-size: var(--text-xs); color: var(--text-primary); cursor: pointer;">
                      <input type="checkbox" class="mcp-project-cb mcp-project-checkbox" value="${p.id}" ${isChecked ? 'checked' : ''} />
                      <span>${esc(p.title)}</span>
                    </label>
                  `;
                }).join('')}
              </div>
              <span class="form-hint" style="font-size: 11px; color: var(--text-secondary); margin-top: 4px; display: block;">Strict boundary: Unchecked projects are blocked across all MCP tools (<code>403 Project is not enabled for MCP access</code>).</span>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--border-primary);">
              <button type="button" class="btn btn--secondary btn--md" id="btn-test-mcp-connection">
                ${getIcon('shield-check')} <span>Test Live Connection</span>
              </button>
              <button type="submit" class="btn btn--primary btn--md" id="btn-save-mcp-settings">
                ${getIcon('check')} <span>Save Configuration</span>
              </button>
            </div>
          </form>

          <!-- Test Connection Live Output Container -->
          <div id="mcp-test-results" style="display: none; margin-top: var(--space-4); padding: var(--space-4); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);"></div>
        </div>

        <!-- Section 3: Available MCP Tools (Compact, Readable Catalog) -->
        <div class="assistant-card" style="margin-bottom: var(--space-6); padding: var(--space-5); background-color: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-md);">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3);">
            <div>
              <h3 style="font-size: var(--text-md); font-weight: var(--font-semibold); margin: 0 0 2px 0;">Model Context Protocol (MCP) Bridge & Tool Catalog</h3>
              <p class="text-xs text-secondary" style="margin: 0;">External reasoning models can inspect and call these 6 registered tools via HTTP/JSON at <code>/mcp/tools</code> and <code>/mcp/call</code>:</p>
            </div>
            ${statusBadge('active', 'Active')}
          </div>

          <div class="assistant-tools-catalog" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-3);">
            <div class="assistant-tool-item" style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                <code style="font-size: 11px; color: var(--accent-primary); font-weight: 600;">read_project_context</code>
                <span class="badge" style="font-size: 9px;">read:projects</span>
              </div>
              <div class="text-xs text-secondary">Queries project briefs, spatial canvas cards, and recent notes for an allowed project.</div>
            </div>

            <div class="assistant-tool-item" style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                <code style="font-size: 11px; color: var(--brand-teal); font-weight: 600;">search_vault_knowledge</code>
                <span class="badge" style="font-size: 9px;">read:notes</span>
              </div>
              <div class="text-xs text-secondary">Full-text search across markdown notes, tags, and wikilinks within allowed projects.</div>
            </div>

            <div class="assistant-tool-item" style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                <code style="font-size: 11px; color: var(--status-warning); font-weight: 600;">get_research_sources</code>
                <span class="badge" style="font-size: 9px;">read:research</span>
              </div>
              <div class="text-xs text-secondary">Retrieves literature citations, abstracts, and extracted summaries from the Research Bridge.</div>
            </div>

            <div class="assistant-tool-item" style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                <code style="font-size: 11px; color: var(--status-success); font-weight: 600;">get_workflow_tasks</code>
                <span class="badge" style="font-size: 9px;">read:tasks</span>
              </div>
              <div class="text-xs text-secondary">Returns deliverables, milestone statuses, and priority flags across permitted projects.</div>
            </div>

            <div class="assistant-tool-item" style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                <code style="font-size: 11px; color: var(--brand-teal); font-weight: 600;">get_knowledge_connections</code>
                <span class="badge" style="font-size: 9px;">read:connections</span>
              </div>
              <div class="text-xs text-secondary">Queries bi-directional graph topology and typed relationship links between user entities.</div>
            </div>

            <div class="assistant-tool-item" style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                <code style="font-size: 11px; color: var(--accent-primary); font-weight: 600;">create_vault_note</code>
                <span class="badge" style="font-size: 9px;">write:confirmed</span>
              </div>
              <div class="text-xs text-secondary">Proposes or creates a note only when <code>read_write</code> scope and <code>confirm: true</code> are provided.</div>
            </div>
          </div>
        </div>

        <!-- Section 4: Security Commitments & Enforcement Card -->
        <div class="card assistant-card" id="security-commitments-section" style="padding: var(--space-5); margin-bottom: var(--space-6); background-color: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-md);">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-2);">
            <h3 style="font-size: var(--text-md); font-weight: var(--font-semibold); margin: 0;">Workspace Intelligence & Security Commitments & Enforcement</h3>
            ${statusBadge('active', 'Active: Backend Enforced')}
          </div>
          <p class="text-secondary text-xs" style="line-height: var(--lh-relaxed); margin-bottom: var(--space-4);">
            Flowden adheres to strict anti-hallucination and defense-in-depth standards. Rather than embedding an ungrounded chat widget, Flowden provides a Model Context Protocol (MCP) foundation where every security guarantee is enforced on the backend at the database, file-system, and authentication boundaries.
          </p>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4);">
            <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <div style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; color: var(--status-success); margin-bottom: 6px; letter-spacing: 0.04em; display: flex; align-items: center; gap: 4px;">
                ${getIcon('check')} <span>What Flowden MCP Exposes</span>
              </div>
              <ul style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65; padding-left: 16px; margin: 0;">
                <li>Scoped project contexts, spatial boards, and architectural decisions for authorized projects in <code>enabledProjects</code>.</li>
                <li>Knowledge Vault markdown notes and bi-directional wikilinks filtered by <code>accessPredicate</code>.</li>
                <li>Research literature citations, abstracts, and extracted text within permitted project scopes.</li>
                <li>Workflow tasks and Knowledge Graph relationships owned by or shared with your account.</li>
                <li>Untrusted-content framing (<code>_security_boundary</code>) and automatic secret redaction on every tool response.</li>
              </ul>
            </div>

            <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <div style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; color: var(--brand-teal); margin-bottom: 6px; letter-spacing: 0.04em; display: flex; align-items: center; gap: 4px;">
                ${getIcon('shield-check')} <span>Security Commitments & Enforcement</span>
              </div>
              <ul style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65; padding-left: 16px; margin: 0;">
                <li><strong>No Unscoped Workspace Access:</strong> Enforced by SQL ownership checks (<code>user_id</code>), active <code>project_members</code> (<code>revoked_at IS NULL</code>), and MCP <code>enabledProjects</code> allowlist validation.</li>
                <li><strong>No Silent Mutations or Destructive AI Actions:</strong> Default MCP scope is <code>read_only</code>; write tools require <code>read_write</code> plus <code>confirm: true</code>, and destructive tools return <code>403 Forbidden</code>.</li>
                <li><strong>No Unauthenticated File or SSRF Exposure:</strong> <code>/uploads/*</code> requires authentication and ownership checks with <code>nosniff</code>; metadata fetching blocks localhost, private IPs, DNS rebinding, and unsafe redirects.</li>
                <li><strong>No Secret Leakage or Unaudited AI Calls:</strong> Passwords use <code>bcrypt</code> (12 rounds), MCP keys use constant-time verification, and every MCP call is logged in <code>security_audit_logs</code>.</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Section 5: Security, Privacy & Responsible AI (3 Grouped Pillars, 7 Subsections) -->
        <div class="assistant-card" id="security-privacy-responsible-ai-section" style="padding: var(--space-5); background-color: var(--bg-secondary); border: 1px solid var(--border-primary); margin-bottom: var(--space-6); border-radius: var(--radius-md);">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4);">
            <div>
              <h3 style="font-size: var(--text-md); font-weight: 600; color: var(--text-primary); margin: 0 0 4px 0;">Security, Privacy & Responsible AI</h3>
              <p class="text-xs text-secondary" style="margin: 0;">Defense-in-depth protections safeguarding workspace data, file attachments, external URL fetching, and MCP tool execution organized across three security pillars:</p>
            </div>
            ${statusBadge('active', 'Active: Defense-in-Depth')}
          </div>

          <!-- Pillar A: Workspace Access & Permissions -->
          <div class="assistant-sec-group" style="margin-bottom: var(--space-4);">
            <div class="assistant-sec-group-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: var(--space-3); padding-bottom: 6px; border-bottom: 1px solid var(--border-primary);">
              <span style="color: var(--brand-teal);">${getIcon('lock')}</span>
              <h4 class="assistant-sec-group-title" style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin: 0;">Pillar A: Workspace Access & Permissions</h4>
            </div>

            <!-- Subsection 1 -->
            <div class="sec-subsection-card" data-subsection="workspace-access" style="padding: var(--space-4); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                <div class="font-semibold text-sm" style="font-weight: 600; color: var(--text-primary);">1. Workspace Access Protection</div>
                ${statusBadge('active', 'Active')}
              </div>
              <p class="text-xs text-secondary" style="line-height: 1.6; margin: 0;">
                Every API route across Projects, Knowledge Vault Notes, Workflow Tasks, Spatial Boards, Research Bridge, Universal Search, and Knowledge Graph enforces authenticated session verification (<code>HTTP-only</code> cookies with <code>SameSite=Lax</code> and CSRF Origin checks), progressive login cooldowns against brute-force attempts, and strict row-level ownership (<code>user_id</code>) or active project membership (<code>project_members.revoked_at IS NULL</code>). Users can revoke all active sessions immediately at any time.
              </p>
            </div>

            <!-- Subsection 2 -->
            <div class="sec-subsection-card" data-subsection="mcp-boundaries" style="padding: var(--space-4); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                <div class="font-semibold text-sm" style="font-weight: 600; color: var(--text-primary);">2. MCP Permission Boundaries</div>
                ${isConfigured ? statusBadge('active', 'Active') : statusBadge('config_required', 'Configuration required')}
              </div>
              <p class="text-xs text-secondary" style="line-height: 1.6; margin: 0;">
                External AI tools cannot access Flowden without a valid user-generated MCP Bearer token verified via constant-time comparison (<code>crypto.timingSafeEqual</code>). By default, MCP operates in <code>read_only</code> mode and restricts queries to projects explicitly checked in your <code>enabledProjects</code> allowlist. Mutating calls (such as <code>create_vault_note</code>) require both <code>read_write</code> scope and explicit <code>confirm: true</code> approval; destructive operations are permanently blocked.
              </p>
            </div>
          </div>

          <!-- Pillar B: Data & File Protection -->
          <div class="assistant-sec-group" style="margin-bottom: var(--space-4);">
            <div class="assistant-sec-group-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: var(--space-3); padding-bottom: 6px; border-bottom: 1px solid var(--border-primary);">
              <span style="color: var(--brand-teal);">${getIcon('file-text')}</span>
              <h4 class="assistant-sec-group-title" style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin: 0;">Pillar B: Data & File Protection</h4>
            </div>

            <!-- Subsection 3 -->
            <div class="sec-subsection-card" data-subsection="data-secret-protection" style="padding: var(--space-4); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                <div class="font-semibold text-sm" style="font-weight: 600; color: var(--text-primary);">3. Data & Secret Protection</div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                  ${statusBadge('active', 'Active: Hashing & Redaction')}
                  ${statusBadge('not_configured', 'Not configured: Disk Encryption at Rest')}
                </div>
              </div>
              <p class="text-xs text-secondary" style="line-height: 1.6; margin: 0;">
                Account passwords are hashed with <code>bcrypt</code> (12 salt rounds) and <code>password_hash</code> is never returned in API responses. MCP keys are masked in profile payloads and can be rotated or disconnected on demand. Automatic redaction strips tokens, Bearer headers, and secret keys from audit logs and MCP payloads. Application-layer secret protection is <strong>Active</strong>; full database/disk encryption at rest depends on host infrastructure and is marked <strong>Not configured</strong> at the application layer.
              </p>
            </div>

            <!-- Subsection 4 -->
            <div class="sec-subsection-card" data-subsection="secure-file-handling" style="padding: var(--space-4); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                <div class="font-semibold text-sm" style="font-weight: 600; color: var(--text-primary);">4. Secure File Handling</div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                  ${statusBadge('active', 'Active: Signature & Access Checks')}
                  ${statusBadge('not_available', 'Not available: External Antivirus Engine')}
                </div>
              </div>
              <p class="text-xs text-secondary" style="line-height: 1.6; margin: 0;">
                Uploads enforce strict extension allowlists, file size caps (50 MB Vault, 25 MB Research), path sanitization, and server-side magic-byte inspection that blocks executables (<code>MZ</code>, <code>ELF</code>, Mach-O, shell shebangs), suspicious double extensions, and disguised active <code>HTML</code>/<code>SVG</code> scripts. Downloads under <code>/uploads/*</code> require authentication and ownership/project verification, serve with <code>X-Content-Type-Options: nosniff</code> and sandboxed CSP, and keep archives inert without server-side auto-extraction. External third-party antivirus scanning is <strong>Not available</strong>.
              </p>
            </div>
          </div>

          <!-- Pillar C: AI Safety & Accountability -->
          <div class="assistant-sec-group">
            <div class="assistant-sec-group-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: var(--space-3); padding-bottom: 6px; border-bottom: 1px solid var(--border-primary);">
              <span style="color: var(--brand-teal);">${getIcon('shield-check')}</span>
              <h4 class="assistant-sec-group-title" style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin: 0;">Pillar C: AI Safety & Accountability</h4>
            </div>

            <!-- Subsection 5 -->
            <div class="sec-subsection-card" data-subsection="prompt-injection-protection" style="padding: var(--space-4); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                <div class="font-semibold text-sm" style="font-weight: 600; color: var(--text-primary);">5. AI & Prompt Injection Protection</div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                  ${statusBadge('active', 'Active: Untrusted Data Framing')}
                  ${statusBadge('not_configured', 'Not configured: External LLM Provider')}
                </div>
              </div>
              <p class="text-xs text-secondary" style="line-height: 1.6; margin: 0;">
                Notes, imported research papers, tasks, and fetched link metadata may contain untrusted third-party text or adversarial instructions. Every MCP tool response wraps workspace content in a structured <code>_security_boundary</code> envelope (<code>untrusted_workspace_content: true</code>, <code>instruction_override_policy: STRICT_DATA_ONLY</code>) and scrubs secret patterns so connected AI assistants treat workspace text strictly as passive data and never execute embedded instructions or escalate permissions.
              </p>
            </div>

            <!-- Subsection 6 -->
            <div class="sec-subsection-card" data-subsection="responsible-use-policy" style="padding: var(--space-4); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                <div class="font-semibold text-sm" style="font-weight: 600; color: var(--text-primary);">6. Responsible Use Policy</div>
                ${statusBadge('active', 'Active')}
              </div>
              <p class="text-xs text-secondary" style="line-height: 1.6; margin: 0;">
                Flowden prohibits using workspace tools, attachments, metadata fetchers, or AI/MCP integrations to plan or execute real-world harm, unauthorized system intrusion, credential harvesting, malware hosting, doxxing, harassment, or unlawful data exploitation. Technical safeguards enforce rate limits, SSRF blocks, upload signature checks, and abuse reporting while fully supporting legitimate software engineering, defensive cybersecurity research, academic study, and personal knowledge management without intrusive keyword censorship.
              </p>
            </div>

            <!-- Subsection 7 -->
            <div class="sec-subsection-card" data-subsection="security-monitoring" style="padding: var(--space-4); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                <div class="font-semibold text-sm" style="font-weight: 600; color: var(--text-primary);">7. Security Monitoring & Accountability</div>
                ${statusBadge('active', 'Active')}
              </div>
              <p class="text-xs text-secondary" style="line-height: 1.6; margin-bottom: var(--space-3);">
                Flowden records authentication events, login rate-limit triggers, session revocations, cross-user access denials, rejected uploads, SSRF blocks, MCP tool executions, and abuse reports in a persistent MySQL <code>security_audit_logs</code> table with automatic secret redaction.
              </p>

              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4);">
                <div style="padding: var(--space-3); background-color: var(--bg-secondary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <span class="text-xs" style="font-weight: 600; color: var(--text-primary);">Recent Account Security Activity</span>
                    <button type="button" class="btn btn--secondary btn--sm" id="refresh-sec-events-btn" style="padding: 2px 8px; font-size: 11px;">Refresh</button>
                  </div>
                  <div id="user-sec-events-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 165px; overflow-y: auto;">
                    ${securityEvents.length === 0 ? '<div class="text-xs text-secondary">No recent security events recorded.</div>' : securityEvents.map(ev => `
                      <div style="padding: 6px 8px; background-color: var(--bg-tertiary); border-radius: 4px; border: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: space-between;">
                        <div>
                          <code style="font-size: 11px; color: var(--accent-primary);">${esc(ev.event_type)}</code>
                          <div class="text-xs text-secondary">${ev.target_type ? esc(ev.target_type) : 'system'} ${ev.ip_address ? '· ' + esc(ev.ip_address) : ''}</div>
                        </div>
                        <span class="text-xs text-secondary">${ev.created_at ? new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                    `).join('')}
                  </div>
                  <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <span class="text-xs text-secondary">Invalidate all active browser & API tokens</span>
                    <button type="button" class="btn btn--secondary btn--sm" id="revoke-all-sessions-btn" style="color: var(--status-error); border-color: rgba(224,82,77,0.35);">Revoke All Sessions</button>
                  </div>
                </div>

                <div style="padding: var(--space-3); background-color: var(--bg-secondary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div class="text-xs" style="font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Report Security or Abuse Issue</div>
                  <div class="form-group" style="margin-bottom: 8px;">
                    <select id="sec-report-category" class="select" style="font-size: 12px; width: 100%;">
                      <option value="vulnerability">Security Vulnerability / Suspicious Activity</option>
                      <option value="unauthorized_access">Unauthorized Access Attempt</option>
                      <option value="malicious_attachment">Malicious Attachment / Upload</option>
                      <option value="ai_safety">AI / MCP Boundary Concern</option>
                      <option value="abuse">Responsible Use Violation / Harm</option>
                    </select>
                  </div>
                  <div class="form-group" style="margin-bottom: 8px;">
                    <textarea id="sec-report-description" class="input" rows="2" style="font-size: 12px; resize: vertical; width: 100%; box-sizing: border-box;" placeholder="Describe the security event, suspicious attachment, or policy violation..."></textarea>
                  </div>
                  <div style="display: flex; justify-content: flex-end;">
                    <button type="button" class="btn btn--primary btn--sm" id="submit-sec-report-btn">Submit Security Report</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </section>

      <!-- =================================================================== -->
      <!-- VIEW C: KNOWLEDGE EXCHANGE PANEL (#knowledge-exchange)             -->
      <!-- =================================================================== -->
      <section id="knowledge-exchange" class="assistant-view-panel" role="tabpanel" aria-labelledby="tab-btn-exchange" style="margin-bottom: var(--space-8); display: none;">
        
        <!-- Section 1: Page Header -->
        <div style="margin-bottom: var(--space-5); padding-bottom: var(--space-3); border-bottom: 1px solid var(--border-primary); display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3);">
          <div>
            <h2 style="font-size: var(--text-lg); font-weight: 600; color: var(--text-primary); margin: 0 0 4px 0; display: flex; align-items: center; gap: 8px;">
              <span style="color: var(--brand-teal);">${getIcon('share-2')}</span>
              <span>Flowden Knowledge Exchange</span>
            </h2>
            <p class="text-xs text-secondary" style="margin: 0; line-height: 1.55;">
              Bring research created with external AI tools into Flowden as organized notes, sources, and connections.
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
            ${statusBadge('active', 'FKF 2.0')}
            <span class="badge" style="font-size: 10px; font-family: var(--font-mono); background: var(--bg-tertiary); color: var(--text-secondary); border: 1px solid var(--border-primary);">Legacy ZIP Supported</span>
          </div>
        </div>

        <!-- Introduction Block -->
        <div class="assistant-card" style="padding: var(--space-4) var(--space-5); background-color: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-md); margin-bottom: var(--space-5);">
          <h3 style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin: 0 0 6px 0;">What is Knowledge Exchange?</h3>
          <p class="text-xs text-secondary" style="line-height: 1.6; margin: 0 0 var(--space-3) 0;">
            Knowledge Exchange lets you bring research from AI tools like ChatGPT, Claude, and Gemini into Flowden. Your research is organized into notes, folders, sources, and meaningful connections, so you can explore and build on it inside your Second Brain.
          </p>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-3);">
            <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border-left: 3px solid var(--brand-teal); font-size: 11px; line-height: 1.55; color: var(--text-secondary);">
              <strong style="color: var(--text-primary); display: block; margin-bottom: 2px;">Important Note</strong>
              Research happens in your chosen AI tool, not directly on this page. Flowden helps you prepare, check, and import the finished research package.
            </div>
            <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border-left: 3px solid var(--accent-primary); font-size: 11px; line-height: 1.55; color: var(--text-secondary);">
              <strong style="color: var(--text-primary); display: block; margin-bottom: 2px;">Availability Note</strong>
              This page currently supports importing knowledge packages into Flowden. Exporting a Flowden Project as an FKF package is not currently available.
            </div>
          </div>
        </div>

        <!-- Section 2: Main Import Section -->
        <div class="assistant-card" style="padding: var(--space-4) var(--space-5); background-color: var(--bg-secondary); border: 1px solid rgba(120, 200, 178, 0.35); border-radius: var(--radius-md); margin-bottom: var(--space-5); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3);">
          <div>
            <div style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin-bottom: 2px;">
              Import AI Research into Flowden
            </div>
            <div class="text-xs text-secondary">
              Add a structured research package to a new Project or an existing one. Review its contents before importing.
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
            <button type="button" class="btn btn--primary btn--md" id="btn-assistant-import-package" title="Import Flowden Package" style="background-color: var(--brand-teal); border-color: var(--brand-teal); color: #0d1117; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
              ${getIcon('upload')} <span>Import Research Package</span>
            </button>
            <button type="button" class="btn btn--secondary btn--md btn-download-resource" data-resource="research-spec" data-filename="FLOWDEN_RESEARCH_SPEC.md" style="display: inline-flex; align-items: center; gap: 6px;">
              ${getIcon('download')} <span>Download Research Guide</span>
            </button>
          </div>
        </div>

        <!-- Section 3: How It Works -->
        <div class="assistant-card" style="padding: var(--space-5); background-color: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-md); margin-bottom: var(--space-5);">
          <div style="margin-bottom: var(--space-3);">
            <h3 style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin: 0 0 2px 0;">How It Works: 4-Step Research Workflow</h3>
            <p class="text-xs text-secondary" style="margin: 0;">Follow this streamlined workflow to transform open AI investigation into connected workspace knowledge:</p>
          </div>

          <div class="assistant-workflow-steps" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3);">
            <div class="assistant-step-card" style="padding: var(--space-3); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm);">
              <div class="assistant-step-number" style="font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: var(--accent-primary); margin-bottom: 4px;">STEP 1 · PREPARE</div>
              <div class="assistant-step-title" style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Download the Research Guide</div>
              <p class="assistant-step-desc" style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.5; margin: 0;">Download the Flowden Research Spec and copy the Universal Research Prompt. Give them to your chosen AI along with your research topic.</p>
            </div>

            <div class="assistant-step-card" style="padding: var(--space-3); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm);">
              <div class="assistant-step-number" style="font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: var(--accent-primary); margin-bottom: 4px;">STEP 2 · RESEARCH</div>
              <div class="assistant-step-title" style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Research with AI</div>
              <p class="assistant-step-desc" style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.5; margin: 0;">Ask your AI to investigate the topic, organize its findings, and connect related ideas using the Flowden knowledge structure.</p>
            </div>

            <div class="assistant-step-card" style="padding: var(--space-3); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm);">
              <div class="assistant-step-number" style="font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: var(--brand-teal); margin-bottom: 4px;">STEP 3 · CREATE YOUR FILE</div>
              <div class="assistant-step-title" style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Save as Markdown (.md) or ZIP</div>
              <p class="assistant-step-desc" style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.5; margin: 0;">Ask your AI to produce one structured Markdown document (<code>.md</code>) containing multiple notes, or a package archive (<code>.flowden.zip</code>).</p>
            </div>

            <div class="assistant-step-card" style="padding: var(--space-3); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm);">
              <div class="assistant-step-number" style="font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: var(--status-success); margin-bottom: 4px;">STEP 4 · IMPORT</div>
              <div class="assistant-step-title" style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Check, Review, and Import</div>
              <p class="assistant-step-desc" style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.5; margin: 0;">Upload your file to Flowden. Review the package contents, choose a destination Project, and approve the import.</p>
            </div>
          </div>
        </div>

        <!-- Section 4: Universal Research Prompt -->
        <div class="assistant-card" style="padding: var(--space-5); background-color: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-md); margin-bottom: var(--space-5);">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-3);">
            <div>
              <h3 style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin: 0 0 2px 0; display: flex; align-items: center; gap: 6px;">
                <span style="color: var(--brand-teal);">${getIcon('terminal')}</span>
                <span>FKF Universal Research Prompt</span>
              </h3>
              <p class="text-xs text-secondary" style="margin: 0;">
                Use this ready-to-copy prompt to guide your AI through research and turn its findings into a structured Flowden knowledge package.
              </p>
            </div>
            <button type="button" class="btn btn--primary btn--sm" id="btn-copy-universal-prompt" style="background-color: var(--brand-teal); border-color: var(--brand-teal); color: #0d1117; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
              ${getIcon('clipboard')} <span id="copy-prompt-label">Copy Universal Prompt</span>
            </button>
          </div>

          <div style="margin-bottom: var(--space-3); padding: var(--space-3) var(--space-4); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
            <div style="font-size: 11px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Instructions:</div>
            <ol style="margin: 0; padding-left: 18px; font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.6;">
              <li>Copy the Universal Research Prompt below.</li>
              <li>Attach the <code>FLOWDEN_RESEARCH_SPEC.md</code> file.</li>
              <li>Replace the research topic placeholder with your specific research subject.</li>
              <li>Send everything to your chosen AI (Claude, ChatGPT, Gemini, or NotebookLM).</li>
            </ol>
          </div>

          <div style="position: relative;">
            <pre style="margin: 0; padding: var(--space-3) var(--space-4); background-color: #0d1117; color: #e6edf3; border: 1px solid var(--border-primary); border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 11px; line-height: 1.6; max-height: 280px; overflow-y: auto; white-space: pre-wrap;"><code id="universal-prompt-preview">${esc(UNIVERSAL_RESEARCH_PROMPT)}</code></pre>
          </div>

          <div class="text-xs text-secondary" style="margin-top: var(--space-2); font-size: 11px; line-height: 1.5;">
            <strong>Supporting Note:</strong> The prompt works across different research topics. Your AI should adapt the knowledge structure to the subject instead of forcing every topic into the same template.
          </div>
        </div>

        <!-- Section 5: Downloadable Resources -->
        <div class="assistant-card" id="ke-download-resources" style="padding: var(--space-5); background-color: var(--bg-secondary); border: 1px solid var(--border-primary); margin-bottom: var(--space-5); border-radius: var(--radius-md);">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3);">
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <span style="color: var(--accent-primary);">${getIcon('download')}</span>
              <h3 style="font-size: var(--text-md); font-weight: 600; color: var(--text-primary); margin: 0;">4. Downloadable Specification & Reference Assets</h3>
            </div>
            ${statusBadge('active', 'Verified & Available')}
          </div>
          <p class="text-xs text-secondary" style="line-height: 1.6; margin-bottom: var(--space-4);">
            Download the authoritative research guide, schemas, and reference package to guide your AI tools:
          </p>

          <div class="assistant-resources-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4);">
            
            <!-- Resource 1: Research Guide -->
            <div class="assistant-resource-card" style="padding: var(--space-4); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); display: flex; flex-direction: column; justify-content: space-between; border-radius: var(--radius-sm);">
              <div>
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <span class="badge" style="font-size: 10px; font-family: var(--font-mono); background: rgba(120, 200, 178, 0.15); color: var(--brand-teal);">Research Guide</span>
                  <span class="text-xs text-secondary">~25 KB</span>
                </div>
                <h4 style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin: 0 0 6px 0;">FLOWDEN_RESEARCH_SPEC.md</h4>
                <p class="text-xs text-secondary" style="line-height: 1.55; margin-bottom: var(--space-3);">
                  Instructions for researching, organizing, and preparing knowledge for Flowden. Give this guide to your AI when creating a new FKF research package.
                </p>
              </div>
              <div>
                <a href="/api/v1/exchange/resources/research-spec" download="FLOWDEN_RESEARCH_SPEC.md" class="btn btn--secondary btn--sm btn-download-resource" data-resource="research-spec" data-filename="FLOWDEN_RESEARCH_SPEC.md" style="display: inline-flex; align-items: center; gap: 6px; width: 100%; justify-content: center; text-decoration: none;">
                  ${getIcon('download')} <span>Download Research Guide</span>
                </a>
              </div>
            </div>

            <!-- Resource 2: Legacy ZIP Schema -->
            <div class="assistant-resource-card" style="padding: var(--space-4); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); display: flex; flex-direction: column; justify-content: space-between; border-radius: var(--radius-sm);">
              <div>
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <span class="badge" style="font-size: 10px; font-family: var(--font-mono);">Legacy ZIP Schema</span>
                  <span class="text-xs text-secondary">~32 KB</span>
                </div>
                <h4 style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin: 0 0 6px 0;">flowden-package.schema.json</h4>
                <p class="text-xs text-secondary" style="line-height: 1.55; margin-bottom: var(--space-3);">
                  Reference schema for older Flowden ZIP packages. Most users creating new FKF 2.0 research do not need this file.
                </p>
              </div>
              <div>
                <a href="/api/v1/exchange/resources/package-schema" download="flowden-package.schema.json" class="btn btn--secondary btn--sm btn-download-resource" data-resource="package-schema" data-filename="flowden-package.schema.json" style="display: inline-flex; align-items: center; gap: 6px; width: 100%; justify-content: center; text-decoration: none;">
                  ${getIcon('download')} <span>Download Legacy Schema</span>
                </a>
              </div>
            </div>

            <!-- Resource 3: Reference Package -->
            <div class="assistant-resource-card" style="padding: var(--space-4); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); display: flex; flex-direction: column; justify-content: space-between; border-radius: var(--radius-sm);">
              <div>
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <span class="badge" style="font-size: 10px; font-family: var(--font-mono);">Reference Package</span>
                  <span class="text-xs text-secondary">~12 KB</span>
                </div>
                <h4 style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin: 0 0 6px 0;">flowden-reference-package.flowden.zip</h4>
                <p class="text-xs text-secondary" style="line-height: 1.55; margin-bottom: var(--space-3);">
                  A sample knowledge package that demonstrates how research can be organized in Flowden. Try importing it into a new Project to explore an example.
                </p>
              </div>
              <div>
                <a href="/api/v1/exchange/resources/reference-package" download="flowden-reference-package.flowden.zip" class="btn btn--primary btn--sm btn-download-resource" data-resource="reference-package" data-filename="flowden-reference-package.flowden.zip" style="display: inline-flex; align-items: center; gap: 6px; width: 100%; justify-content: center; text-decoration: none; background-color: var(--brand-teal); border-color: var(--brand-teal); color: #0d1117; font-weight: 600;">
                  ${getIcon('download')} <span>Download Example Package</span>
                </a>
              </div>
            </div>

          </div>
        </div>

        <!-- Section 6: Import Information -->
        <div class="assistant-callout-strip" style="padding: var(--space-4); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border-left: 3px solid var(--brand-teal); display: flex; flex-direction: column; gap: 8px; margin-bottom: var(--space-5);">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <span style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); display: inline-flex; align-items: center; gap: 6px;">
              ${getIcon('shield-check')} <span>Before You Import</span>
            </span>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
              ${statusBadge('active', 'Backend Importer: Implemented')}
              ${statusBadge('active', 'Frontend Importer: Implemented & Available')}
              <button type="button" class="btn btn--primary btn--sm" id="btn-callout-import-package" style="background-color: var(--brand-teal); border-color: var(--brand-teal); color: #0d1117; font-weight: 600; padding: 2px 10px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
                ${getIcon('upload')} <span>Import Research Package</span>
              </button>
            </div>
          </div>
          <p class="text-xs text-secondary" style="margin: 0; line-height: 1.6;">
            Flowden checks the package structure and its internal references before showing you a preview. You can review the contents and choose where they should go. Nothing is imported into your Project until you explicitly approve the operation.<br/>
            <strong>Security Note:</strong> These checks help detect invalid or unsupported package structures. They do not guarantee that every research claim or external source is factually correct.<br/>
            <span style="font-size: 11px; color: var(--text-tertiary);">Interactive Frontend Importer pipeline verifies pre-extraction bounds, magic bytes, SHA-256 fingerprinting, and transactional MySQL integrity.</span>
          </p>
        </div>

        <!-- Section 7: Advanced Documentation (Progressive Disclosure Accordions) -->
        <div class="assistant-card" style="padding: var(--space-5); background-color: var(--bg-secondary); border: 1px solid var(--border-primary); margin-bottom: var(--space-6); border-radius: var(--radius-md);">
          <div style="margin-bottom: var(--space-4);">
            <h3 style="font-size: var(--text-md); font-weight: 600; color: var(--text-primary); margin: 0 0 2px 0;">Technical Specification & Format Architecture</h3>
            <p class="text-xs text-secondary" style="margin: 0;">Comprehensive architectural documentation for researchers, developers, and AI engineers:</p>
          </div>

          <!-- Topic 1: From AI Research to Connected Knowledge -->
          <details class="assistant-accordion" id="ke-introduction" style="border: 1px solid var(--border-primary); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);" open>
            <summary class="assistant-accordion-summary" style="padding: var(--space-3) var(--space-4); display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
              <span class="assistant-accordion-title" style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                ${getIcon('book-open')} <span>1. From AI Research to Connected Knowledge</span>
                <span class="badge" style="font-size: 9px; font-weight: normal; color: var(--text-tertiary);">1. Transforming External AI Research into Connected Knowledge</span>
              </span>
              <span class="assistant-accordion-icon" style="color: var(--text-tertiary);">${getIcon('chevron-right')}</span>
            </summary>
            <div class="assistant-accordion-content" style="padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-primary); background-color: var(--bg-secondary); font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65;">
              <p style="margin: 0 0 var(--space-2) 0; font-weight: 600; color: var(--text-primary);">
                Learn how Flowden turns external AI research into organized notes, sources, and connections.
              </p>
              <p style="margin: 0 0 var(--space-2) 0;">
                Frontier AI systems (such as Claude, ChatGPT, Gemini, and NotebookLM) excel at synthesizing complex literature, generating cross-domain hypotheses, and comparing technical architectures. However, in standard workflows, their outputs remain trapped in disposable chat windows or serialized into monolithic text documents that quickly become write-only archives.
              </p>
              <p style="margin: 0;">
                <strong>Flowden Knowledge Exchange</strong> establishes an open, structured standard—the <strong>Flowden Knowledge Format (FKF v1.0.0 / 2.0)</strong>. Instead of pasting ungrounded text, you can instruct any external AI model to compile its research into a verified package. Flowden ingests this package into real, first-class workspace entities: modular vault notes, hierarchical folder taxonomies, rich bibliographic sources, verbatim excerpt anchors, bidirectional wikilinks, typed knowledge graph relationships, and actionable project tasks.
              </p>
            </div>
          </details>

          <!-- Topic 2: Why Organize Research into Separate Notes? -->
          <details class="assistant-accordion" id="ke-why-structured" style="border: 1px solid var(--border-primary); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);">
            <summary class="assistant-accordion-summary" style="padding: var(--space-3) var(--space-4); display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
              <span class="assistant-accordion-title" style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                ${getIcon('file-search')} <span>2. Why Organize Research into Separate Notes?</span>
                <span class="badge" style="font-size: 9px; font-weight: normal; color: var(--text-tertiary);">2. Why Structured Research?</span>
              </span>
              <span class="assistant-accordion-icon" style="color: var(--text-tertiary);">${getIcon('chevron-right')}</span>
            </summary>
            <div class="assistant-accordion-content" style="padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-primary); background-color: var(--bg-secondary); font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65;">
              <p style="margin: 0 0 var(--space-3) 0; font-weight: 600; color: var(--text-primary);">
                Understand why focused, interconnected notes are easier to explore, reuse, and expand than one long research document.
              </p>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4);">
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; color: var(--status-error); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    ${getIcon('x')} <span>Conventional Flat Markdown / PDF</span>
                  </div>
                  <ul style="padding-left: 16px; margin: 0; line-height: 1.6;">
                    <li><strong>Write-Only Grave:</strong> Long prose walls where key conceptual breakthroughs remain buried.</li>
                    <li><strong>Unlinked Citations:</strong> Bibliographic sources exist only as plain text footnotes.</li>
                    <li><strong>Inert Action Items:</strong> Recommendations remain passive bullet points.</li>
                    <li><strong>No Semantic Topology:</strong> Relationships between conflicting studies cannot be traversed.</li>
                  </ul>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid rgba(120, 200, 178, 0.35);">
                  <div style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; color: var(--brand-teal); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    ${getIcon('check')} <span>Flowden Knowledge Package (FKF 2.0 / v1.0.0)</span>
                  </div>
                  <ul style="padding-left: 16px; margin: 0; line-height: 1.6;">
                    <li><strong>Modular Canonical Notes:</strong> Discrete conceptual notes with YAML frontmatter tags and <code>[[fkf:&lt;note-id&gt;|Display Title]]</code> WikiLinks.</li>
                    <li><strong>Evidential Provenance:</strong> Formal source metadata (DOI, URL, authors, year) with verbatim quoted excerpts.</li>
                    <li><strong>Actionable Workflows:</strong> Follow-up tasks appear in your project Kanban board.</li>
                    <li><strong>Explicit Semantic Graph:</strong> Machine-readable typed edges (<code>supports</code>, <code>contradicts</code>, <code>cites</code>) power graph navigation.</li>
                  </ul>
                </div>
              </div>
            </div>
          </details>

          <!-- Topic 3: The Knowledge Exchange Process -->
          <details class="assistant-accordion" id="ke-how-it-works" style="border: 1px solid var(--border-primary); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);">
            <summary class="assistant-accordion-summary" style="padding: var(--space-3) var(--space-4); display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
              <span class="assistant-accordion-title" style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                ${getIcon('check-circle')} <span>3. The Knowledge Exchange Process</span>
                <span class="badge" style="font-size: 9px; font-weight: normal; color: var(--text-tertiary);">3. How It Works</span>
              </span>
              <span class="assistant-accordion-icon" style="color: var(--text-tertiary);">${getIcon('chevron-right')}</span>
            </summary>
            <div class="assistant-accordion-content" style="padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-primary); background-color: var(--bg-secondary); font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65;">
              <p style="margin: 0 0 var(--space-3) 0; font-weight: 600; color: var(--text-primary);">
                Follow the complete journey from preparing your research topic to importing the finished package into Flowden.
              </p>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3);">
                <div style="padding: 8px 12px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong>Step 1:</strong> Download Research Spec and copy Universal Research Prompt.
                </div>
                <div style="padding: 8px 12px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong>Step 2:</strong> Provide Spec and Prompt to AI (Claude, ChatGPT, or Gemini).
                </div>
                <div style="padding: 8px 12px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong>Step 3:</strong> Define Topic, scope, domain focus, and depth requirements.
                </div>
                <div style="padding: 8px 12px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong>Step 4:</strong> AI Investigates literature, citations, and semantic links.
                </div>
                <div style="padding: 8px 12px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong>Step 5:</strong> AI Compiles a valid <code>.fkf</code> or <code>.flowden.zip</code> file.
                </div>
                <div style="padding: 8px 12px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong>Step 6:</strong> Safe pre-extraction inspection and validation in Flowden.
                </div>
                <div style="padding: 8px 12px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong>Step 7:</strong> User reviews entity counts and selects New or Existing project.
                </div>
                <div style="padding: 8px 12px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong>Step 8:</strong> Flowden commits all entities in an atomic database transaction.
                </div>
              </div>
            </div>
          </details>

          <!-- Topic 4: Understanding FKF File Formats -->
          <details class="assistant-accordion" id="ke-package-structure" style="border: 1px solid var(--border-primary); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);">
            <summary class="assistant-accordion-summary" style="padding: var(--space-3) var(--space-4); display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
              <span class="assistant-accordion-title" style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                ${getIcon('folder')} <span>4. Understanding FKF File Formats</span>
                <span class="badge" style="font-size: 9px; font-weight: normal; color: var(--text-tertiary);">.fkf vs .flowden.zip</span>
              </span>
              <span class="assistant-accordion-icon" style="color: var(--text-tertiary);">${getIcon('chevron-right')}</span>
            </summary>
            <div class="assistant-accordion-content" style="padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-primary); background-color: var(--bg-secondary); font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65;">
              <p style="margin: 0 0 var(--space-2) 0; font-weight: 600; color: var(--text-primary);">
                Learn the difference between a standalone .fkf file and supported older .flowden.zip archives.
              </p>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-3);">
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid rgba(120, 200, 178, 0.35);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--brand-teal); margin-bottom: 2px;">FKF 2.0 (.fkf Document) — Recommended</div>
                  <div class="text-xs text-secondary">A single self-contained JSON file containing the project manifest, folders, notes, sources, excerpts, and relationships. Easily generated directly by chat LLMs in a single response turn without needing zip compression tools.</div>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary); margin-bottom: 2px;">FKF 1.x (.flowden.zip Archive) — Supported</div>
                  <div class="text-xs text-secondary">A multi-file zip container containing discrete markdown files (<code>notes/*.md</code>), individual JSON documents (<code>folders.json</code>, <code>sources/index.json</code>), and binary assets (images, PDF companion reports). Fully supported for backward compatibility.</div>
                </div>
              </div>
            </div>
          </details>

          <!-- Topic 5: What Can a Knowledge Package Contain? -->
          <details class="assistant-accordion" id="ke-entities" style="border: 1px solid var(--border-primary); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);">
            <summary class="assistant-accordion-summary" style="padding: var(--space-3) var(--space-4); display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
              <span class="assistant-accordion-title" style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                ${getIcon('layers')} <span>5. What Can a Knowledge Package Contain?</span>
                <span class="badge" style="font-size: 9px; font-weight: normal; color: var(--text-tertiary);">5. Flowden Knowledge Format (FKF v1.0.0) Architecture</span>
              </span>
              <span class="assistant-accordion-icon" style="color: var(--text-tertiary);">${getIcon('chevron-right')}</span>
            </summary>
            <div class="assistant-accordion-content" style="padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-primary); background-color: var(--bg-secondary); font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65;">
              <p style="margin: 0 0 var(--space-2) 0; font-weight: 600; color: var(--text-primary);">
                Explore the different types of content a package can include: Projects and Folders, Notes and WikiLinks, Sources and Excerpts, Semantic Relationships, and Optional Tasks and Spatial Board content.
              </p>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-3);">
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--accent-primary); margin-bottom: 2px;">Projects & Folders (project & folders.json)</div>
                  <div class="text-xs text-secondary">Scoped research workspace with hierarchical folder taxonomy (<code>fld-*</code>), depth bounds, and metadata descriptors.</div>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--brand-teal); margin-bottom: 2px;">Notes & WikiLinks (notes/*.md)</div>
                  <div class="text-xs text-secondary">Discrete conceptual articles containing YAML frontmatter tags, summaries, and inline WikiLinks (<code>[[fkf:&lt;note-id&gt;|Display Title]]</code>).</div>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--status-warning); margin-bottom: 2px;">Sources & Excerpts (sources/index.json)</div>
                  <div class="text-xs text-secondary">Structured bibliography (<code>src-*</code>) with location-anchored verbatim excerpts (<code>exc-*</code>) and companion files.</div>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--status-success); margin-bottom: 2px;">Semantic Relationships (relationships/links.json)</div>
                  <div class="text-xs text-secondary">Typed connections (<code>rel-*</code>) using the 10 canonical types: <code>supports</code>, <code>contradicts</code>, <code>cites</code>, <code>derived_from</code>, <code>references</code>, <code>embeds</code>, <code>relates_to</code>, <code>depends_on</code>, <code>blocks</code>, <code>inspired_by</code>.</div>
                </div>
              </div>
            </div>
          </details>

          <!-- Topic 6: How Flowden Checks Your Package -->
          <details class="assistant-accordion" id="ke-import-workflow" style="border: 1px solid var(--border-primary); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);">
            <summary class="assistant-accordion-summary" style="padding: var(--space-3) var(--space-4); display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
              <span class="assistant-accordion-title" style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                ${getIcon('shield-check')} <span>6. How Flowden Checks Your Package</span>
                <span class="badge" style="font-size: 9px; font-weight: normal; color: var(--text-tertiary);">6. Safe Pre-Inspection & Transactional Commit Pipeline</span>
              </span>
              <span class="assistant-accordion-icon" style="color: var(--text-tertiary);">${getIcon('chevron-right')}</span>
            </summary>
            <div class="assistant-accordion-content" style="padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-primary); background-color: var(--bg-secondary); font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65;">
              <p style="margin: 0 0 var(--space-2) 0; font-weight: 600; color: var(--text-primary);">
                Understand how Flowden checks file structure, format compatibility, internal references, and package contents before import.
              </p>
              <ol style="padding-left: 18px; margin: 0; line-height: 1.65;">
                <li><strong>Pre-Extraction Central Directory Inspection:</strong> Verifies archive bounds (&le;25 MB compressed, &le;100 MB uncompressed, &le;10:1 ratio, &le;1,000 files) and strictly rejects directory traversal sequences (<code>../</code>) and null-byte injection.</li>
                <li><strong>Schema & Magic-Byte Validation:</strong> Validates <code>fkf_version: "1.0.0"</code> / <code>2.0.0</code> and <code>format: "flowden-knowledge-package"</code>, confirms referential integrity, and inspects magic bytes to block executables (<code>MZ</code>, <code>ELF</code>, Mach-O, scripts).</li>
                <li><strong>Pre-Import Summary & Destination Selection:</strong> Users receive an entity breakdown preview detailing exact numbers of notes, sources, tasks, relationships, and assets. You choose whether to instantiate a brand-new project or safely merge into an existing workspace.</li>
                <li><strong>Time-Bound Inspection Ticket Binding:</strong> Issues a single-use inspection ticket bound to user ID, project ID, and SHA-256 archive checksum. The ticket expires after 15 minutes.</li>
                <li><strong>Atomic Crash-Safe Transaction Commit:</strong> All database entities are inserted inside an isolated MySQL transaction in dependency order: Project &rarr; Folders &rarr; Notes &rarr; Sources &rarr; Excerpts &rarr; Relationships &rarr; Tasks &rarr; Spatial Boards &rarr; Assets. If any error occurs, the entire transaction rolls back instantly with zero partial writes.</li>
              </ol>
            </div>
          </details>

          <!-- Topic 7: Optional Content and Advanced Features -->
          <details class="assistant-accordion" id="ke-optional-modules" style="border: 1px solid var(--border-primary); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);">
            <summary class="assistant-accordion-summary" style="padding: var(--space-3) var(--space-4); display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
              <span class="assistant-accordion-title" style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                ${getIcon('layout-grid')} <span>7. Optional Content and Advanced Features</span>
                <span class="badge" style="font-size: 9px; font-weight: normal; color: var(--text-tertiary);">7. Optional Modules & Advanced Projections</span>
              </span>
              <span class="assistant-accordion-icon" style="color: var(--text-tertiary);">${getIcon('chevron-right')}</span>
            </summary>
            <div class="assistant-accordion-content" style="padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-primary); background-color: var(--bg-secondary); font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65;">
              <p style="margin: 0 0 var(--space-2) 0; font-weight: 600; color: var(--text-primary);">
                Learn how Tasks, Spatial Board content, and other supported optional components can be included in a knowledge package.
              </p>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-3);">
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--status-success); margin-bottom: 3px;">Actionable Tasks (<code>optional/tasks.json</code>)</div>
                  <div class="text-xs text-secondary" style="line-height: 1.55;">
                    Maps to Flowden Kanban (<code>tsk-*</code>) with status (<code>todo</code>, <code>in_progress</code>, <code>done</code>) and priority (<code>low</code>, <code>medium</code>, <code>high</code>, <code>urgent</code>). <code>due_date</code> remains <code>null</code> unless explicitly specified by prompt.
                  </div>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--brand-teal); margin-bottom: 3px;">Spatial Board (<code>optional/spatial-board.json</code>)</div>
                  <div class="text-xs text-secondary" style="line-height: 1.55;">
                    Positions notes on Flowden's 2D canvas with coordinates (<code>x</code>, <code>y</code>), card clusters (<code>grp-*</code>, <code>bitm-*</code>), and directed visual canvas wires (<code>bcon-*</code>).
                  </div>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--status-warning); margin-bottom: 3px;">Research Report PDF (<code>exports/research-report.pdf</code>)</div>
                  <div class="text-xs text-secondary" style="line-height: 1.55;">
                    Self-contained human-readable PDF reading document stored as a project asset in Flowden, verified with safe magic-byte header (<code>%PDF-</code>).
                  </div>
                </div>
              </div>
            </div>
          </details>

          <!-- Topic 8: AI Compatibility and Frequently Asked Questions -->
          <details class="assistant-accordion" id="ke-faq" style="border: 1px solid var(--border-primary); background-color: var(--bg-tertiary); border-radius: var(--radius-sm);">
            <summary class="assistant-accordion-summary" style="padding: var(--space-3) var(--space-4); display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
              <span class="assistant-accordion-title" style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                ${getIcon('help-circle')} <span>8. AI Compatibility and Frequently Asked Questions</span>
                <span class="badge" style="font-size: 9px; font-weight: normal; color: var(--text-tertiary);">8. LLM Compatibility, Limitations & FAQ</span>
              </span>
              <span class="assistant-accordion-icon" style="color: var(--text-tertiary);">${getIcon('chevron-right')}</span>
            </summary>
            <div class="assistant-accordion-content" style="padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-primary); background-color: var(--bg-secondary); font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65;">
              <p style="margin: 0 0 var(--space-3) 0; font-weight: 600; color: var(--text-primary);">
                Find guidance for using external AI tools, preparing FKF files, and resolving common research and import problems.
              </p>
              <div style="display: flex; flex-direction: column; gap: var(--space-3);">
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong style="color: var(--text-primary); font-size: var(--text-xs);">ChatGPT Plus / Pro (OpenAI) Compatibility:</strong>
                  <p style="margin: 2px 0 0 0;">ChatGPT with Advanced Data Analysis (Python Code Interpreter) can generate Python scripts to create the entire directory hierarchy, write the JSON and Markdown files, and bundle them into a downloadable <code>.flowden.zip</code> archive or output a single <code>.fkf</code> document in one turn.</p>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong style="color: var(--text-primary); font-size: var(--text-xs);">Claude (Anthropic) Compatibility:</strong>
                  <p style="margin: 2px 0 0 0;">Claude 3.5 Sonnet and Claude 3 Opus excel at following the schema contract, crafting dense academic notes, and formatting complex semantic relationships. Simply instruct Claude to output raw JSON formatted as a standalone <code>.fkf</code> file.</p>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong style="color: var(--text-primary); font-size: var(--text-xs);">Google NotebookLM Workflow:</strong>
                  <p style="margin: 2px 0 0 0;">NotebookLM is ideal for ingesting proprietary PDFs and raw transcripts. Copy its synthesized study guides and source citations into a general-purpose model along with <code>FLOWDEN_RESEARCH_SPEC.md</code> and the Universal Research Prompt to generate the structured package.</p>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong style="color: var(--status-warning); font-size: var(--text-xs);">ZIP Generation Fallback:</strong>
                  <p style="margin: 2px 0 0 0;">If your model cannot generate a binary zip, instruct it to output each file in Markdown/JSON code blocks. Save locally into the FKF structure and run: <code>zip -r my-research.flowden.zip manifest.json folders.json project notes sources relationships assets optional exports</code></p>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong style="color: var(--text-primary); font-size: var(--text-xs);">Package Versions & Diagnostics:</strong>
                  <p style="margin: 2px 0 0 0;">Flowden officially supports standalone single-document <code>.fkf</code> files (FKF 2.0, <code>format: "flowden-knowledge-format"</code>) alongside legacy <code>.flowden.zip</code> archive packages (FKF 1.x, <code>format: "flowden-knowledge-package"</code>). Both formats are validated strictly against their formal JSON schemas and imported into unified workspace entities.</p>
                </div>
              </div>
            </div>
          </details>

        </div>
              <span class="assistant-accordion-icon" style="color: var(--text-tertiary);">${getIcon('chevron-right')}</span>
            </summary>
            <div class="assistant-accordion-content" style="padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-primary); background-color: var(--bg-secondary); font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65;">
              <pre style="margin: 0 0 var(--space-3) 0; padding: var(--space-3); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 11px; line-height: 1.6; color: var(--text-primary); overflow-x: auto;"><code>research-package.flowden.zip
├── manifest.json                 # Package identity, format: "flowden-knowledge-package", fkf_version: "1.0.0"
├── folders.json                  # Hierarchical folder structure (fld-*) organizing vault notes
├── project/
│   └── overview.md              # Rich project brief, context, methodology (pinned root note)
├── notes/                       # Canonical knowledge vault markdown notes with YAML frontmatter & [[fkf:...]] links
│   ├── note-example-01.md
│   └── note-example-02.md
├── sources/
│   ├── index.json               # Bibliographic sources (src-*) with structured excerpts (exc-*)
│   ├── source-example-01.md     # Detailed source background & analytical context
│   └── source-example-02.md
├── relationships/
│   └── links.json               # Typed semantic edges (rel-*) using the 10 canonical link_type values
├── assets/                      # Binary/media attachments (ast-*) (diagrams, charts, images, PDFs)
├── optional/                    # Optional workflow modules (declared in manifest.json -> optional_modules)
│   ├── tasks.json               # (Optional) Actionable tasks & deliverables (tsk-*)
│   └── spatial-board.json       # (Optional) 2D Spatial Board canvas layout, note cards & wires (brd-*)
└── exports/                     # (Optional) Standalone export artifacts
    └── research-report.pdf      # (Optional) Human-readable companion PDF research report</code></pre>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-3);">
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--accent-primary); margin-bottom: 2px;">Project & Folders (project/overview.md & folders.json)</div>
                  <div class="text-xs text-secondary">Defines workspace identity (<code>project/overview.md</code>) and hierarchical folder tree (<code>folders.json</code>) with stable IDs (<code>fld-*</code>).</div>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--brand-teal); margin-bottom: 2px;">Canonical Notes (notes/*.md)</div>
                  <div class="text-xs text-secondary">Discrete conceptual articles (<code>note-*</code>) containing YAML frontmatter tags, summaries, and inline WikiLinks (<code>[[fkf:&lt;note-id&gt;|Display Title]]</code>).</div>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--status-warning); margin-bottom: 2px;">Sources & Excerpts (sources/index.json + sources/*.md)</div>
                  <div class="text-xs text-secondary">Structured bibliography (<code>src-*</code>) with location-anchored verbatim excerpts (<code>exc-*</code>) and companion markdown files (<code>sources/*.md</code>).</div>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--status-success); margin-bottom: 2px;">Semantic Relationships (relationships/links.json)</div>
                  <div class="text-xs text-secondary">Typed semantic graph connections (<code>rel-*</code>) using the 10 canonical types: <code>supports</code>, <code>contradicts</code>, <code>cites</code>, <code>derived_from</code>, <code>references</code>, <code>embeds</code>, <code>relates_to</code>, <code>depends_on</code>, <code>blocks</code>, <code>inspired_by</code>.</div>
                </div>
              </div>
            </div>
          </details>

          <!-- Topic 6: Safe Pre-Inspection & Transactional Commit Pipeline -->
          <details class="assistant-accordion" id="ke-import-workflow" style="border: 1px solid var(--border-primary); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);">
            <summary class="assistant-accordion-summary" style="padding: var(--space-3) var(--space-4); display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
              <span class="assistant-accordion-title" style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                ${getIcon('shield-check')} <span>6. Safe Pre-Inspection & Transactional Commit Pipeline</span>
              </span>
              <span class="assistant-accordion-icon" style="color: var(--text-tertiary);">${getIcon('chevron-right')}</span>
            </summary>
            <div class="assistant-accordion-content" style="padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-primary); background-color: var(--bg-secondary); font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65;">
              <p style="margin: 0 0 var(--space-2) 0;">Flowden never extracts unvetted archives into active projects. All incoming packages pass through a multi-stage safety barrier:</p>
              <ol style="padding-left: 18px; margin: 0; line-height: 1.65;">
                <li><strong>Pre-Extraction Central Directory Inspection:</strong> Verifies archive bounds (&le;25 MB compressed, &le;100 MB uncompressed, &le;10:1 ratio, &le;1,000 files) and strictly rejects directory traversal sequences (<code>../</code>) and null-byte injection.</li>
                <li><strong>Schema & Magic-Byte Validation:</strong> Validates <code>fkf_version: "1.0.0"</code> and <code>format: "flowden-knowledge-package"</code>, confirms referential integrity, and inspects magic bytes to block executables (<code>MZ</code>, <code>ELF</code>, Mach-O, scripts).</li>
                <li><strong>Pre-Import Summary & Destination Selection:</strong> Users receive an entity breakdown preview detailing exact numbers of notes, sources, tasks, relationships, and assets. You choose whether to instantiate a brand-new project or safely merge into an existing workspace.</li>
                <li><strong>Time-Bound Inspection Ticket Binding:</strong> Issues a single-use inspection ticket bound to user ID, project ID, and SHA-256 archive checksum. The ticket expires after 15 minutes.</li>
                <li><strong>Atomic Crash-Safe Transaction Commit:</strong> All database entities are inserted inside an isolated MySQL transaction in dependency order: Project &rarr; Folders &rarr; Notes &rarr; Sources &rarr; Excerpts &rarr; Relationships &rarr; Tasks &rarr; Spatial Boards &rarr; Assets. If any error occurs, the entire transaction rolls back instantly with zero partial writes.</li>
              </ol>
            </div>
          </details>

          <!-- Topic 7: Optional Modules -->
          <details class="assistant-accordion" id="ke-optional-modules" style="border: 1px solid var(--border-primary); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); margin-bottom: var(--space-3);">
            <summary class="assistant-accordion-summary" style="padding: var(--space-3) var(--space-4); display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
              <span class="assistant-accordion-title" style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                ${getIcon('layout-grid')} <span>7. Optional Modules & Advanced Projections</span>
              </span>
              <span class="assistant-accordion-icon" style="color: var(--text-tertiary);">${getIcon('chevron-right')}</span>
            </summary>
            <div class="assistant-accordion-content" style="padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-primary); background-color: var(--bg-secondary); font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65;">
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-3);">
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--status-success); margin-bottom: 3px;">Actionable Tasks (<code>optional/tasks.json</code>)</div>
                  <div class="text-xs text-secondary" style="line-height: 1.55;">
                    Maps to Flowden Kanban (<code>tsk-*</code>) with status (<code>todo</code>, <code>in_progress</code>, <code>done</code>) and priority (<code>low</code>, <code>medium</code>, <code>high</code>, <code>urgent</code>). <code>due_date</code> remains <code>null</code> unless explicitly specified by prompt.
                  </div>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--brand-teal); margin-bottom: 3px;">Spatial Board (<code>optional/spatial-board.json</code>)</div>
                  <div class="text-xs text-secondary" style="line-height: 1.55;">
                    Positions notes on Flowden's 2D canvas with coordinates (<code>x</code>, <code>y</code>), card clusters (<code>grp-*</code>, <code>bitm-*</code>), and directed visual canvas wires (<code>bcon-*</code>).
                  </div>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--status-warning); margin-bottom: 3px;">Research Report PDF (<code>exports/research-report.pdf</code>)</div>
                  <div class="text-xs text-secondary" style="line-height: 1.55;">
                    Self-contained human-readable PDF reading document stored as a project asset in Flowden, verified with safe magic-byte header (<code>%PDF-</code>).
                  </div>
                </div>
              </div>
            </div>
          </details>

          <!-- Topic 8: Compatibility & FAQ -->
          <details class="assistant-accordion" id="ke-faq" style="border: 1px solid var(--border-primary); background-color: var(--bg-tertiary); border-radius: var(--radius-sm);">
            <summary class="assistant-accordion-summary" style="padding: var(--space-3) var(--space-4); display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
              <span class="assistant-accordion-title" style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                ${getIcon('help-circle')} <span>8. LLM Compatibility, Limitations & FAQ</span>
              </span>
              <span class="assistant-accordion-icon" style="color: var(--text-tertiary);">${getIcon('chevron-right')}</span>
            </summary>
            <div class="assistant-accordion-content" style="padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-primary); background-color: var(--bg-secondary); font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.65;">
              <div style="display: flex; flex-direction: column; gap: var(--space-3);">
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong style="color: var(--text-primary); font-size: var(--text-xs);">ChatGPT Plus / Pro (OpenAI) Compatibility:</strong>
                  <p style="margin: 2px 0 0 0;">ChatGPT with Advanced Data Analysis (Python Code Interpreter) can generate Python scripts to create the entire directory hierarchy, write the JSON and Markdown files, and bundle them into a downloadable <code>.flowden.zip</code> archive in one turn.</p>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong style="color: var(--text-primary); font-size: var(--text-xs);">Claude (Anthropic) Compatibility:</strong>
                  <p style="margin: 2px 0 0 0;">Claude 3.5 Sonnet and Claude 3 Opus excel at following the schema contract, crafting dense academic notes, and formatting complex semantic relationships. When using Claude Desktop with local filesystem tools or code execution, Claude can compile the archive directly.</p>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong style="color: var(--text-primary); font-size: var(--text-xs);">Google NotebookLM Workflow:</strong>
                  <p style="margin: 2px 0 0 0;">NotebookLM is ideal for ingesting proprietary PDFs and raw transcripts. While NotebookLM does not directly compile zip files, you can copy its synthesized study guides and source citations into a general-purpose model along with <code>FLOWDEN_RESEARCH_SPEC.md</code> to generate the structured package.</p>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong style="color: var(--status-warning); font-size: var(--text-xs);">ZIP Generation Fallback:</strong>
                  <p style="margin: 2px 0 0 0;">If your model cannot generate a binary zip, instruct it to output each file in Markdown/JSON code blocks. Save locally into the FKF structure and run: <code>zip -r my-research.flowden.zip manifest.json folders.json project notes sources relationships assets optional exports</code></p>
                </div>
                <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                  <strong style="color: var(--text-primary); font-size: var(--text-xs);">Package Versions & Diagnostics:</strong>
                  <p style="margin: 2px 0 0 0;">Flowden officially supports standalone single-document <code>.fkf</code> files (FKF 2.0, <code>format: "flowden-knowledge-format"</code>) alongside legacy <code>.flowden.zip</code> archive packages (FKF 1.x, <code>format: "flowden-knowledge-package"</code>). Both formats are validated strictly against their formal JSON schemas and imported into unified workspace entities.</p>
                </div>
              </div>
            </div>
          </details>

        </div>

      </section>

    </div>
  `;

  // =========================================================================
  // INTERACTION LOGIC & EVENT LISTENERS
  // =========================================================================

  // 1. Tab & View Navigation State Management
  const navTabs = container.querySelectorAll('.assistant-nav-tab');
  const viewPanels = container.querySelectorAll('.assistant-view-panel');

  const switchTab = (targetId) => {
    if (!targetId) return;
    if (targetId.startsWith('#')) targetId = targetId.slice(1);
    if (targetId === 'overview') targetId = 'ai-overview';
    if (targetId === 'mcp') targetId = 'mcp-integration';
    if (targetId === 'exchange' || targetId === 'ke') targetId = 'knowledge-exchange';

    let activeFound = false;
    viewPanels.forEach(panel => {
      const isMatch = panel.id === targetId;
      if (isMatch) activeFound = true;
      panel.classList.toggle('active', isMatch);
      panel.style.display = isMatch ? 'block' : 'none';
    });

    if (!activeFound && viewPanels.length > 0) {
      viewPanels[0].classList.add('active');
      viewPanels[0].style.display = 'block';
      targetId = viewPanels[0].id;
    }

    navTabs.forEach(tab => {
      const href = tab.getAttribute('href') || '';
      const dataTarget = tab.getAttribute('data-target') || '';
      const isMatch = href === `#${targetId}` || dataTarget === targetId;
      tab.classList.toggle('active', isMatch);
      tab.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      tab.tabIndex = isMatch ? 0 : -1;
      tab.style.backgroundColor = isMatch ? 'var(--bg-elevated)' : 'transparent';
      tab.style.borderColor = isMatch ? 'var(--border-primary)' : 'transparent';
      tab.style.color = isMatch ? 'var(--text-primary)' : 'var(--text-secondary)';
    });

    try {
      sessionStorage.setItem('flowden_assistant_active_tab', targetId);
    } catch (e) {}
  };

  navTabs.forEach((tab, index) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = tab.getAttribute('data-target') || tab.getAttribute('href');
      switchTab(targetId);
    });

    // Keyboard navigation (Arrow keys, Home, End)
    tab.addEventListener('keydown', (e) => {
      let newIndex = index;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        newIndex = (index + 1) % navTabs.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        newIndex = (index - 1 + navTabs.length) % navTabs.length;
      } else if (e.key === 'Home') {
        newIndex = 0;
      } else if (e.key === 'End') {
        newIndex = navTabs.length - 1;
      } else {
        return;
      }
      e.preventDefault();
      navTabs[newIndex].focus();
      const targetId = navTabs[newIndex].getAttribute('data-target') || navTabs[newIndex].getAttribute('href');
      switchTab(targetId);
    });
  });

  // Jump buttons on Overview cards
  container.querySelectorAll('.assistant-jump-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-target');
      switchTab(targetId);
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Check initial tab from location hash or sessionStorage
  const currentHash = (typeof window !== 'undefined' && window.location.hash) ? window.location.hash : '';
  let initialTab = 'ai-overview';
  if (currentHash.includes('mcp')) {
    initialTab = 'mcp-integration';
  } else if (currentHash.includes('exchange') || currentHash.includes('knowledge')) {
    initialTab = 'knowledge-exchange';
  } else {
    try {
      const savedTab = sessionStorage.getItem('flowden_assistant_active_tab');
      if (savedTab && ['ai-overview', 'mcp-integration', 'knowledge-exchange'].includes(savedTab)) {
        initialTab = savedTab;
      }
    } catch (e) {}
  }
  switchTab(initialTab);

  // 2. Resource Download Handler with Feedback
  container.querySelectorAll('.btn-download-resource').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const resourceKey = btn.getAttribute('data-resource');
      const filename = btn.getAttribute('data-filename');
      const origHtml = btn.innerHTML;
      btn.innerHTML = `<span class="spinner" style="width: 12px; height: 12px; border-width: 2px;"></span> <span>Downloading...</span>`;
      btn.style.pointerEvents = 'none';

      try {
        const res = await fetch(`/api/v1/exchange/resources/${encodeURIComponent(resourceKey)}`);
        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const objUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(objUrl);
        if (window.showToast) window.showToast(`Downloaded ${filename}`, 'success');
      } catch (err) {
        if (window.showToast) window.showToast(`Download failed: ${err.message}`, 'error');
      } finally {
        btn.innerHTML = origHtml;
        btn.style.pointerEvents = '';
      }
    });
  });

  // 3. Navigation to MCP Setup Guide
  const navigateToMcpGuide = () => {
    if (window.Router) {
      window.Router.navigate('/guide?tab=mcp');
    } else {
      window.location.hash = '#/guide?tab=mcp';
    }
  };

  document.getElementById('btn-header-mcp-guide')?.addEventListener('click', navigateToMcpGuide);

  // 4. Key Generator Helper
  document.getElementById('btn-generate-mcp-key')?.addEventListener('click', async () => {
    try {
      const res = await window.API.post('/users/mcp-key', {});
      if (res && res.apiKey) {
        document.getElementById('mcp-api-key').value = res.apiKey;
        mcpConfig.apiKey = res.apiKey;
        window.showToast('Generated fresh MCP token.', 'info');
      }
    } catch (e) {
      const key = 'fld_mcp_' + Array.from(crypto.getRandomValues(new Uint8Array(18))).map(b => b.toString(16).padStart(2, '0')).join('');
      document.getElementById('mcp-api-key').value = key;
      window.showToast('Generated fresh MCP token. Click "Save Configuration" to activate.', 'info');
    }
  });

  // 5. Copy Key Button
  document.getElementById('btn-copy-mcp-key')?.addEventListener('click', () => {
    const val = document.getElementById('mcp-api-key').value;
    if (!val) {
      window.showToast('No key to copy. Click "Generate New Key" first.', 'error');
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(val);
    }
    const btn = document.getElementById('btn-copy-mcp-key');
    const orig = btn.innerHTML;
    btn.innerHTML = `${getIcon('check')} <span>Copied!</span>`;
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
    window.showToast('MCP token copied to clipboard', 'success');
  });

  // 6. Disconnect MCP Button
  const disconnectBtn = document.getElementById('btn-disconnect-mcp');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to disconnect MCP and revoke this access token?')) {
        return;
      }

      userSettings.mcp = {
        serverUrl: mcpServerUrl,
        apiKey: '',
        scope: 'read_only',
        enabledProjects: [],
        projectFilterActive: true,
        updatedAt: new Date().toISOString()
      };

      try {
        const res = await window.API.put('/users/me', {
          settings_json: JSON.stringify(userSettings)
        });
        if (window.Auth) window.Auth.currentUser = res.user;
        localStorage.setItem('flowden_user', JSON.stringify(res.user));
        window.showToast('MCP server disconnected and token revoked.', 'info');
        renderAssistantPage(container);
      } catch (err) {
        window.showToast('Failed to disconnect MCP: ' + err.message, 'error');
      }
    });
  }

  // 7. Save Settings Handler
  document.getElementById('form-mcp-config')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const serverUrl = document.getElementById('mcp-server-url').value.trim();
    const rawKeyInput = document.getElementById('mcp-api-key').value.trim();
    const finalApiKey = rawKeyInput.includes('...') ? (mcpConfig.apiKey || rawKeyInput) : rawKeyInput;
    const scope = document.getElementById('mcp-scope-select').value;
    const enabledProjects = Array.from(document.querySelectorAll('.mcp-project-cb:checked')).map(cb => parseInt(cb.value, 10));

    userSettings.mcp = {
      serverUrl,
      apiKey: finalApiKey,
      scope,
      enabledProjects,
      projectFilterActive: true,
      updatedAt: new Date().toISOString()
    };

    try {
      const res = await window.API.put('/users/me', {
        settings_json: JSON.stringify(userSettings)
      });
      if (window.Auth) window.Auth.currentUser = res.user;
      localStorage.setItem('flowden_user', JSON.stringify(res.user));
      window.showToast('MCP configuration saved successfully', 'success');
      renderAssistantPage(container);
    } catch (err) {
      window.showToast('Failed to save configuration: ' + err.message, 'error');
    }
  });

  // 8. Live Test Connection Handler
  document.getElementById('btn-test-mcp-connection')?.addEventListener('click', async () => {
    const resultsEl = document.getElementById('mcp-test-results');
    const token = document.getElementById('mcp-api-key').value.trim();

    if (!token) {
      resultsEl.style.display = 'block';
      resultsEl.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: var(--space-2); color: var(--status-warning);">
          <span style="font-weight: 600;">Token Required:</span>
          <span class="text-xs text-secondary">Please generate and click "Save Configuration" before testing live connectivity.</span>
        </div>
      `;
      return;
    }

    resultsEl.style.display = 'block';
    resultsEl.innerHTML = `
      <div style="display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); color: var(--text-secondary);">
        <div class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></div>
        <span>Testing live MCP endpoint at /mcp/tools with Bearer authorization...</span>
      </div>
    `;

    const startMs = performance.now();
    try {
      const res = await fetch('/mcp/tools', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const latency = Math.round(performance.now() - startMs);

      if (res.ok) {
        const data = await res.json();
        const toolsList = data.tools || [];
        resultsEl.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); padding-bottom: var(--space-2); border-bottom: 1px solid var(--border-primary);">
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <span style="color: var(--status-success);">${getIcon('check')}</span>
              <strong style="font-size: var(--text-xs); color: var(--status-success);">HTTP 200 OK: MCP Server Ready</strong>
            </div>
            <div style="display: flex; gap: var(--space-2); font-size: 11px; font-family: var(--font-mono); color: var(--text-tertiary);">
              <span>Latency: ${latency}ms</span>
              <span>·</span>
              <span>${toolsList.length} Tools Online</span>
            </div>
          </div>
          <div style="font-size: var(--text-xs); color: var(--text-secondary);">
            Live verified tools ready for external models: <strong>${esc(toolsList.map(t => t.name).join(', '))}</strong>
          </div>
        `;
      } else {
        const errJson = await res.json().catch(() => ({}));
        resultsEl.innerHTML = `
          <div style="display: flex; align-items: center; gap: var(--space-2); color: var(--status-error);">
            <span>${getIcon('x')}</span>
            <strong style="font-size: var(--text-xs);">HTTP ${res.status}: ${esc(errJson.error || 'Connection Failed')}</strong>
          </div>
        `;
      }
    } catch (netErr) {
      resultsEl.innerHTML = `<div class="text-xs" style="color: var(--status-error);">Network Error: Cannot reach /mcp/tools</div>`;
    }
  });

  // 9. Refresh Security Events
  document.getElementById('refresh-sec-events-btn')?.addEventListener('click', async () => {
    try {
      const evRes = await window.API.get('/users/security-events?limit=8');
      const evs = (evRes && evRes.events) || [];
      const listEl = document.getElementById('user-sec-events-list');
      if (listEl) {
        listEl.innerHTML = evs.length === 0
          ? '<div class="text-xs text-secondary">No recent security events recorded.</div>'
          : evs.map(ev => `
              <div style="padding: 6px 8px; background-color: var(--bg-tertiary); border-radius: 4px; border: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: space-between;">
                <div>
                  <code style="font-size: 11px; color: var(--accent-deep, var(--accent-primary));">${esc(ev.event_type)}</code>
                  <div class="text-xs text-secondary">${ev.target_type ? esc(ev.target_type) : 'system'} ${ev.ip_address ? '· ' + esc(ev.ip_address) : ''}</div>
                </div>
                <span class="text-xs text-secondary">${ev.created_at ? new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>
            `).join('');
      }
      window.showToast('Security activity log refreshed', 'info');
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });

  // 10. Revoke All Sessions
  document.getElementById('revoke-all-sessions-btn')?.addEventListener('click', async () => {
    if (!confirm('Revoke all active sessions for your account? You will need to sign in again.')) return;
    try {
      await window.API.post('/auth/revoke-sessions', {});
      window.showToast('All active sessions revoked. Redirecting to sign in...', 'info');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 900);
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });

  // 11. Submit Security / Abuse Report
  document.getElementById('submit-sec-report-btn')?.addEventListener('click', async () => {
    const category = document.getElementById('sec-report-category')?.value || 'vulnerability';
    const descEl = document.getElementById('sec-report-description');
    const description = descEl ? descEl.value.trim() : '';
    if (!description || description.length < 5) {
      window.showToast('Please enter a clear description (at least 5 characters).', 'error');
      return;
    }
    try {
      await window.API.post('/users/security-report', {
        target_type: 'workspace',
        category,
        description
      });
      if (descEl) descEl.value = '';
      window.showToast('Security report submitted and logged for review.', 'success');
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });

  // 12. Flowden Knowledge Exchange Package Importer Triggers
  document.getElementById('btn-copy-universal-prompt')?.addEventListener('click', () => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(UNIVERSAL_RESEARCH_PROMPT).then(() => {
        const labelEl = document.getElementById('copy-prompt-label');
        if (labelEl) labelEl.textContent = 'Copied!';
        setTimeout(() => {
          if (labelEl) labelEl.textContent = 'Copy Universal Prompt';
        }, 2500);
        if (typeof window.showToast === 'function') {
          window.showToast('Universal Research Prompt copied to clipboard!', 'success');
        }
      }).catch(() => {
        if (typeof window.showToast === 'function') {
          window.showToast('Failed to copy prompt to clipboard.', 'error');
        }
      });
    }
  });

  const triggerPackageImport = () => {
    if (typeof window.openExchangeImportModal === 'function') {
      window.openExchangeImportModal({
        onImportComplete: (result) => {
          if (result && result.project && result.project.id) {
            window.location.hash = `#/projects/${result.project.id}`;
          }
        }
      });
    } else {
      window.showToast('Flowden Package Importer is loading...', 'info');
    }
  };

  document.getElementById('btn-top-import-package')?.addEventListener('click', triggerPackageImport);
  document.getElementById('btn-assistant-import-package')?.addEventListener('click', triggerPackageImport);
  document.getElementById('btn-callout-import-package')?.addEventListener('click', triggerPackageImport);
}

if (typeof window !== 'undefined') {
  window.renderAssistantPage = renderAssistantPage;
  window.AssistantPage = renderAssistantPage;
}
