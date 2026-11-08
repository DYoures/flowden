// Flowden Guide & Documentation Engine v2.0 - Segment 4
// Getting Started, Feature Library, Tips & Shortcuts, MCP Setup, What's New Changelog, and Interactive Tour trigger

function renderGuidePage(container, params = {}) {
  const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';
  const origin = (typeof window !== 'undefined' && window.location.origin) ? window.location.origin : 'http://localhost:3000';

  // Retrieve saved MCP key if available from local user profile
  let activeMcpKey = 'YOUR_PERSONAL_ACCESS_KEY';
  try {
    if (window.Auth && window.Auth.getUser) {
      const u = window.Auth.getUser() || {};
      const s = typeof u.settings_json === 'string' ? JSON.parse(u.settings_json || '{}') : (u.settings_json || {});
      if (s.mcp && s.mcp.apiKey) {
        activeMcpKey = s.mcp.apiKey;
      }
    }
  } catch (e) {}

  const claudeDesktopConfig = JSON.stringify({
    mcpServers: {
      flowden: {
        command: "node",
        args: ["server/mcp/index.js"],
        env: {
          FLOWDEN_API_URL: `${origin}/mcp`,
          FLOWDEN_API_KEY: activeMcpKey
        }
      }
    }
  }, null, 2);

  const cursorConfig = JSON.stringify({
    name: "flowden",
    type: "http",
    url: `${origin}/mcp`,
    headers: {
      Authorization: `Bearer ${activeMcpKey}`
    }
  }, null, 2);

  const curlTestCommand = `curl -X GET "${origin}/mcp/tools" \\\n  -H "Authorization: Bearer ${activeMcpKey}" \\\n  -H "Content-Type: application/json"`;

  container.innerHTML = `
    <div style="padding: var(--space-6); max-width: 1040px; margin: 0 auto;">
      <!-- Guide Header -->
      <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: var(--space-4); margin-bottom: var(--space-6); border-bottom: 1px solid var(--border-primary); padding-bottom: var(--space-6);">
        <div>
          <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1);">
            <h1 style="font-size: var(--text-xl); font-weight: var(--font-semibold);">Flowden Guide & Philosophy</h1>
            <span class="badge badge--primary" style="font-size: 11px;">v1.0 Ready</span>
          </div>
          <p class="text-secondary text-sm">
            "Turn scattered information into connected knowledge, and connected knowledge into meaningful action."
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
          <button class="btn btn--secondary btn--md" id="btn-start-vault-tour">
            ${getIcon('share-2')}
            <span>Start Knowledge Vault Tour</span>
          </button>
          <button class="btn btn--primary btn--md" id="btn-start-interactive-tour">
            ${getIcon('help-circle')}
            <span>Start Interactive Tour</span>
          </button>
        </div>
      </div>

      <!-- Guide Sub-navigation Tabs & Search -->
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-4); margin-bottom: var(--space-6);">
        <div class="segmented-control" id="guide-tabs-control">
          <button class="segmented-btn segmented-btn--active" data-tab="getting-started">Getting Started</button>
          <button class="segmented-btn" data-tab="features">Feature Library</button>
          <button class="segmented-btn" data-tab="tips">Tips & Shortcuts</button>
          <button class="segmented-btn" data-tab="mcp">MCP Setup</button>
          <button class="segmented-btn" data-tab="changelog">What's New</button>
        </div>

        <input type="text" id="guide-search-input" class="input" placeholder="Search guide sections..." style="height: 32px; width: 220px; font-size: var(--text-xs);" />
      </div>

      <!-- Tab 1: Getting Started -->
      <div class="guide-tab-pane" id="tab-getting-started">
        <!-- 5-Stage Value Chain -->
        <div class="card" style="padding: var(--space-5); margin-bottom: var(--space-6); background-color: var(--bg-secondary);">
          <h2 style="font-size: var(--text-md); font-weight: var(--font-semibold); margin-bottom: var(--space-3);">The 5-Stage Flowden Value Chain</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: var(--space-3);">
            <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border-top: 2px solid var(--project-amber);">
              <div style="font-weight: 600; font-size: var(--text-sm); margin-bottom: 2px;">1. Research</div>
              <div class="text-xs text-secondary">Ingest papers, articles, and raw files (.pdf, .docx, .md, .txt) with automated text extraction.</div>
            </div>

            <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border-top: 2px solid var(--project-blue);">
              <div style="font-weight: 600; font-size: var(--text-sm); margin-bottom: 2px;">2. Knowledge</div>
              <div class="text-xs text-secondary">Synthesize into markdown notes, folders, and conceptual taxonomies with bi-directional backlinks.</div>
            </div>

            <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border-top: 2px solid var(--accent-primary);">
              <div style="font-weight: 600; font-size: var(--text-sm); margin-bottom: 2px;">3. Connection</div>
              <div class="text-xs text-secondary">Link ideas with typed relationships (Supports, Contradicts, Inspired By) on spatial canvas and graph.</div>
            </div>

            <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border-top: 2px solid var(--project-violet);">
              <div style="font-weight: 600; font-size: var(--text-sm); margin-bottom: 2px;">4. Planning</div>
              <div class="text-xs text-secondary">Frame project scopes, architectural decision records (ADRs), and sprint milestones.</div>
            </div>

            <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border-top: 2px solid var(--status-success);">
              <div style="font-weight: 600; font-size: var(--text-sm); margin-bottom: 2px;">5. Execution</div>
              <div class="text-xs text-secondary">Deliver through prioritized tasks across Kanban Board, List View, and Calendar View.</div>
            </div>
          </div>
        </div>

        <!-- 3-Step Quick Start -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-6);">
          <div class="card" style="padding: var(--space-4);">
            <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);">
              <span class="badge badge--primary" style="font-size: 11px;">Step 1</span>
              <h3 style="font-size: var(--text-sm); font-weight: 600;">Create a Project</h3>
            </div>
            <p class="text-xs text-secondary" style="line-height: 1.5;">
              Navigate to <strong>Projects</strong> to initialize a workspace. Flowden automatically provisions a starter spatial board and decision log for every new project.
            </p>
          </div>

          <div class="card" style="padding: var(--space-4);">
            <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);">
              <span class="badge badge--primary" style="font-size: 11px;">Step 2</span>
              <h3 style="font-size: var(--text-sm); font-weight: 600;">Build Your Vault</h3>
            </div>
            <p class="text-xs text-secondary" style="line-height: 1.5;">
              Open the <strong>Knowledge Vault</strong> to write markdown notes. Type <code>[[Note Name]]</code> to form bi-directional backlinks and watch your Knowledge Graph evolve.
            </p>
          </div>

          <div class="card" style="padding: var(--space-4);">
            <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);">
              <span class="badge badge--primary" style="font-size: 11px;">Step 3</span>
              <h3 style="font-size: var(--text-sm); font-weight: 600;">Track & Execute</h3>
            </div>
            <p class="text-xs text-secondary" style="line-height: 1.5;">
              Convert decisions into actionable milestones on the <strong>Workflow Tracker</strong> using Kanban drag-and-drop, sortable list view, or calendar grid.
            </p>
          </div>
        </div>

        <!-- Universal Search Section -->
        <div class="card" id="guide-universal-search" style="padding: var(--space-5); margin-bottom: var(--space-6); background-color: var(--bg-secondary);">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-3);">
            <div style="display: flex; align-items: center; gap: var(--space-3);">
              <div style="width: 32px; height: 32px; border-radius: var(--radius-sm); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: center; color: var(--accent-primary);">
                ${getIcon('search')}
              </div>
              <div>
                <h2 style="font-size: var(--text-md); font-weight: 600; color: var(--text-primary); margin: 0 0 2px 0;">Universal Search</h2>
                <div class="text-xs text-secondary">Find and navigate workspace information from a single unified entry point</div>
              </div>
            </div>
            <span class="badge badge--primary" style="font-size: 11px;">Ctrl + K</span>
          </div>

          <p class="text-sm text-secondary" style="line-height: var(--lh-relaxed); margin-bottom: var(--space-4);">
            Universal Search helps users find information across their Flowden workspace from one place. Whether you are looking for an active project, an architectural note, a pending deliverable, a spatial board, or literature documentation, Universal Search indexes your workspace records and lets you jump directly to them.
          </p>

          <!-- 5 Supported Categories Grid -->
          <div style="margin-bottom: var(--space-5);">
            <div style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: var(--space-3); letter-spacing: 0.04em;">
              Supported Search Categories
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3);">
              <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); border-top: 2px solid var(--project-amber);">
                <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: 2px;">
                  <span style="color: var(--project-amber);">${getIcon('folder')}</span>
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary);">1. Projects</div>
                </div>
                <div class="text-xs text-secondary" style="line-height: 1.4;">Project workspaces, titles, descriptions, and repository context.</div>
              </div>

              <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); border-top: 2px solid var(--project-blue);">
                <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: 2px;">
                  <span style="color: var(--project-blue);">${getIcon('book-open')}</span>
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary);">2. Knowledge Notes</div>
                </div>
                <div class="text-xs text-secondary" style="line-height: 1.4;">Vault markdown notes, body text, tags, and conceptual records.</div>
              </div>

              <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); border-top: 2px solid var(--status-success);">
                <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: 2px;">
                  <span style="color: var(--status-success);">${getIcon('check-square')}</span>
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary);">3. Workflow Tasks</div>
                </div>
                <div class="text-xs text-secondary" style="line-height: 1.4;">Deliverable titles, task descriptions, priorities, and workflow milestones.</div>
              </div>

              <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); border-top: 2px solid var(--accent-primary);">
                <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: 2px;">
                  <span style="color: var(--accent-primary);">${getIcon('layout-grid')}</span>
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary);">4. Spatial Boards</div>
                </div>
                <div class="text-xs text-secondary" style="line-height: 1.4;">Infinite canvas boards and visual workspace boards.</div>
              </div>

              <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); border-top: 2px solid var(--project-violet);">
                <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: 2px;">
                  <span style="color: var(--project-violet);">${getIcon('file-search')}</span>
                  <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary);">5. Research Documents</div>
                </div>
                <div class="text-xs text-secondary" style="line-height: 1.4;">Indexed literature files, document titles, abstracts, and summaries.</div>
              </div>
            </div>
          </div>

          <!-- How to Access & Search -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-4);">
            <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary); margin-bottom: var(--space-2); display: flex; align-items: center; gap: var(--space-2);">
                <span class="badge" style="background: var(--bg-elevated); font-size: 10px;">Access</span>
                <span>Opening Universal Search</span>
              </div>
              <ul style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.6; margin: 0; padding-left: 18px;">
                <li><strong>Topbar Search Field:</strong> Click the "Search workspace..." button located on the top-right bar of the application.</li>
                <li><strong>Keyboard Shortcut:</strong> Press <code>Ctrl + K</code> (or <code>Cmd + K</code> on macOS) from anywhere in Flowden to instantly display the Command Palette overlay.</li>
              </ul>
            </div>

            <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary); margin-bottom: var(--space-2); display: flex; align-items: center; gap: var(--space-2);">
                <span class="badge" style="background: var(--bg-elevated); font-size: 10px;">Query</span>
                <span>Searching & Viewing Results</span>
              </div>
              <ul style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.6; margin: 0; padding-left: 18px;">
                <li><strong>Keyword Matching:</strong> Enter keywords to query records across all five supported categories. Results update dynamically as you type.</li>
                <li><strong>Quick Selection & Enter:</strong> Use the arrow keys to pick a result directly, or press <code>Enter</code> to open the full dedicated Search Results page.</li>
              </ul>
            </div>
          </div>

          <!-- Destinations & Authorization -->
          <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border-left: 3px solid var(--status-success);">
            <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary); margin-bottom: var(--space-1); display: flex; align-items: center; gap: var(--space-2);">
              <span style="color: var(--status-success);">${getIcon('shield-check')}</span>
              <span>Navigation Destinations & Access Permissions</span>
            </div>
            <p class="text-xs text-secondary" style="line-height: 1.5; margin: 0;">
              Selecting any result automatically navigates to its native destination in your workspace (such as opening the specific note in Knowledge Vault, jumping to the Spatial Board, or focusing the task in Workflow Tracker). Universal Search strictly enforces workspace security: query results only include items from projects and workspaces that you are authorized to view.
            </p>
          </div>
        </div>
      </div>

      <!-- Tab 2: Feature Library -->
      <div class="guide-tab-pane" id="tab-features" style="display: none;">
        <div style="display: flex; flex-direction: column; gap: var(--space-4);">
          <div class="card guide-feature-item" style="padding: var(--space-4);">
            <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-1);">
              <span style="color: var(--accent-primary);">${getIcon('layout-grid')}</span>
              <h3 class="card-title">Modern Spatial Workspace Board</h3>
            </div>
            <p class="text-secondary text-sm">
              Infinite canvas with snap-to-grid, pan/zoom, card groups, and visual cubic-bezier connection wires. Organizes notes, ideas, images, links, research references, tasks, and documents in 2D space.
            </p>
          </div>

          <div class="card guide-feature-item" style="padding: var(--space-5);">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-2);">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <span style="color: var(--project-blue);">${getIcon('book-open')}</span>
                <h3 class="card-title" style="margin: 0;">Knowledge Vault 2.0 & Connected Knowledge</h3>
              </div>
              <span class="badge badge--primary" style="font-size: 11px;">Authoring & Synthesis</span>
            </div>
            <p class="text-secondary text-sm" style="line-height: 1.6; margin-bottom: var(--space-3);">
              Distraction-free Markdown editor and interconnected knowledge base inspired by Notion and Obsidian. Knowledge Vault enables users to capture ideas, organize hierarchies, connect concepts, and bridge synthesized thoughts directly into actionable execution.
            </p>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-3);">
              <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary); margin-bottom: 2px;">1. Organization & Folders</div>
                <div class="text-xs text-secondary" style="line-height: 1.4;">Structure notes into nested folder trees, categorize with #tags, and switch between Edit, Split, and Read viewing modes.</div>
              </div>

              <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary); margin-bottom: 2px;">2. Semantic Note Connections</div>
                <div class="text-xs text-secondary" style="line-height: 1.4;">Use Connect Note to establish explicit relationships (Supports, Contradicts, Inspired By, Depends On, References). Bidirectional and non-destructive.</div>
              </div>

              <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary); margin-bottom: 2px;">3. Backlinks & Unlinked Mentions</div>
                <div class="text-xs text-secondary" style="line-height: 1.4;">Type [[Note Title]] to create wiki links. The bottom tray surfaces incoming references and scans for unlinked text mentions.</div>
              </div>

              <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary); margin-bottom: 2px;">4. Knowledge Graph & Tasks</div>
                <div class="text-xs text-secondary" style="line-height: 1.4;">Connected notes form relationship wires in the Knowledge Graph. Use + Task to attach Workflow Tracker deliverables.</div>
              </div>
            </div>

            <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border-left: 3px solid var(--accent-primary);">
              <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary); margin-bottom: 2px;">Interactive Tour & Contextual Help</div>
              <p class="text-xs text-secondary" style="margin: 0; line-height: 1.5;">
                Click the Help (?) button in the Knowledge Vault editor toolbar to launch the 8-step guided tour or inspect contextual feature explainers without leaving your writing flow. You can also restart the tour anytime using the header button above.
              </p>
            </div>
          </div>

          <div class="card guide-feature-item" style="padding: var(--space-4);">
            <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-1);">
              <span style="color: var(--accent-primary);">${getIcon('share-2')}</span>
              <h3 class="card-title">Knowledge Graph v3.0</h3>
            </div>
            <p class="text-secondary text-sm">
              Force-directed knowledge network with gradient circular nodes, floating titles, customizable themes (Ocean, Emerald, Sunset, Silver, Teal & Slate), node-level overrides, and boundary arrow attachment.
            </p>
          </div>

          <div class="card guide-feature-item" style="padding: var(--space-4);">
            <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-1);">
              <span style="color: var(--status-success);">${getIcon('check-square')}</span>
              <h3 class="card-title">Workflow Tracker Multi-View</h3>
            </div>
            <p class="text-secondary text-sm">
              Complete deliverable tracking engine offering HTML5 Kanban drag-and-drop columns, sortable List View with inline status cycling and bulk actions, and monthly Calendar View with date-prefilled task creation.
            </p>
          </div>

          <div class="card guide-feature-item" style="padding: var(--space-4);">
            <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-1);">
              <span style="color: var(--project-amber);">${getIcon('file-search')}</span>
              <h3 class="card-title">Research Bridge</h3>
            </div>
            <p class="text-secondary text-sm">
              Ingest literature files (.PDF, .DOCX, .MD, .TXT) with automated text extraction, executive summaries, source URL citations, and one-click note bridging into the Knowledge Vault.
            </p>
          </div>

          <div class="card guide-feature-item" style="padding: var(--space-4);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-1);">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <span style="color: var(--accent-primary);">${getIcon('search')}</span>
                <h3 class="card-title">Universal Search</h3>
              </div>
              <span class="badge badge--primary" style="font-size: 10px;">Ctrl+K</span>
            </div>
            <p class="text-secondary text-sm">
              Unified workspace discovery engine across Projects, Knowledge Notes, Workflow Tasks, Spatial Boards, and Research Documents with Ctrl+K Command Palette, keyword querying, and permission-filtered results.
            </p>
          </div>
        </div>
      </div>

      <!-- Tab 3: Tips & Shortcuts -->
      <div class="guide-tab-pane" id="tab-tips" style="display: none;">
        <div class="card" style="padding: var(--space-5); margin-bottom: var(--space-4);">
          <h2 style="font-size: var(--text-md); font-weight: var(--font-semibold); margin-bottom: var(--space-3);">Keyboard Shortcuts</h2>
          <table style="width: 100%; border-collapse: collapse; font-size: var(--text-sm);">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-primary); text-align: left; color: var(--text-tertiary);">
                <th style="padding: var(--space-2) 0;">Action</th>
                <th style="padding: var(--space-2) 0; text-align: right;">Shortcut</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid var(--border-primary);">
                <td style="padding: var(--space-2) 0;">Open Universal Search / Command Palette</td>
                <td style="padding: var(--space-2) 0; text-align: right;"><code>Ctrl + K</code> or <code>Cmd + K</code></td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-primary);">
                <td style="padding: var(--space-2) 0;">Quick Capture Thought</td>
                <td style="padding: var(--space-2) 0; text-align: right;"><code>Alt + Q</code> or <code>Q</code> in palette</td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-primary);">
                <td style="padding: var(--space-2) 0;">Close Active Modal / Dropdown / Tour</td>
                <td style="padding: var(--space-2) 0; text-align: right;"><code>Escape</code></td>
              </tr>
              <tr style="border-bottom: 1px solid var(--border-primary);">
                <td style="padding: var(--space-2) 0;">Toggle Sidebar Collapse</td>
                <td style="padding: var(--space-2) 0; text-align: right;"><code>Ctrl + B</code></td>
              </tr>
              <tr>
                <td style="padding: var(--space-2) 0;">Internal Wiki Link in Markdown</td>
                <td style="padding: var(--space-2) 0; text-align: right;"><code>[[Target Note Title]]</code></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="card" style="padding: var(--space-5); margin-bottom: var(--space-4);">
          <h2 style="font-size: var(--text-md); font-weight: var(--font-semibold); margin-bottom: var(--space-2);">Power-User Workflow: Literature to Execution</h2>
          <ol style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.8; padding-left: 20px; margin: 0;">
            <li>Drag a PDF whitepaper or research report into the <strong>Research Center</strong>.</li>
            <li>Inspect the extracted abstract and click <strong>Bridge to Vault Note</strong> to synthesize findings.</li>
            <li>Link concepts to other ideas using <code>[[wikilinks]]</code> and observe relationship paths in the <strong>Knowledge Graph</strong>.</li>
            <li>Document high-level architectural decisions in the project <strong>Decision Log</strong>.</li>
            <li>Create actionable tasks in the <strong>Workflow Tracker</strong> to guide real-world execution.</li>
          </ol>
        </div>

        <div class="card" style="padding: var(--space-5);">
          <h2 style="font-size: var(--text-md); font-weight: var(--font-semibold); margin-bottom: var(--space-2);">Platform Governance & Policies</h2>
          <p class="text-xs text-secondary" style="line-height: 1.5; margin-bottom: var(--space-3);">
            Review Flowden's operational data policies and user agreements:
          </p>
          <div style="display: flex; gap: var(--space-3);">
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" class="btn btn--secondary btn--sm">Privacy Policy</a>
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" class="btn btn--secondary btn--sm">Terms and Conditions</a>
          </div>
        </div>
      </div>

      <!-- Tab 4: MCP Setup -->
      <div class="guide-tab-pane" id="tab-mcp" style="display: none;">
        <!-- Overview & Value Proposition -->
        <div class="card" style="padding: var(--space-5); margin-bottom: var(--space-5); background-color: var(--bg-secondary);">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-3);">
            <div style="display: flex; align-items: center; gap: var(--space-3);">
              <div style="width: 36px; height: 36px; border-radius: var(--radius-sm); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: center; color: var(--accent-primary);">
                ${getIcon('cpu')}
              </div>
              <div>
                <h2 style="font-size: var(--text-md); font-weight: 600; color: var(--text-primary); margin: 0 0 2px 0;">Model Context Protocol (MCP) Setup</h2>
                <div class="text-xs text-secondary">Connect external reasoning models directly to verified workspace knowledge</div>
              </div>
            </div>
            <a href="#/assistant" class="btn btn--secondary btn--sm">
              ${getIcon('settings')} <span>Open MCP Server Settings</span>
            </a>
          </div>
          <p class="text-sm text-secondary" style="line-height: var(--lh-relaxed); margin-bottom: var(--space-4);">
            The Model Context Protocol (MCP) is an open industry standard that allows external AI reasoning clients (such as Claude Desktop, Cursor IDE, Google Antigravity, or terminal scripts) to safely query and explore your Flowden workspace. Instead of copying and pasting documents, your model can directly read active project boards, query markdown notes, search research citations, and retrieve workflow deliverables.
          </p>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3);">
            <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <div style="font-size: 11px; font-weight: 600; color: var(--accent-primary); margin-bottom: 2px;">read_project_context</div>
              <div class="text-xs text-secondary">Inspect project briefs, canvas cards, and architectural decisions.</div>
            </div>
            <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <div style="font-size: 11px; font-weight: 600; color: var(--project-violet); margin-bottom: 2px;">search_vault_knowledge</div>
              <div class="text-xs text-secondary">Query markdown notes, folders, and [[wikilink]] paths.</div>
            </div>
            <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <div style="font-size: 11px; font-weight: 600; color: var(--status-warning); margin-bottom: 2px;">get_research_sources</div>
              <div class="text-xs text-secondary">Fetch literature citations, abstracts, and extracted documents.</div>
            </div>
            <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <div style="font-size: 11px; font-weight: 600; color: var(--status-success); margin-bottom: 2px;">get_workflow_tasks</div>
              <div class="text-xs text-secondary">Retrieve planned milestones, priorities, and deliverable states.</div>
            </div>
            <div style="padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <div style="font-size: 11px; font-weight: 600; color: var(--project-blue); margin-bottom: 2px;">get_knowledge_connections</div>
              <div class="text-xs text-secondary">Query bi-directional graph topology and typed relationship wires.</div>
            </div>
          </div>
        </div>

        <!-- Prerequisites Checklist -->
        <div class="card" style="padding: var(--space-4) var(--space-5); margin-bottom: var(--space-5); border-left: 3px solid var(--accent-primary); background-color: var(--bg-tertiary);">
          <div style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; color: var(--accent-primary); margin-bottom: var(--space-2); letter-spacing: 0.04em;">
            Prerequisites Checklist
          </div>
          <ul style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.7; margin: 0; padding-left: 18px;">
            <li>Flowden application is running locally (e.g. <code>${origin}</code>).</li>
            <li>You are logged in with an active account with at least one project created.</li>
            <li>An MCP-compatible client is installed: Claude Desktop, Cursor IDE, Google Antigravity, or terminal cURL.</li>
          </ul>
        </div>

        <!-- Numbered Step-by-Step Instructions -->
        <div class="card" style="padding: var(--space-5); margin-bottom: var(--space-5); background-color: var(--bg-secondary);">
          <h3 style="font-size: var(--text-md); font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-4);">Step-by-Step Setup Instructions</h3>

          <!-- Step 1 -->
          <div style="margin-bottom: var(--space-6);">
            <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2);">
              <div class="step-indicator">1</div>
              <h4 style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin: 0;">Generate & Save Your Personal Access Key</h4>
            </div>
            <p class="text-xs text-secondary" style="line-height: 1.6; margin-bottom: var(--space-2); padding-left: 38px;">
              Open the <strong>AI Assistant & MCP</strong> page (or click <a href="#/assistant" style="color: var(--accent-primary); text-decoration: underline;">Open MCP Server Settings</a>):
            </p>
            <ol style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.7; margin-bottom: var(--space-3); padding-left: 56px;">
              <li>Under <strong>MCP Server Configuration</strong>, click <strong>Generate New Key</strong>. A secure random token starting with <code>fld_mcp_</code> will be created.</li>
              <li>Select your permission level: <strong>Strict Read-Only</strong> (recommended default) or <strong>Read & Suggest</strong>.</li>
              <li>Check the project workspaces you want the external AI model to access. Unchecked projects remain completely hidden.</li>
              <li>Click <strong>Save Configuration</strong>. This activates and encrypts your key in your local profile.</li>
            </ol>
          </div>

          <!-- Step 2 -->
          <div style="margin-bottom: var(--space-6);">
            <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2);">
              <div class="step-indicator">2</div>
              <h4 style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin: 0;">Configure Your Preferred AI Client</h4>
            </div>
            <p class="text-xs text-secondary" style="line-height: 1.6; margin-bottom: var(--space-3); padding-left: 38px;">
              Select your client below and copy the pre-formatted configuration block into your client configuration file:
            </p>

            <div style="padding-left: 38px;">
              <div class="mcp-tab-bar">
                <button class="mcp-tab-btn is-active" data-client-tab="claude">Claude Desktop</button>
                <button class="mcp-tab-btn" data-client-tab="cursor">Cursor / Antigravity</button>
                <button class="mcp-tab-btn" data-client-tab="curl">cURL / Terminal Test</button>
              </div>

              <!-- Claude Desktop -->
              <div class="mcp-client-pane" id="guide-pane-claude">
                <p class="text-xs text-secondary" style="margin-bottom: var(--space-2);">
                  Open your Claude Desktop configuration file:
                  <br>&bull; Windows: <code>%APPDATA%\\Claude\\claude_desktop_config.json</code>
                  <br>&bull; macOS: <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>
                </p>
                <div class="mcp-code-block">
                  <div class="mcp-code-header">
                    <span>claude_desktop_config.json</span>
                    <button type="button" class="btn btn--ghost btn--sm btn-copy-code" data-code="${encodeURIComponent(claudeDesktopConfig)}">
                      ${getIcon('file-text')} <span>Copy Config</span>
                    </button>
                  </div>
                  <pre class="mcp-code-content"><code>${claudeDesktopConfig.replace(/</g, '&lt;')}</code></pre>
                </div>
              </div>

              <!-- Cursor / Antigravity -->
              <div class="mcp-client-pane" id="guide-pane-cursor" style="display: none;">
                <p class="text-xs text-secondary" style="margin-bottom: var(--space-2);">
                  In Cursor or Antigravity Settings &rarr; Features &rarr; MCP Servers, configure an HTTP endpoint:
                </p>
                <div class="mcp-code-block">
                  <div class="mcp-code-header">
                    <span>mcp-http-config.json</span>
                    <button type="button" class="btn btn--ghost btn--sm btn-copy-code" data-code="${encodeURIComponent(cursorConfig)}">
                      ${getIcon('file-text')} <span>Copy Config</span>
                    </button>
                  </div>
                  <pre class="mcp-code-content"><code>${cursorConfig.replace(/</g, '&lt;')}</code></pre>
                </div>
              </div>

              <!-- cURL -->
              <div class="mcp-client-pane" id="guide-pane-curl" style="display: none;">
                <p class="text-xs text-secondary" style="margin-bottom: var(--space-2);">
                  Run this command in any shell (PowerShell, Bash, or Zsh) to verify live connectivity and list available tools:
                </p>
                <div class="mcp-code-block">
                  <div class="mcp-code-header">
                    <span>terminal</span>
                    <button type="button" class="btn btn--ghost btn--sm btn-copy-code" data-code="${encodeURIComponent(curlTestCommand)}">
                      ${getIcon('file-text')} <span>Copy Command</span>
                    </button>
                  </div>
                  <pre class="mcp-code-content"><code>${curlTestCommand.replace(/</g, '&lt;')}</code></pre>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 3 -->
          <div style="margin-bottom: var(--space-6);">
            <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2);">
              <div class="step-indicator">3</div>
              <h4 style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin: 0;">Verify Connection & Run Sample Prompts</h4>
            </div>
            <p class="text-xs text-secondary" style="line-height: 1.6; margin-bottom: var(--space-2); padding-left: 38px;">
              Restart your external client (e.g. restart Claude Desktop or reload Cursor window).
            </p>
            <ul style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.7; margin-bottom: var(--space-3); padding-left: 56px;">
              <li><strong>Verify in Flowden:</strong> Open the AI Assistant page and click <strong>Test Live Connection</strong> to test the endpoint directly.</li>
              <li><strong>Verify in External Client:</strong> Look for the tool hammer icon. You will see <code>flowden</code> with 5 tools listed.</li>
            </ul>
            <div style="padding-left: 38px;">
              <div style="padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
                <div style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Example Prompts to Try:</div>
                <ul style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.6; margin: 0; padding-left: 18px;">
                  <li><em>"Search my Flowden knowledge vault for notes about system architecture."</em></li>
                  <li><em>"What are the urgent tasks currently planned in my Flowden project?"</em></li>
                  <li><em>"Summarize the research papers and citations indexed in my workspace."</em></li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Step 4 -->
          <div>
            <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2);">
              <div class="step-indicator">4</div>
              <h4 style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin: 0;">Managing Server Lifecycle (Disconnect, Reconnect, Revoke)</h4>
            </div>
            <p class="text-xs text-secondary" style="line-height: 1.6; margin-bottom: var(--space-2); padding-left: 38px;">
              You maintain total control over your workspace data and connection lifecycle:
            </p>
            <ul style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.7; margin-bottom: 0; padding-left: 56px;">
              <li><strong>Disconnect / Pause:</strong> Click <strong>Disconnect MCP</strong> in the configuration box. This immediately revokes the active token in the database, blocking all external requests until reconnected.</li>
              <li><strong>Reconnect / Rotate Token:</strong> Click <strong>Generate New Key</strong>, then click <strong>Save Configuration</strong>. Update the token in your external client configuration.</li>
              <li><strong>Revoke Access for Specific Projects:</strong> Uncheck the project under <strong>Authorized Project Workspaces</strong> and click <strong>Save Configuration</strong>. The external model will immediately be blocked from querying that project.</li>
            </ul>
          </div>
        </div>

        <!-- Security Notice -->
        <div class="card" style="padding: var(--space-4) var(--space-5); margin-bottom: var(--space-5); background-color: var(--bg-elevated); border-left: 3px solid var(--status-warning);">
          <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: 4px;">
            <span style="color: var(--status-warning);">${getIcon('shield-check')}</span>
            <h4 style="font-size: var(--text-sm); font-weight: 600; color: var(--status-warning); margin: 0;">Security & Credential Guidelines</h4>
          </div>
          <ul style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.6; margin: 0; padding-left: 18px;">
            <li><strong>Never Commit Keys to Version Control:</strong> Do not commit client configuration files containing live tokens to public Git repositories.</li>
            <li><strong>Local Storage Only:</strong> Flowden never transmits your personal access token to third-party cloud servers. It is verified strictly against your local database instance.</li>
            <li><strong>Non-Destructive Defaults:</strong> Flowden defaults to Strict Read-Only mode. External AI models cannot delete or overwrite your boards or notes unless you explicitly assign write scopes.</li>
          </ul>
        </div>

        <!-- Troubleshooting Common Errors -->
        <div class="card" style="padding: var(--space-5); background-color: var(--bg-secondary);">
          <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3);">
            <span style="color: var(--accent-deep, var(--accent-primary));">${getIcon('help-circle')}</span>
            <h3 style="font-size: var(--text-md); font-weight: 600; color: var(--text-primary); margin: 0;">Troubleshooting Common Errors</h3>
          </div>
          <p class="text-xs text-secondary" style="line-height: 1.5; margin-bottom: var(--space-4);">
            If your external client fails to connect or tools return unexpected responses, check these practical fixes:
          </p>

          <div class="troubleshoot-grid">
            <div class="troubleshoot-card">
              <div class="troubleshoot-header">
                <span class="badge" style="background: rgba(224, 82, 77, 0.12); color: #ef4444; font-size: 10px;">HTTP 401</span>
                <span style="font-size: 11px; font-family: var(--font-mono); color: var(--text-tertiary);">AUTH_REQUIRED</span>
              </div>
              <div style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Missing Bearer Token</div>
              <div class="text-xs text-secondary" style="line-height: 1.5;">
                <strong>Cause:</strong> Request header omitted the authorization token.
                <br><strong>Solution:</strong> Ensure your client passes <code>Authorization: Bearer &lt;token&gt;</code> in its HTTP headers.
              </div>
            </div>

            <div class="troubleshoot-card">
              <div class="troubleshoot-header">
                <span class="badge" style="background: rgba(224, 160, 64, 0.12); color: #f59e0b; font-size: 10px;">HTTP 403</span>
                <span style="font-size: 11px; font-family: var(--font-mono); color: var(--text-tertiary);">INVALID_TOKEN</span>
              </div>
              <div style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Invalid or Unsaved Token</div>
              <div class="text-xs text-secondary" style="line-height: 1.5;">
                <strong>Cause:</strong> Token does not match what is in the database.
                <br><strong>Solution:</strong> Make sure you clicked <strong>Save Configuration</strong> after generating a new key, and paste the exact key into your client config.
              </div>
            </div>

            <div class="troubleshoot-card">
              <div class="troubleshoot-header">
                <span class="badge" style="background: rgba(148, 163, 184, 0.12); color: #94a3b8; font-size: 10px;">Connection Refused</span>
                <span style="font-size: 11px; font-family: var(--font-mono); color: var(--text-tertiary);">ECONNREFUSED</span>
              </div>
              <div style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Flowden Server Is Offline</div>
              <div class="text-xs text-secondary" style="line-height: 1.5;">
                <strong>Cause:</strong> Flowden development server is not running on port 3000.
                <br><strong>Solution:</strong> In terminal, start the server using <code>npm run dev</code> and verify that <code>http://localhost:3000/api/health</code> returns HTTP 200.
              </div>
            </div>

            <div class="troubleshoot-card">
              <div class="troubleshoot-header">
                <span class="badge" style="background: var(--accent-soft, rgba(120, 200, 178, 0.12)); color: var(--accent-deep, var(--accent-primary)); font-size: 10px;">Empty Results</span>
                <span style="font-size: 11px; font-family: var(--font-mono); color: var(--text-tertiary);">EMPTY_DATA</span>
              </div>
              <div style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Zero Projects or Notes Returned</div>
              <div class="text-xs text-secondary" style="line-height: 1.5;">
                <strong>Cause:</strong> The requested project is not checked under Authorized Projects.
                <br><strong>Solution:</strong> In Flowden MCP Settings, check the project box and click <strong>Save Configuration</strong> to grant external read permissions.
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 5: What's New Changelog -->
      <div class="guide-tab-pane" id="tab-changelog" style="display: none;">
        <div style="display: flex; flex-direction: column; gap: var(--space-4);">
          <div class="card" style="padding: var(--space-4); border-left: 3px solid var(--accent-primary);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2);">
              <strong style="font-size: var(--text-sm); color: var(--text-primary);">Flowden v1.0.0: Final Integration & Segment 4</strong>
              <span class="badge badge--primary" style="font-size: 10px;">Latest Release</span>
            </div>
            <ul style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.6; padding-left: 16px; margin: 0;">
              <li><strong>Workflow Multi-View</strong>: Full Kanban drag & drop, sortable List View, and interactive monthly Calendar View.</li>
              <li><strong>Research Bridge</strong>: Full file ingestion for .PDF, .DOCX, .MD, and .TXT with automated text extraction.</li>
              <li><strong>Version History</strong>: Snapshot versioning with visual diffs and one-click restoration.</li>
              <li><strong>Interactive Guided Tour</strong>: Step-by-step walkthrough covering all workspace surfaces.</li>
              <li><strong>MCP Architecture Foundation</strong>: Standardized Model Context Protocol primitives and developer specs.</li>
            </ul>
          </div>

          <div class="card" style="padding: var(--space-4); border-left: 3px solid var(--project-violet);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2);">
              <strong style="font-size: var(--text-sm); color: var(--text-primary);">Flowden Segment 3.5: Deep Charcoal & Visual Redesign</strong>
              <span class="badge" style="background: var(--bg-tertiary); font-size: 10px;">Redesign</span>
            </div>
            <ul style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.6; padding-left: 16px; margin: 0;">
              <li>Neutral Deep Charcoal color tokens ('#191D20') and Warm Off-White ('#F4F2EC').</li>
              <li>FLOWDEN modern typography wordmark with crisp geometric SVG emblem.</li>
              <li>Knowledge Graph v3.0 with radial gradient circular nodes, customizable presets (Ocean, Emerald, Sunset, Silver, Teal & Slate), and precise tangent boundary arrowheads.</li>
              <li>Resizable vertical splitters for Knowledge Vault panels.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `;

  // Main tab switching logic
  const tabs = container.querySelectorAll('#guide-tabs-control .segmented-btn');
  const panes = container.querySelectorAll('.guide-tab-pane');

  function switchTab(targetTab) {
    let matched = false;
    tabs.forEach(b => {
      if (b.getAttribute('data-tab') === targetTab) {
        b.classList.add('segmented-btn--active');
        matched = true;
      } else {
        b.classList.remove('segmented-btn--active');
      }
    });

    if (matched) {
      panes.forEach(p => { p.style.display = 'none'; });
      const activePane = container.querySelector(`#tab-${targetTab}`);
      if (activePane) activePane.style.display = 'block';
    }
  }

  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  // Client Selection Sub-Tabs within MCP Guide
  const clientTabBtns = container.querySelectorAll('#tab-mcp .mcp-tab-btn');
  clientTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      clientTabBtns.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const target = btn.getAttribute('data-client-tab');
      container.querySelectorAll('#tab-mcp .mcp-client-pane').forEach(p => { p.style.display = 'none'; });
      const pane = container.querySelector(`#tab-mcp #guide-pane-${target}`);
      if (pane) pane.style.display = 'block';
    });
  });

  // Code Copy Buttons within MCP Guide
  container.querySelectorAll('#tab-mcp .btn-copy-code').forEach(btn => {
    btn.addEventListener('click', () => {
      const raw = decodeURIComponent(btn.getAttribute('data-code') || '');
      if (raw) {
        navigator.clipboard.writeText(raw);
        const orig = btn.innerHTML;
        btn.innerHTML = `${getIcon('check')} <span>Copied!</span>`;
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
        if (window.showToast) window.showToast('Configuration copied to clipboard', 'success');
      }
    });
  });

  // Activate initial tab if specified (via route params or query string)
  let initialTab = (params && params.tab) ? params.tab : null;
  if (!initialTab && window.location.hash.includes('?')) {
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    initialTab = urlParams.get('tab');
  }

  if (initialTab === 'search') {
    initialTab = 'getting-started';
  }

  if (initialTab && container.querySelector(`#tab-${initialTab}`)) {
    switchTab(initialTab);
  }

  // Tour trigger
  const tourBtn = document.getElementById('btn-start-interactive-tour');
  if (tourBtn) {
    if (window.FlowdenTour && window.FlowdenTour.isCompleted()) {
      tourBtn.innerHTML = `${getIcon('help-circle')} <span>Restart Interactive Tour</span>`;
    }

    tourBtn.addEventListener('click', () => {
      if (window.FlowdenTour) {
        if (window.FlowdenTour.isCompleted()) {
          window.FlowdenTour.reset();
        }
        window.FlowdenTour.start();
      } else {
        window.showToast('Tour engine not loaded. Please refresh the page.', 'error');
      }
    });
  }

  // Vault Tour trigger
  const vaultTourBtn = document.getElementById('btn-start-vault-tour');
  if (vaultTourBtn) {
    if (window.FlowdenTour && window.FlowdenTour.isVaultTourCompleted && window.FlowdenTour.isVaultTourCompleted()) {
      vaultTourBtn.innerHTML = `${getIcon('share-2')} <span>Restart Knowledge Vault Tour</span>`;
    }

    vaultTourBtn.addEventListener('click', () => {
      if (window.FlowdenTour) {
        if (window.FlowdenTour.isVaultTourCompleted && window.FlowdenTour.isVaultTourCompleted()) {
          window.FlowdenTour.reset('vault');
        }
        window.FlowdenTour.start('vault');
      } else {
        window.showToast('Tour engine not loaded. Please refresh the page.', 'error');
      }
    });
  }

  // Live search inside guide
  const searchInput = document.getElementById('guide-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const items = container.querySelectorAll('.guide-feature-item, .card');
      items.forEach(it => {
        if (!q) {
          it.style.display = '';
        } else {
          const text = it.textContent.toLowerCase();
          it.style.display = text.includes(q) ? '' : 'none';
        }
      });
    });
  }
}

if (typeof window !== 'undefined') {
  window.renderGuidePage = renderGuidePage;
}
