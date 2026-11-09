// public/js/pages/vault.js
// Flowden Knowledge Vault 2.0: Connected Knowledge & Advanced WYSIWYG Editor
// Premium Three-Zone Architecture: Unified Navigation, Document Canvas, Contextual Inspector

let vaultPageRunId = 0;

async function renderVaultPage(container, params = {}) {
  const currentRunId = ++vaultPageRunId;
  const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';
  const initialNoteId = params.noteId || null;
  const currentProjectId = params.projectId || null;

  // Active state
  let allNotes = [];
  let folders = [];
  let tags = [];
  let activeNote = null;
  let currentFolderId = 'all';
  let activeTagFilter = '';
  let viewMode = 'edit'; // 'edit', 'split', 'preview'
  let editorInstance = null;
  let activeInspectorTab = 'outline'; // 'outline', 'connections', 'properties'
  let isNavCollapsed = false;
  let isInspectorCollapsed = false;

  container.innerHTML = `
    <div id="vault-workspace" class="vault-workspace">

      <!-- Subtle Drag-and-Drop Docking Overlay (Visible only when dragging panel) -->
      <div id="vault-dock-overlay" class="vault-dock-overlay" style="display: none;">
        <div class="vault-dock-indicator dock-zone-left" data-zone="left">
          <div class="dock-indicator-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
            <span>Dock Left</span>
          </div>
        </div>
        <div class="vault-dock-indicator dock-zone-right" data-zone="right">
          <div class="dock-indicator-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
            <span>Dock Right</span>
          </div>
        </div>
        <div class="vault-dock-indicator dock-zone-bottom" data-zone="bottom">
          <div class="dock-indicator-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
            <span>Dock Bottom</span>
          </div>
        </div>
      </div>
      
      <!-- ================================================================= -->
      <!-- ZONE 1: UNIFIED VAULT NAVIGATION PANE (LEFT SIDEBAR)             -->
      <!-- ================================================================= -->
      <aside id="vault-nav-pane" class="vault-nav-pane" aria-label="Vault Navigation">
        <!-- Header: Title, Create, Collapse -->
        <div class="vault-nav-header">
          <div class="vault-nav-actions">
            <div class="vault-nav-title">
              <span class="vault-brand-icon" style="display:inline-flex;color:var(--accent-deep, var(--accent-primary));">${getIcon('book-open')}</span>
              <span>Knowledge Vault</span>
            </div>
            <div style="display: flex; gap: 4px; align-items: center;">
              <button class="vault-btn-new-note" id="btn-vault-create-note" title="New Note" aria-label="New Note">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                <span>New Note</span>
              </button>
              <button class="btn btn--ghost btn--icon btn--sm" id="btn-vault-toggle-nav" title="Collapse Navigation Sidebar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>
              </button>
            </div>
          </div>

          <!-- Quick Search -->
          <div class="vault-nav-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="vault-search-input" placeholder="Search notes, tags, or content..." autocomplete="off" />
          </div>

          <!-- Folder Hierarchy Dropdown Filter -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
            <select id="vault-folder-select" class="input" style="height: 28px; font-size: 11px; padding: 0 6px; width: 100%;">
              <option value="all">All Folders</option>
              <option value="root">Uncategorized</option>
            </select>
            <button class="btn btn--ghost btn--icon btn--sm" id="btn-vault-add-folder" title="New Folder" style="height: 28px; width: 28px; flex-shrink: 0;">
              ${getIcon('plus')}
            </button>
          </div>
        </div>

        <!-- Hierarchy Tree (collapsible/expandable) -->
        <div id="vault-folder-tree" style="display: none; padding: 4px 8px; border-bottom: 1px solid var(--border-primary); max-height: 140px; overflow-y: auto;">
          <div class="nav-item nav-item--active" data-folder="all">
            <span class="nav-item-icon">${getIcon('book-open')}</span>
            <span class="nav-item-label">All Notes</span>
          </div>
        </div>

        <!-- Unified Notes List -->
        <div style="padding: 6px 12px 2px 12px; display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary);" id="vault-notes-count-label">Notes</span>
          <div style="display: flex; gap: 2px;">
            <button class="btn btn--ghost btn--icon btn--xs" id="btn-vault-import-md" title="Import Markdown (.md)">
              ${getIcon('file-search')}
            </button>
          </div>
        </div>

        <div id="vault-notes-list" class="vault-notes-list" style="flex: 1; overflow-y: auto; padding: 0 6px 12px 6px;">
          <div style="padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 12px;">Loading notes...</div>
        </div>

        <!-- Tags Cloud Footer -->
        <div style="border-top: 1px solid var(--border-primary); padding: 8px 12px; max-height: 120px; overflow-y: auto; background-color: var(--bg-secondary);">
          <span style="font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); display: block; margin-bottom: 4px;">Tags</span>
          <div id="vault-tags-cloud" style="display: flex; flex-wrap: wrap; gap: 4px;"></div>
        </div>
      </aside>

      <!-- Resizable Sliding Splitter between Nav and next panel -->
      <div id="vault-splitter-nav" class="vault-panel-splitter" title="Drag to resize navigation sidebar"></div>

      <!-- Dock Slot for Inspector when docked on Left side -->
      <div id="vault-dock-slot-left" style="display: contents;"></div>

      <!-- ================================================================= -->
      <!-- ZONE 2: CENTER WORKSPACE AREA (CANVAS & BOTTOM PANEL)             -->
      <!-- ================================================================= -->
      <div id="vault-center-area" class="vault-center-area">
        <main id="vault-main-canvas" class="vault-main-canvas" role="region" aria-label="Document Canvas">
          
          <!-- Polished Minimalist Empty State (When no note selected) -->
          <div id="vault-empty-state" class="vault-empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; padding: var(--space-8); overflow-y: auto;">
            <div class="vault-empty-state-card">
              <div style="width: 52px; height: 52px; border-radius: var(--radius-md); background: var(--accent-soft, rgba(120, 200, 178, 0.1)); border: 1px solid var(--accent-border, rgba(120, 200, 178, 0.25)); display: flex; align-items: center; justify-content: center; margin-bottom: var(--space-4); color: var(--accent-deep, var(--accent-primary));">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>
              </div>
              
              <h2 style="font-size: var(--text-xl); font-weight: 700; margin-bottom: var(--space-2); color: var(--text-primary); letter-spacing: -0.02em;">Knowledge Vault</h2>
              <p class="text-xs text-secondary" style="max-width: 440px; margin-bottom: var(--space-6); line-height: 1.6;">
                Create connected notes with bidirectional links, live task projections, and Markdown editing. Select an existing note from the sidebar or start fresh.
              </p>

              <button class="vault-btn-new-note" id="btn-vault-empty-create" style="height: 34px; padding: 0 16px; font-size: 12px; font-weight: 600;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                <span>Create New Note</span>
                <kbd style="margin-left: 6px; padding: 1px 5px; font-size: 10px; border-radius: 3px; background: rgba(0,0,0,0.2); color: #121517; font-family: var(--font-mono);">Alt+N</kbd>
              </button>

              <div class="vault-empty-features-grid">
                <div class="vault-empty-feature-item">
                  <div class="vault-empty-feature-title">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    <span>WikiLinks</span>
                  </div>
                  <div class="vault-empty-feature-desc">Reference other vault documents using [[Concept Name]] syntax.</div>
                </div>

                <div class="vault-empty-feature-item">
                  <div class="vault-empty-feature-title">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><polyline points="9 11 12 14 22 4"/></svg>
                    <span>Task Projections</span>
                  </div>
                  <div class="vault-empty-feature-desc">Link workflow deliverables and sync statuses in real time.</div>
                </div>

                <div class="vault-empty-feature-item">
                  <div class="vault-empty-feature-title">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span>Slash Commands</span>
                  </div>
                  <div class="vault-empty-feature-desc">Type / inside notes for callouts, tables, code blocks, and lists.</div>
                </div>
              </div>
            </div>
          </div>

        <!-- Active Note Container -->
        <div id="vault-editor-active" class="vault-editor-active" style="display: none; flex-direction: column; height: 100%; width: 100%; overflow: hidden;">
          
          <!-- Canvas Top Navigation Bar -->
          <div class="vault-canvas-topbar">
            <!-- Left controls: Restore Nav button + Breadcrumbs -->
            <div style="display: flex; align-items: center; gap: var(--space-2); min-width: 0;">
              <button class="btn btn--ghost btn--icon btn--sm" id="btn-vault-restore-nav" title="Expand Vault Navigation" style="display: none;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>
              </button>
              <div class="vault-breadcrumbs" style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-tertiary); min-width: 0; flex: 1; overflow: hidden;">
                <span id="canvas-folder-badge" class="text-truncate" style="font-weight: 500; color: var(--text-secondary); max-width: 140px; min-width: 0; flex-shrink: 0;">Knowledge Vault</span>
                <span class="vault-breadcrumb-sep" style="flex-shrink: 0; color: var(--text-tertiary); user-select: none;">/</span>
                <span id="canvas-note-badge" class="text-truncate" style="max-width: 220px; color: var(--text-primary); font-weight: 600; min-width: 0; flex: 1;">Untitled Note</span>
              </div>
            </div>

            <!-- Center controls: Save Status & Reading Metric -->
            <div style="display: flex; align-items: center; gap: var(--space-3);">
              <span id="vault-save-status" class="vault-save-indicator" style="font-size: 11px; color: var(--text-tertiary);">Saved</span>
              <span id="editor-word-count" style="font-size: 11px; color: var(--text-tertiary); display: none;">0 words</span>
            </div>

            <!-- Right controls: Mode Switcher, Actions, Inspector Toggle -->
            <div style="display: flex; align-items: center; gap: 4px;">
              <!-- Edit / Split / Read segmented toggle -->
              <div class="vault-mode-switch" style="display: inline-flex; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); padding: 2px; gap: 2px;">
                <button class="btn btn--xs btn--primary mode-btn vault-mode-btn" data-mode="edit" id="mode-btn-edit" title="WYSIWYG Edit Mode">Edit</button>
                <button class="btn btn--xs btn--ghost mode-btn vault-mode-btn" data-mode="split" id="mode-btn-split" title="Side-by-Side Split Mode">Split</button>
                <button class="btn btn--xs btn--ghost mode-btn vault-mode-btn" data-mode="preview" id="mode-btn-read" title="Clean Read Mode">Read</button>
              </div>

              <div style="width: 1px; height: 16px; background: var(--border-primary); margin: 0 4px;"></div>

              <!-- Connect Note Action Button -->
              <button class="btn btn--secondary btn--xs" id="btn-vault-connect-note" title="Connect Note: Establish semantic relationships with other notes" style="display: flex; align-items: center; gap: 4px; height: 26px; padding: 0 8px; font-size: 11px;">
                ${getIcon('share-2')}
                <span>Connect</span>
              </button>

              <!-- Unified Help Trigger Button -->
              <button class="btn btn--ghost btn--xs btn--icon" id="btn-vault-help" title="Knowledge Vault Guide: Interactive feature explainers and tour" style="height: 26px; width: 26px;">
                ${getIcon('help-circle')}
              </button>

              <!-- Knowledge Graph Navigation Button -->
              <button class="btn btn--ghost btn--xs btn--icon" id="btn-vault-graph" title="Knowledge Graph: Visualize note relationship wires" style="height: 26px; width: 26px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><line x1="8.59" y1="7.41" x2="15.42" y2="16.59"/><line x1="15.41" y1="7.41" x2="8.59" y2="16.59"/></svg>
              </button>

              <!-- Version History Button -->
              <button class="btn btn--ghost btn--xs btn--icon" id="btn-version-history" title="Version History: Inspect snapshots and restore changes" style="height: 26px; width: 26px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </button>

              <!-- Export Markdown Button -->
              <button class="btn btn--ghost btn--xs btn--icon" id="btn-export-note-md" title="Export Markdown: Download document as .md file" style="height: 26px; width: 26px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              </button>

              <!-- Delete Note Button -->
              <button class="btn btn--ghost btn--xs btn--icon" id="btn-delete-current-note" title="Delete Note: Permanently remove this document" style="height: 26px; width: 26px;">
                ${getIcon('trash-2')}
              </button>

              <div style="width: 1px; height: 16px; background: var(--border-primary); margin: 0 4px;"></div>

              <!-- Toggle Bottom References Panel Button -->
              <button class="btn btn--ghost btn--xs btn--icon" id="btn-vault-toggle-bottom" title="Toggle References & Activity Panel" style="height: 26px; width: 26px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 15h18"/></svg>
              </button>

              <!-- Contextual Inspector Toggle Button -->
              <button class="btn btn--ghost btn--xs btn--icon" id="btn-vault-toggle-inspector" title="Toggle Inspector Panel (Outline, Connections, Properties)" style="height: 26px; width: 26px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/></svg>
              </button>

              <!-- Reset Workspace Layout Button -->
              <button class="btn btn--ghost btn--xs btn--icon" id="btn-vault-reset-layout" title="Reset Workspace Layout to Default" style="height: 26px; width: 26px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              </button>
            </div>
          </div>

          <!-- Document Header: Title & Meta Column (Centered 840px) -->
          <div class="vault-document-header-area">
            <div class="vault-document-header-inner">
              <input type="text" id="note-title-input" class="vault-document-title" placeholder="Untitled Note" autocomplete="off" />
              <div class="vault-document-meta-chips" style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                <div id="note-tags-container" style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;"></div>
              </div>
            </div>
          </div>

          <!-- Compact Grouped Formatting Toolbar -->
          <div id="vault-formatting-bar" class="vault-formatting-bar">
            <div class="vault-formatting-bar-inner">
              <!-- History Group (Undo / Redo) -->
              <div class="vault-toolbar-group">
                <button class="vault-tool-btn fmt-btn" data-fmt="undo" data-cmd="undo" id="vault-undo-btn" title="Undo (Ctrl+Z)" disabled>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                </button>
                <button class="vault-tool-btn fmt-btn" data-fmt="redo" data-cmd="redo" id="vault-redo-btn" title="Redo (Ctrl+Y)" disabled>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>
                </button>
              </div>

              <!-- Headings Group -->
              <div class="vault-toolbar-group">
                <button class="vault-tool-btn fmt-btn" data-fmt="h1" data-cmd="h1" title="Heading 1 (/h1)">H1</button>
                <button class="vault-tool-btn fmt-btn" data-fmt="h2" data-cmd="h2" title="Heading 2 (/h2)">H2</button>
                <button class="vault-tool-btn fmt-btn" data-fmt="h3" data-cmd="h3" title="Heading 3 (/h3)">H3</button>
              </div>

              <!-- Inline Styles Group -->
              <div class="vault-toolbar-group">
                <button class="vault-tool-btn fmt-btn" data-fmt="bold" data-cmd="bold" title="Bold (Ctrl+B)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 12h9a4 4 0 0 1 0 8H6v-8zm0-8h7a4 4 0 0 1 0 8H6V4z"/></svg>
                </button>
                <button class="vault-tool-btn fmt-btn" data-fmt="italic" data-cmd="italic" title="Italic (Ctrl+I)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
                </button>
                <button class="vault-tool-btn fmt-btn" data-fmt="strike" data-cmd="strike" title="Strikethrough">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg>
                </button>
                <button class="vault-tool-btn fmt-btn" data-fmt="mark" data-cmd="mark" title="Highlight">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11-6 6v3h3l6-6"/><path d="m22 2-2.5 2.5a2.12 2.12 0 0 1-3 0l-.5-.5a2.12 2.12 0 0 1 0-3L18.5 0.5a2.12 2.12 0 0 1 3 0l.5.5a2.12 2.12 0 0 1 0 3z"/><path d="M14.5 5.5 18.5 9.5"/></svg>
                </button>
                <button class="vault-tool-btn fmt-btn" data-fmt="code" data-cmd="code" title="Inline Code">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                </button>
              </div>

              <!-- Blocks Group -->
              <div class="vault-toolbar-group">
                <button class="vault-tool-btn fmt-btn" data-fmt="check" data-cmd="todo" title="Checklist (- [ ])">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><polyline points="9 11 12 14 22 4"/></svg>
                </button>
                <button class="vault-tool-btn fmt-btn" data-fmt="list" data-cmd="bullet" title="Bullet List">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1.5" fill="currentColor"/><circle cx="3" cy="12" r="1.5" fill="currentColor"/><circle cx="3" cy="18" r="1.5" fill="currentColor"/></svg>
                </button>
                <button class="vault-tool-btn fmt-btn" data-fmt="number" data-cmd="number" title="Numbered List">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/></svg>
                </button>
                <button class="vault-tool-btn fmt-btn" data-fmt="quote" data-cmd="quote" title="Blockquote">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>
                </button>
                <button class="vault-tool-btn fmt-btn" data-fmt="callout" data-cmd="callout" title="Callout Card">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                </button>
                <button class="vault-tool-btn fmt-btn" data-fmt="table" data-cmd="table" title="Table">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>
                </button>
                <button class="vault-tool-btn fmt-btn" data-fmt="divider" data-cmd="divider" title="Divider">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/></svg>
                </button>
                <button class="vault-tool-btn fmt-btn" data-fmt="link" data-cmd="wikilink" title="WikiLink Concept Reference ([[...]])">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </button>
                <button class="vault-tool-btn fmt-btn" data-fmt="image" data-cmd="image" id="btn-toolbar-image" title="Insert Image (/image)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                </button>
                <button class="vault-tool-btn fmt-btn" data-fmt="file" data-cmd="file" id="btn-toolbar-file" title="Attach Document (/file)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                </button>
              </div>

              <!-- Slash Command Hint -->
              <div class="vault-slash-hint" style="margin-left: auto; font-size: 11px; color: var(--text-tertiary); display: flex; align-items: center; gap: 4px;">
                <kbd style="padding: 1px 4px; background: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: 3px; font-family: var(--font-mono); font-size: 10px;">/</kbd>
                <span>Commands</span>
              </div>
            </div>
          </div>

          <!-- Hidden inputs for Image, Video, Audio and File picker -->
          <input type="file" id="vault-hidden-image-input" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" style="display:none;" />
          <input type="file" id="vault-hidden-video-input" accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska" style="display:none;" />
          <input type="file" id="vault-hidden-audio-input" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/m4a,audio/flac,audio/aac" style="display:none;" />
          <input type="file" id="vault-hidden-file-input" style="display:none;" />

          <!-- Document Canvas Workspace Area -->
          <div id="vault-editor-col" class="vault-canvas-body" style="flex: 1; display: flex; overflow: hidden; position: relative;">
            
            <!-- WYSIWYG ContentEditable Canvas (Active in Edit mode) -->
            <div id="vault-wysiwyg-container" class="vault-wysiwyg-container" style="flex: 1; height: 100%; overflow-y: auto; padding: 0 var(--space-6) var(--space-8) var(--space-6);">
              <div id="vault-wysiwyg-canvas" class="vault-wysiwyg-canvas content-reading" contenteditable="true" spellcheck="false" role="textbox" aria-multiline="true"></div>
            </div>

            <!-- Raw Markdown Textarea (Active in Split mode or fallback synchronization) -->
            <div id="editor-textarea-pane" class="vault-textarea-pane" style="flex: 1; height: 100%; overflow-y: auto; padding: 0 var(--space-6) var(--space-8) var(--space-6); display: none;">
              <textarea id="note-content-input" class="vault-raw-textarea" placeholder="Write in Markdown... Use [[Concept]] to reference other notes."></textarea>
            </div>

            <!-- Live Rendered Preview Pane (Active in Split & Read modes) -->
            <div id="editor-preview-pane" class="vault-preview-pane content-reading" style="flex: 1; height: 100%; overflow-y: auto; padding: 0 var(--space-6) var(--space-8) var(--space-6); display: none;">
              <div id="editor-preview-inner" class="vault-preview-inner"></div>
            </div>
          </div>

          <!-- Hidden legacy tray container for tour target and backward compatibility -->
          <div id="vault-backlinks-tray" style="display: none;"></div>
        </div>
      </main>

      <!-- Horizontal Splitter between Document Canvas and Bottom Panel -->
      <div id="vault-splitter-bottom" class="vault-panel-splitter-horizontal" style="display: none;" title="Drag to resize bottom panel"></div>

      <!-- ================================================================= -->
      <!-- ZONE 4: COLLAPSIBLE BOTTOM WORKSPACE PANEL (REFERENCES & ACTIVITY) -->
      <!-- ================================================================= -->
      <section id="vault-bottom-panel" class="vault-bottom-panel is-collapsed" style="display: none;" aria-label="References and Activity">
        <div class="vault-bottom-header" id="vault-bottom-header">
          <div class="vault-bottom-tabs">
            <button class="vault-bottom-tab is-active" data-bottom-tab="backlinks">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <span>Backlinks</span>
              <span class="vault-tab-count" id="bottom-backlinks-count">0</span>
            </button>
            <button class="vault-bottom-tab" data-bottom-tab="mentions">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>
              <span>Unlinked Mentions</span>
              <span class="vault-tab-count" id="bottom-mentions-count">0</span>
            </button>
            <button class="vault-bottom-tab" data-bottom-tab="tasks">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><polyline points="9 11 12 14 22 4"/></svg>
              <span>Connected Tasks</span>
              <span class="vault-tab-count" id="bottom-tasks-count">0</span>
            </button>
            <button class="vault-bottom-tab" data-bottom-tab="history">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>History</span>
            </button>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <button class="btn btn--ghost btn--icon btn--xs" id="btn-bottom-close" title="Close Bottom Panel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
        <div class="vault-bottom-body" id="vault-bottom-body">
          <div id="bottom-pane-backlinks" class="bottom-tab-pane">
            <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 6px;">Incoming Backlinks</div>
            <div id="bottom-backlinks-list" style="display: flex; flex-wrap: wrap; gap: 6px;">
              <span class="text-xs text-tertiary">No incoming backlinks</span>
            </div>
          </div>
          <div id="bottom-pane-mentions" class="bottom-tab-pane" style="display: none;">
            <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 6px;">Unlinked Mentions</div>
            <div id="bottom-unlinked-list" style="display: flex; flex-direction: column; gap: 4px;">
              <span class="text-xs text-tertiary">No unlinked mentions found</span>
            </div>
          </div>
          <div id="bottom-pane-tasks" class="bottom-tab-pane" style="display: none;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary);">Connected Workflow Tasks</div>
              <button class="btn btn--ghost btn--xs" id="btn-bottom-add-task">+ Add Task</button>
            </div>
            <div id="bottom-tasks-list" style="display: flex; flex-direction: column; gap: 4px;">
              <span class="text-xs text-tertiary">No tasks connected</span>
            </div>
          </div>
          <div id="bottom-pane-history" class="bottom-tab-pane" style="display: none;">
            <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 6px;">Version History Snapshots</div>
            <div id="bottom-history-list" style="display: flex; flex-direction: column; gap: 4px;">
              <span class="text-xs text-tertiary">Select a note to inspect version history</span>
            </div>
          </div>
        </div>
      </section>
    </div> <!-- Close #vault-center-area -->

    <!-- Vertical Splitter between Canvas and Right Inspector -->
    <div id="vault-splitter-inspector" class="vault-panel-splitter" title="Drag to resize inspector"></div>

    <!-- Dock Slot for Inspector when docked on Right side (Default) -->
    <div id="vault-dock-slot-right" style="display: contents;">
      <!-- ================================================================= -->
      <!-- ZONE 3: DOCKABLE CONTEXTUAL INSPECTOR PANE                        -->
      <!-- ================================================================= -->
      <aside id="vault-inspector-pane" class="vault-inspector-pane docked-right" aria-label="Note Inspector">
        <!-- Inspector Dockable Header -->
        <div class="vault-inspector-header" id="vault-inspector-header">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="vault-panel-drag-handle" id="inspector-drag-handle" title="Drag to dock panel Left, Right, or Bottom" draggable="true">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
            </span>
            <span class="vault-inspector-title">Inspector</span>
          </div>

          <div style="display: flex; align-items: center; gap: 4px;">
            <!-- Dock Placement Menu Button -->
            <div style="position: relative;">
              <button class="btn btn--ghost btn--icon btn--xs" id="btn-inspector-placement" title="Dock Placement (Right, Left, Bottom)" style="height: 22px; width: 22px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/></svg>
              </button>
              <div class="vault-dock-menu" id="vault-dock-menu" style="display: none;">
                <button class="vault-dock-menu-item" data-dock="left">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                  <span>Dock to Left</span>
                </button>
                <button class="vault-dock-menu-item is-active" data-dock="right">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                  <span>Dock to Right</span>
                </button>
                <button class="vault-dock-menu-item" data-dock="bottom">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
                  <span>Dock to Bottom</span>
                </button>
              </div>
            </div>

            <button class="btn btn--ghost btn--icon btn--xs" id="btn-inspector-close" title="Collapse Inspector" style="height: 22px; width: 22px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>

        <!-- Inspector Tab Switcher -->
        <div class="vault-inspector-tabs">
          <button class="vault-tab-btn is-active" id="tab-btn-outline" data-tab="outline">Outline</button>
          <button class="vault-tab-btn" id="tab-btn-connections" data-tab="connections">Connections</button>
          <button class="vault-tab-btn" id="tab-btn-properties" data-tab="properties">Properties</button>
        </div>

        <!-- Inspector Content Body -->
        <div class="vault-inspector-body" style="flex: 1; overflow-y: auto; padding: var(--space-4);">
          
          <!-- TAB 1: OUTLINE -->
          <div id="inspector-pane-outline" class="inspector-tab-pane">
            <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: 8px;">Document Headings</div>
            <div id="vault-inspector-outline" class="vault-outline-tree">
              <span class="text-xs text-tertiary">No headings found in this document. Add # Heading 1 or ## Heading 2.</span>
            </div>
          </div>

          <!-- TAB 2: CONNECTIONS -->
          <div id="inspector-pane-connections" class="inspector-tab-pane" style="display: none; flex-direction: column; gap: var(--space-4);">
            
            <!-- Connected Notes -->
            <div class="inspector-conn-section">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary);">Connected Notes</span>
                <button class="btn btn--ghost btn--xs" id="btn-tray-connect-note" style="height: 20px; padding: 0 6px; font-size: 10px;">+ Connect</button>
              </div>
              <div id="vault-connected-notes-list" style="display: flex; flex-direction: column; gap: 4px;">
                <span class="text-xs text-tertiary">No notes connected</span>
              </div>
            </div>

            <!-- Bidirectional Backlinks -->
            <div class="inspector-conn-section" style="border-top: 1px solid var(--border-primary); padding-top: 12px;">
              <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); display: block; margin-bottom: 6px;">Referencing Backlinks</span>
              <div id="backlinks-list" style="display: flex; flex-direction: column; gap: 4px;">
                <span class="text-xs text-tertiary">No incoming backlinks</span>
              </div>
            </div>

            <!-- Unlinked Mentions -->
            <div class="inspector-conn-section" style="border-top: 1px solid var(--border-primary); padding-top: 12px;">
              <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); display: block; margin-bottom: 6px;">Unlinked Mentions</span>
              <div id="unlinked-list" style="display: flex; flex-direction: column; gap: 4px;">
                <span class="text-xs text-tertiary">No unlinked mentions found</span>
              </div>
            </div>

            <!-- Connected Workflow Tasks -->
            <div class="inspector-conn-section" style="border-top: 1px solid var(--border-primary); padding-top: 12px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary);">Connected Tasks</span>
                <button class="btn btn--ghost btn--xs" id="btn-vault-add-task" style="height: 20px; padding: 0 6px; font-size: 10px;">+ Add Task</button>
              </div>
              <div id="vault-connected-tasks-list" style="display: flex; flex-direction: column; gap: 4px;">
                <span class="text-xs text-tertiary">No tasks connected</span>
              </div>
            </div>
          </div>

          <!-- TAB 3: PROPERTIES -->
          <div id="inspector-pane-properties" class="inspector-tab-pane" style="display: none; flex-direction: column; gap: var(--space-4);">
            <div>
              <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); display: block; margin-bottom: 4px;">Folder</span>
              <select id="note-folder-select" class="input" style="height: 32px; font-size: 12px; width: 100%;">
                <option value="">(None - Uncategorized)</option>
              </select>
            </div>

            <div>
              <span style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); display: block; margin-bottom: 4px;">Tags</span>
              <input type="text" id="note-tags-input" class="input" placeholder="Add tag (press Enter)..." style="height: 30px; font-size: 12px; width: 100%; margin-bottom: 4px;" />
              <div id="note-inspector-tags" style="display: flex; flex-wrap: wrap; gap: 4px;"></div>
            </div>

            <div style="border-top: 1px solid var(--border-primary); padding-top: 12px; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 12px; color: var(--text-secondary);">Pinned Note</span>
                <input type="checkbox" id="note-pin-toggle" style="cursor: pointer;" />
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 12px; color: var(--text-secondary);">Word Count</span>
                <span id="prop-word-count" style="font-size: 12px; font-weight: 600; color: var(--text-primary);">0 words</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 12px; color: var(--text-secondary);">Reading Time</span>
                <span id="prop-reading-time" style="font-size: 12px; font-weight: 600; color: var(--text-primary);">&lt; 1 min</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 12px; color: var(--text-secondary);">Created</span>
                <span id="prop-created-at" style="font-size: 11px; color: var(--text-tertiary);">-</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 12px; color: var(--text-secondary);">Last Modified</span>
                <span id="prop-updated-at" style="font-size: 11px; color: var(--text-tertiary);">-</span>
              </div>
            </div>
          </div>

        </div>
      </aside>
    </div> <!-- Close #vault-dock-slot-right -->

    </div> <!-- Close #vault-workspace -->
  `;

  // --------------------------------------------------------------------------
  // DOM References
  // --------------------------------------------------------------------------
  const navPane = document.getElementById('vault-nav-pane');
  const mainCanvas = document.getElementById('vault-main-canvas');
  const inspectorPane = document.getElementById('vault-inspector-pane');
  const emptyState = document.getElementById('vault-empty-state');
  const editorActive = document.getElementById('vault-editor-active');
  const titleInput = document.getElementById('note-title-input');
  const wysiwygContainer = document.getElementById('vault-wysiwyg-container');
  const wysiwygCanvas = document.getElementById('vault-wysiwyg-canvas');
  const textareaPane = document.getElementById('editor-textarea-pane');
  const contentInput = document.getElementById('note-content-input');
  const previewPane = document.getElementById('editor-preview-pane');
  const previewInner = document.getElementById('editor-preview-inner');
  const notesListEl = document.getElementById('vault-notes-list');
  const searchInput = document.getElementById('vault-search-input');
  const folderSelect = document.getElementById('vault-folder-select');
  const folderTreeEl = document.getElementById('vault-folder-tree');
  const tagsCloudEl = document.getElementById('vault-tags-cloud');
  const saveIndicator = document.getElementById('vault-save-status');
  const wordCountEl = document.getElementById('editor-word-count');

  // --------------------------------------------------------------------------
  // Initialize WYSIWYG Editor Instance
  // --------------------------------------------------------------------------
  if (window.VaultEditor && wysiwygCanvas) {
    editorInstance = window.VaultEditor.setupEditor(wysiwygCanvas, {
      onChange: () => {
        const md = editorInstance.getContentMarkdown();
        contentInput.value = md;
        updateWordCountAndMetrics();
        updateOutline();
        updatePreview();
        triggerAutoSave();
      },
      onHistoryChange: (state) => {
        const undoBtn = document.getElementById('vault-undo-btn');
        const redoBtn = document.getElementById('vault-redo-btn');
        if (undoBtn) undoBtn.disabled = !state.canUndo;
        if (redoBtn) redoBtn.disabled = !state.canRedo;
      },
      onSlashCommand: (cmd) => {
        if (cmd === 'image') {
          const imgInp = document.getElementById('vault-hidden-image-input');
          if (imgInp) imgInp.click();
        } else if (cmd === 'video') {
          const vidInp = document.getElementById('vault-hidden-video-input');
          if (vidInp) vidInp.click();
        } else if (cmd === 'audio') {
          const audInp = document.getElementById('vault-hidden-audio-input');
          if (audInp) audInp.click();
        } else if (cmd === 'file') {
          const fileInp = document.getElementById('vault-hidden-file-input');
          if (fileInp) fileInp.click();
        } else if (cmd === 'connect-note') {
          openWikiLinkModal();
        }
      },
      onWikiLinkClick: (titleOrDurable) => {
        const raw = String(titleOrDurable || '').trim();
        const durableMatch = raw.match(/^note:(\d+)/i);
        if (durableMatch) {
          const noteId = parseInt(durableMatch[1], 10);
          const foundById = allNotes.find(n => Number(n.id) === Number(noteId));
          if (foundById) {
            openNote(foundById.id);
            return;
          }
        }
        const title = raw.includes('|') ? raw.split('|')[1].trim() : raw;
        const found = allNotes.find(n => n.title.toLowerCase() === title.toLowerCase());
        if (found) {
          openNote(found.id);
        } else {
          showToast(`WikiLink concept: "${title}" (not yet created as a separate note)`);
        }
      }
    });
    window.vaultEditorInstance = editorInstance;
  }

  // Hidden File Inputs Listeners for Uploading
  const hiddenImageInput = document.getElementById('vault-hidden-image-input');
  const hiddenVideoInput = document.getElementById('vault-hidden-video-input');
  const hiddenAudioInput = document.getElementById('vault-hidden-audio-input');
  const hiddenFileInput = document.getElementById('vault-hidden-file-input');

  if (hiddenImageInput) {
    hiddenImageInput.addEventListener('change', async (e) => {
      const file = e.target.files ? e.target.files[0] : null;
      if (file && editorInstance) {
        await editorInstance.uploadAndInsertImage(file);
        contentInput.value = editorInstance.getContentMarkdown();
        updateWordCountAndMetrics();
        updateOutline();
        updatePreview();
        triggerAutoSave();
      }
      hiddenImageInput.value = '';
    });
  }

  if (hiddenVideoInput) {
    hiddenVideoInput.addEventListener('change', async (e) => {
      const file = e.target.files ? e.target.files[0] : null;
      if (file && editorInstance) {
        await editorInstance.uploadAndInsertFile(file);
        contentInput.value = editorInstance.getContentMarkdown();
        updateWordCountAndMetrics();
        updateOutline();
        updatePreview();
        triggerAutoSave();
      }
      hiddenVideoInput.value = '';
    });
  }

  if (hiddenAudioInput) {
    hiddenAudioInput.addEventListener('change', async (e) => {
      const file = e.target.files ? e.target.files[0] : null;
      if (file && editorInstance) {
        await editorInstance.uploadAndInsertFile(file);
        contentInput.value = editorInstance.getContentMarkdown();
        updateWordCountAndMetrics();
        updateOutline();
        updatePreview();
        triggerAutoSave();
      }
      hiddenAudioInput.value = '';
    });
  }

  if (hiddenFileInput) {
    hiddenFileInput.addEventListener('change', async (e) => {
      const file = e.target.files ? e.target.files[0] : null;
      if (file && editorInstance) {
        await editorInstance.uploadAndInsertFile(file);
        contentInput.value = editorInstance.getContentMarkdown();
        updateWordCountAndMetrics();
        updateOutline();
        updatePreview();
        triggerAutoSave();
      }
      hiddenFileInput.value = '';
    });
  }

  // --------------------------------------------------------------------------
  // Workspace Dockable Panel Layout & Persistence (IDE Architecture)
  // --------------------------------------------------------------------------
  const DEFAULT_LAYOUT = {
    navWidth: 280,
    inspectorWidth: 320,
    bottomHeight: 220,
    navCollapsed: false,
    inspectorCollapsed: false,
    bottomCollapsed: true,
    inspectorPlacement: 'right', // 'right' or 'left'
    activeInspectorTab: 'outline',
    activeBottomTab: 'backlinks'
  };

  let layoutState = { ...DEFAULT_LAYOUT };
  try {
    const saved = localStorage.getItem('flowden_vault_layout');
    if (saved) {
      layoutState = { ...DEFAULT_LAYOUT, ...JSON.parse(saved) };
    } else {
      const oldNav = localStorage.getItem('flowden_vault_nav_width');
      if (oldNav) {
        const w = parseInt(oldNav, 10);
        if (w >= 180 && w <= 480) layoutState.navWidth = w;
      }
    }
  } catch (e) {
    layoutState = { ...DEFAULT_LAYOUT };
  }

  function saveLayoutState() {
    try {
      localStorage.setItem('flowden_vault_layout', JSON.stringify(layoutState));
    } catch (e) {}
  }

  const dockSlotLeft = document.getElementById('vault-dock-slot-left');
  const dockSlotRight = document.getElementById('vault-dock-slot-right');
  const inspectorSplitter = document.getElementById('vault-splitter-inspector');
  const bottomPanel = document.getElementById('vault-bottom-panel');
  const bottomSplitter = document.getElementById('vault-splitter-bottom');
  const dockOverlay = document.getElementById('vault-dock-overlay');

  function dockInspector(placement, shouldSave = true) {
    if (placement === 'bottom') {
      setBottomCollapsed(false);
      layoutState.inspectorPlacement = 'bottom';
      document.querySelectorAll('.vault-dock-menu-item').forEach(item => {
        item.classList.toggle('is-active', item.getAttribute('data-dock') === 'bottom');
      });
      if (shouldSave) saveLayoutState();
      window.showToast('Opened bottom references panel', 'info');
      return;
    }

    if (placement === 'left') {
      layoutState.inspectorPlacement = 'left';
      inspectorPane.classList.remove('docked-right');
      inspectorPane.classList.add('docked-left');

      if (dockSlotLeft && inspectorPane && inspectorSplitter) {
        dockSlotLeft.appendChild(inspectorPane);
        dockSlotLeft.appendChild(inspectorSplitter);
      }
    } else {
      layoutState.inspectorPlacement = 'right';
      inspectorPane.classList.remove('docked-left');
      inspectorPane.classList.add('docked-right');

      if (dockSlotRight && inspectorPane && inspectorSplitter) {
        dockSlotRight.appendChild(inspectorSplitter);
        dockSlotRight.appendChild(inspectorPane);
      }
    }

    document.querySelectorAll('.vault-dock-menu-item').forEach(item => {
      item.classList.toggle('is-active', item.getAttribute('data-dock') === layoutState.inspectorPlacement);
    });

    if (shouldSave) saveLayoutState();
  }

  function setNavCollapsed(collapsed, shouldSave = true) {
    layoutState.navCollapsed = !!collapsed;
    navPane.classList.toggle('is-collapsed', layoutState.navCollapsed);
    const restoreBtn = document.getElementById('btn-vault-restore-nav');
    if (restoreBtn) restoreBtn.style.display = layoutState.navCollapsed ? 'inline-flex' : 'none';
    const splitter = document.getElementById('vault-splitter-nav');
    if (splitter) splitter.style.display = layoutState.navCollapsed ? 'none' : 'block';
    if (shouldSave) saveLayoutState();
  }

  function setInspectorCollapsed(collapsed, shouldSave = true) {
    layoutState.inspectorCollapsed = !!collapsed;
    inspectorPane.classList.toggle('is-collapsed', layoutState.inspectorCollapsed);
    inspectorPane.style.display = layoutState.inspectorCollapsed ? 'none' : 'flex';
    if (inspectorSplitter) inspectorSplitter.style.display = layoutState.inspectorCollapsed ? 'none' : 'block';
    if (shouldSave) saveLayoutState();
  }

  function setBottomCollapsed(collapsed, shouldSave = true) {
    layoutState.bottomCollapsed = !!collapsed;
    if (bottomPanel) {
      bottomPanel.classList.toggle('is-collapsed', layoutState.bottomCollapsed);
      bottomPanel.style.display = layoutState.bottomCollapsed ? 'none' : 'flex';
    }
    if (bottomSplitter) {
      bottomSplitter.style.display = layoutState.bottomCollapsed ? 'none' : 'block';
    }
    if (!layoutState.bottomCollapsed) {
      bottomPanel.style.height = `${layoutState.bottomHeight}px`;
      if (layoutState.activeBottomTab === 'history') {
        loadBottomHistory();
      }
    }
    if (shouldSave) saveLayoutState();
  }

  function switchInspectorTab(tabName, shouldSave = true) {
    layoutState.activeInspectorTab = tabName;
    document.querySelectorAll('.vault-tab-btn').forEach(b => {
      const isTarget = b.getAttribute('data-tab') === tabName;
      b.classList.toggle('is-active', isTarget);
      b.style.color = '';
      b.style.borderBottomColor = '';
      b.style.backgroundColor = '';
    });

    const paneOutline = document.getElementById('inspector-pane-outline');
    const paneConns = document.getElementById('inspector-pane-connections');
    const paneProps = document.getElementById('inspector-pane-properties');
    if (paneOutline) paneOutline.style.display = tabName === 'outline' ? 'block' : 'none';
    if (paneConns) paneConns.style.display = tabName === 'connections' ? 'flex' : 'none';
    if (paneProps) paneProps.style.display = tabName === 'properties' ? 'flex' : 'none';

    if (shouldSave) saveLayoutState();
  }

  function switchBottomTab(tabName, shouldSave = true) {
    layoutState.activeBottomTab = tabName;
    document.querySelectorAll('.vault-bottom-tab').forEach(b => {
      const isTarget = b.getAttribute('data-bottom-tab') === tabName;
      b.classList.toggle('is-active', isTarget);
    });

    const paneB = document.getElementById('bottom-pane-backlinks');
    const paneM = document.getElementById('bottom-pane-mentions');
    const paneT = document.getElementById('bottom-pane-tasks');
    const paneH = document.getElementById('bottom-pane-history');
    if (paneB) paneB.style.display = tabName === 'backlinks' ? 'block' : 'none';
    if (paneM) paneM.style.display = tabName === 'mentions' ? 'block' : 'none';
    if (paneT) paneT.style.display = tabName === 'tasks' ? 'block' : 'none';
    if (paneH) paneH.style.display = tabName === 'history' ? 'block' : 'none';

    if (tabName === 'history') {
      loadBottomHistory();
    }

    if (shouldSave) saveLayoutState();
  }

  function applyAllLayoutStates() {
    // 1. Navigation Pane
    navPane.style.width = `${layoutState.navWidth}px`;
    navPane.classList.toggle('is-compact', layoutState.navWidth < 220);
    setNavCollapsed(layoutState.navCollapsed, false);

    // 2. Inspector Dock Position & Sizing
    dockInspector(layoutState.inspectorPlacement, false);
    inspectorPane.style.width = `${layoutState.inspectorWidth}px`;
    setInspectorCollapsed(layoutState.inspectorCollapsed, false);
    switchInspectorTab(layoutState.activeInspectorTab, false);

    // 3. Bottom Panel
    if (bottomPanel) bottomPanel.style.height = `${layoutState.bottomHeight}px`;
    setBottomCollapsed(layoutState.bottomCollapsed, false);
    switchBottomTab(layoutState.activeBottomTab, false);
  }

  // Initial Data Fetch
  await loadFoldersAndTags();
  if (currentRunId !== vaultPageRunId) return;
  await loadNotes();
  if (currentRunId !== vaultPageRunId) return;

  // Apply restored or default layout state
  applyAllLayoutStates();

  if (initialNoteId) {
    await openNote(initialNoteId);
    if (currentRunId !== vaultPageRunId) return;
  }

  // --------------------------------------------------------------------------
  // Splitter Resizing: Navigation Sidebar (180px - 480px)
  // --------------------------------------------------------------------------
  const navSplitter = document.getElementById('vault-splitter-nav');
  if (navSplitter && navPane) {
    let isResizingNav = false;
    let startNavX = 0;
    let startNavWidth = 0;
    let currentNavWidth = 0;

    navSplitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizingNav = true;
      startNavX = e.clientX;
      startNavWidth = navPane.offsetWidth;
      currentNavWidth = startNavWidth;
      navSplitter.classList.add('is-dragging');
      navPane.classList.add('is-resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent) => {
        if (!isResizingNav) return;
        const dx = moveEvent.clientX - startNavX;
        const workspaceEl = document.getElementById('vault-workspace') || navPane.parentElement;
        const workspaceW = workspaceEl ? workspaceEl.offsetWidth : window.innerWidth;
        const inspW = inspectorPane && !layoutState.inspectorCollapsed && inspectorPane.style.display !== 'none' ? inspectorPane.offsetWidth : 0;
        // Ensure middle/nav panel cannot crush the editor below its 380px usable minimum width
        const maxNavW = Math.max(180, Math.min(480, workspaceW - inspW - 380));
        currentNavWidth = Math.min(Math.max(180, startNavWidth + dx), maxNavW);
        navPane.style.width = `${currentNavWidth}px`;
        navPane.classList.toggle('is-compact', currentNavWidth < 220);
      };

      const onMouseUp = () => {
        if (!isResizingNav) return;
        isResizingNav = false;
        navSplitter.classList.remove('is-dragging');
        navPane.classList.remove('is-resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        layoutState.navWidth = currentNavWidth || parseInt(navPane.style.width, 10) || navPane.offsetWidth;
        saveLayoutState();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // --------------------------------------------------------------------------
  // Splitter Resizing: Inspector Pane (220px - 520px)
  // --------------------------------------------------------------------------
  if (inspectorSplitter && inspectorPane) {
    let isResizingInspector = false;
    let startInspX = 0;
    let startInspWidth = 0;
    let currentInspWidth = 0;

    inspectorSplitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizingInspector = true;
      startInspX = e.clientX;
      startInspWidth = inspectorPane.offsetWidth;
      currentInspWidth = startInspWidth;
      inspectorSplitter.classList.add('is-dragging');
      inspectorPane.classList.add('is-resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent) => {
        if (!isResizingInspector) return;
        let dx;
        if (layoutState.inspectorPlacement === 'left') {
          dx = moveEvent.clientX - startInspX;
        } else {
          dx = startInspX - moveEvent.clientX;
        }
        const workspaceEl = document.getElementById('vault-workspace') || inspectorPane.parentElement;
        const workspaceW = workspaceEl ? workspaceEl.offsetWidth : window.innerWidth;
        const navW = navPane && !layoutState.navCollapsed && navPane.style.display !== 'none' ? navPane.offsetWidth : 0;
        // Ensure the inspector panel cannot crush the editor below its 380px usable minimum width
        const maxInspW = Math.max(220, Math.min(520, workspaceW - navW - 380));
        currentInspWidth = Math.min(Math.max(220, startInspWidth + dx), maxInspW);
        inspectorPane.style.width = `${currentInspWidth}px`;
      };

      const onMouseUp = () => {
        if (!isResizingInspector) return;
        isResizingInspector = false;
        inspectorSplitter.classList.remove('is-dragging');
        inspectorPane.classList.remove('is-resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        layoutState.inspectorWidth = currentInspWidth || parseInt(inspectorPane.style.width, 10) || inspectorPane.offsetWidth;
        saveLayoutState();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // --------------------------------------------------------------------------
  // Splitter Resizing: Bottom References Panel (120px - 480px)
  // --------------------------------------------------------------------------
  if (bottomSplitter && bottomPanel) {
    let isResizingBottom = false;
    let startBottomY = 0;
    let startBottomHeight = 0;
    let currentBottomHeight = 0;

    bottomSplitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizingBottom = true;
      startBottomY = e.clientY;
      startBottomHeight = bottomPanel.offsetHeight;
      currentBottomHeight = startBottomHeight;
      bottomSplitter.classList.add('is-dragging');
      bottomPanel.classList.add('is-resizing');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent) => {
        if (!isResizingBottom) return;
        const dy = startBottomY - moveEvent.clientY;
        currentBottomHeight = Math.min(Math.max(120, startBottomHeight + dy), 480);
        bottomPanel.style.height = `${currentBottomHeight}px`;
      };

      const onMouseUp = () => {
        if (!isResizingBottom) return;
        isResizingBottom = false;
        bottomSplitter.classList.remove('is-dragging');
        bottomPanel.classList.remove('is-resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        layoutState.bottomHeight = currentBottomHeight || parseInt(bottomPanel.style.height, 10) || bottomPanel.offsetHeight;
        saveLayoutState();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // --------------------------------------------------------------------------
  // Dock Placement Menu & Drag-and-Drop Docking
  // --------------------------------------------------------------------------
  const placementBtn = document.getElementById('btn-inspector-placement');
  const dockMenu = document.getElementById('vault-dock-menu');
  if (placementBtn && dockMenu) {
    placementBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dockMenu.style.display = dockMenu.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#vault-dock-menu') && !e.target.closest('#btn-inspector-placement')) {
        dockMenu.style.display = 'none';
      }
    });

    dockMenu.querySelectorAll('.vault-dock-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetDock = item.getAttribute('data-dock');
        dockInspector(targetDock, true);
        dockMenu.style.display = 'none';
      });
    });
  }

  const dragHandle = document.getElementById('inspector-drag-handle');
  if (dragHandle && dockOverlay) {
    dragHandle.addEventListener('dragstart', (e) => {
      dockOverlay.style.display = 'block';
      inspectorPane.classList.add('is-dragging');
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', 'inspector-dock');
        e.dataTransfer.effectAllowed = 'move';
      }
    });

    dragHandle.addEventListener('dragend', () => {
      dockOverlay.style.display = 'none';
      inspectorPane.classList.remove('is-dragging');
      document.querySelectorAll('.vault-dock-indicator').forEach(z => z.classList.remove('dock-zone-hover'));
    });
  }

  document.querySelectorAll('.vault-dock-indicator').forEach(zoneEl => {
    zoneEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      zoneEl.classList.add('dock-zone-hover');
    });

    zoneEl.addEventListener('dragleave', () => {
      zoneEl.classList.remove('dock-zone-hover');
    });

    zoneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      zoneEl.classList.remove('dock-zone-hover');
      if (dockOverlay) dockOverlay.style.display = 'none';
      const targetZone = zoneEl.getAttribute('data-zone');
      if (targetZone) {
        dockInspector(targetZone, true);
      }
    });

    zoneEl.addEventListener('click', () => {
      if (dockOverlay) dockOverlay.style.display = 'none';
      const targetZone = zoneEl.getAttribute('data-zone');
      if (targetZone) {
        dockInspector(targetZone, true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Panel Toggles & Tab Switchers
  // --------------------------------------------------------------------------
  document.getElementById('btn-vault-toggle-nav')?.addEventListener('click', () => setNavCollapsed(true));
  document.getElementById('btn-vault-restore-nav')?.addEventListener('click', () => setNavCollapsed(false));

  document.getElementById('btn-vault-toggle-inspector')?.addEventListener('click', () => {
    setInspectorCollapsed(!layoutState.inspectorCollapsed);
  });
  document.getElementById('btn-inspector-close')?.addEventListener('click', () => {
    setInspectorCollapsed(true);
  });

  document.getElementById('btn-vault-toggle-bottom')?.addEventListener('click', () => {
    setBottomCollapsed(!layoutState.bottomCollapsed);
  });
  document.getElementById('btn-bottom-close')?.addEventListener('click', () => {
    setBottomCollapsed(true);
  });

  document.querySelectorAll('.vault-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      switchInspectorTab(tabName, true);
    });
  });

  document.querySelectorAll('.vault-bottom-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-bottom-tab');
      switchBottomTab(tabName, true);
    });
  });

  document.getElementById('btn-vault-reset-layout')?.addEventListener('click', () => {
    layoutState = { ...DEFAULT_LAYOUT };
    try {
      localStorage.removeItem('flowden_vault_layout');
      localStorage.removeItem('flowden_vault_nav_width');
      localStorage.removeItem('flowden_vault_inspector_pos');
    } catch (e) {}
    applyAllLayoutStates();
    saveLayoutState();
    window.showToast('Workspace layout reset to default', 'info');
  });

  // --------------------------------------------------------------------------
  // Bottom Panel Version History Loader
  // --------------------------------------------------------------------------
  async function loadBottomHistory() {
    const listEl = document.getElementById('bottom-history-list');
    if (!listEl) return;
    if (!activeNote) {
      listEl.innerHTML = '<span class="text-xs text-tertiary">Select a note to inspect version history</span>';
      return;
    }
    try {
      const res = await window.API.get(`/notes/${activeNote.id}/versions`);
      const versions = res.versions || [];
      if (versions.length === 0) {
        listEl.innerHTML = '<span class="text-xs text-tertiary">No previous version snapshots for this note</span>';
        return;
      }
      listEl.innerHTML = versions.map(v => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
          <div>
            <strong style="font-size: 11px; color: var(--text-primary);">v${v.version_number}: ${escapeHtml(v.title || activeNote.title)}</strong>
            <span class="text-xs text-tertiary" style="margin-left: 8px;">${new Date(v.created_at).toLocaleString()}</span>
          </div>
          <button class="btn btn--xs btn--primary btn-restore-bottom-ver" data-ver-id="${v.id}" data-ver-num="${v.version_number}" style="height: 20px; font-size: 10px; padding: 0 6px;">Restore</button>
        </div>
      `).join('');

      listEl.querySelectorAll('.btn-restore-bottom-ver').forEach(btn => {
        btn.addEventListener('click', async () => {
          const vId = btn.getAttribute('data-ver-id');
          const vNum = btn.getAttribute('data-ver-num');
          try {
            await window.API.post(`/notes/${activeNote.id}/versions/${vId}/restore`, {});
            window.showToast(`Restored version v${vNum}`, 'success');
            openNote(activeNote.id);
          } catch (err) {
            window.showToast('Failed to restore version: ' + err.message, 'error');
          }
        });
      });
    } catch (e) {
      listEl.innerHTML = '<span class="text-xs text-tertiary">Failed to load versions</span>';
    }
  }

  // --------------------------------------------------------------------------
  // Load Folders & Tags
  // --------------------------------------------------------------------------
  async function loadFoldersAndTags() {
    try {
      const fUrl = currentProjectId ? `/notes/folders?project_id=${currentProjectId}` : '/notes/folders';
      const fRes = await window.API.get(fUrl);
      folders = fRes.folders || [];

      // Populate folder filter dropdown
      let fSelectHtml = `
        <option value="all">All Folders (${allNotes.length || 0})</option>
        <option value="root">Uncategorized</option>
      `;
      folders.forEach(f => {
        fSelectHtml += `<option value="${f.id}" ${currentFolderId == f.id ? 'selected' : ''}>${escapeHtml(f.name)}</option>`;
      });
      folderSelect.innerHTML = fSelectHtml;

      // Also populate properties folder dropdown
      const noteFolderSelect = document.getElementById('note-folder-select');
      if (noteFolderSelect) {
        let pSelectHtml = `<option value="">(None - Uncategorized)</option>`;
        folders.forEach(f => {
          pSelectHtml += `<option value="${f.id}">${escapeHtml(f.name)}</option>`;
        });
        noteFolderSelect.innerHTML = pSelectHtml;
      }

      // Populate tags cloud
      const tRes = await window.API.get('/notes/tags');
      tags = tRes.tags || [];
      tagsCloudEl.innerHTML = tags.map(t => `
        <span class="tag ${activeTagFilter === t.name ? 'tag--primary' : 'tag--violet'} tag-filter-btn" data-name="${t.name}" style="cursor: pointer; font-size: 10px; padding: 1px 6px;">#${escapeHtml(t.name)}</span>
      `).join('') || '<span class="text-xs text-tertiary">No tags</span>';

      tagsCloudEl.querySelectorAll('.tag-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const tName = btn.getAttribute('data-name');
          activeTagFilter = activeTagFilter === tName ? '' : tName;
          loadNotes();
        });
      });
    } catch (e) {
      console.warn('Error loading folders/tags:', e);
    }
  }

  folderSelect.addEventListener('change', () => {
    currentFolderId = folderSelect.value;
    loadNotes();
  });

  function cleanMarkdownPreview(md, maxLen = 70) {
    if (!md || typeof md !== 'string') return 'Empty note';
    let text = md
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[.*?\]\(.*?\)/g, ' ')
      .replace(/\[(?:attachment:\s*)?(.*?)(?:\s*\(.*?\))?\]\(.*?\)/g, '$1')
      .replace(/\[\[(.*?)\]\]/g, '$1')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/^>+\s*\[!.*?\]/gm, '')
      .replace(/^>+\s*/gm, '')
      .replace(/\|.*?\|/g, ' ')
      .replace(/^[-*]\s*\[[ xX]\]\s*/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/#{1,6}\s+/g, '')
      .replace(/[*_~=`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return 'Empty note';
    if (text.length > maxLen) {
      return text.substring(0, maxLen).trim() + '...';
    }
    return text;
  }

  // --------------------------------------------------------------------------
  // Load Notes List
  // --------------------------------------------------------------------------
  async function loadNotes() {
    try {
      let url = '/notes?';
      if (currentFolderId && currentFolderId !== 'all') {
        url += `folderId=${currentFolderId}&`;
      }
      if (activeTagFilter) {
        url += `tag=${encodeURIComponent(activeTagFilter)}&`;
      }
      const q = searchInput.value.trim();
      if (q) {
        url += `search=${encodeURIComponent(q)}&`;
      }

      const res = await window.API.get(url);
      allNotes = res.notes || [];

      document.getElementById('vault-notes-count-label').textContent = `Notes (${allNotes.length})`;

      if (allNotes.length === 0) {
        notesListEl.innerHTML = `
          <div style="padding: 24px 12px; text-align: center; color: var(--text-tertiary); font-size: 11px;">
            No notes match your filter.
          </div>
        `;
        return;
      }

      notesListEl.innerHTML = allNotes.map(n => {
        const isSelected = activeNote && activeNote.id === n.id;
        const snippet = cleanMarkdownPreview(n.content, 65);
        const folderMatch = (folders || []).find(f => f.id === n.folder_id);
        const folderName = folderMatch ? folderMatch.name : 'Uncategorized';
        return `
          <div class="vault-note-item ${isSelected ? 'vault-note-item--active' : ''}" data-id="${n.id}"
               style="padding: 8px 10px; border-radius: var(--radius-sm); margin-bottom: 2px; cursor: pointer; background-color: ${isSelected ? 'var(--bg-active)' : 'transparent'}; transition: background 140ms ease;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; margin-bottom: 2px;">
              <span style="font-size: 12px; font-weight: 600; color: var(--text-primary); min-width: 0; flex: 1;" class="text-truncate">${escapeHtml(n.title)}</span>
              ${n.is_pinned ? `<span style="color: var(--project-amber); flex-shrink: 0;" title="Pinned">${getIcon('pin')}</span>` : ''}
            </div>
            <div class="text-xs text-secondary text-truncate" style="font-size: 11px; margin-bottom: 4px; line-height: 1.3; min-width: 0;">
              ${escapeHtml(snippet)}
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; font-size: 10px; color: var(--text-tertiary); min-width: 0;">
              <span class="vault-note-folder-chip text-truncate" style="max-width: 100px; background: var(--bg-tertiary); padding: 1px 5px; border-radius: 3px; border: 1px solid var(--border-primary); color: var(--text-secondary);">${escapeHtml(folderName)}</span>
              <span style="flex-shrink: 0;">${new Date(n.updated_at || n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            </div>
          </div>
        `;
      }).join('');

      notesListEl.querySelectorAll('.vault-note-item').forEach(item => {
        item.addEventListener('click', () => {
          openNote(item.getAttribute('data-id'));
        });
      });
    } catch (e) {
      console.error('Failed to load notes:', e);
      notesListEl.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-tertiary);">Failed to load notes</div>`;
    }
  }

  let searchDebounce = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(loadNotes, 250);
  });

  // --------------------------------------------------------------------------
  // Open & Render Note
  // --------------------------------------------------------------------------
  async function openNote(id) {
    try {
      const res = await window.API.get(`/notes/${id}`);
      activeNote = res.note;

      emptyState.style.display = 'none';
      editorActive.style.display = 'flex';

      titleInput.value = activeNote.title || 'Untitled Note';
      document.getElementById('canvas-note-badge').textContent = activeNote.title || 'Untitled Note';
      const folderMatch = folders.find(f => f.id === activeNote.folder_id);
      document.getElementById('canvas-folder-badge').textContent = folderMatch ? folderMatch.name : 'Uncategorized';

      const markdownContent = activeNote.content || '';
      contentInput.value = markdownContent;

      if (editorInstance) {
        editorInstance.setContentMarkdown(markdownContent);
      } else {
        wysiwygCanvas.innerHTML = window.VaultEditor ? window.VaultEditor.markdownToHtml(markdownContent) : markdownContent;
      }

      updateWordCountAndMetrics();
      updateOutline();
      updatePreview();
      renderProperties();
      renderBacklinksAndMentions();
      loadConnectedNotes();
      loadConnectedTasks();

      // Highlight in sidebar
      notesListEl.querySelectorAll('.vault-note-item').forEach(el => {
        const isCurrent = el.getAttribute('data-id') == id;
        el.style.backgroundColor = isCurrent ? 'var(--bg-active)' : 'transparent';
        el.classList.toggle('vault-note-item--active', isCurrent);
      });
    } catch (err) {
      console.error('Failed to open note:', err);
      window.showToast('Failed to open note: ' + err.message, 'error');
    }
  }

  // --------------------------------------------------------------------------
  // Word Count, Metrics, Outline
  // --------------------------------------------------------------------------
  function updateWordCountAndMetrics() {
    const text = (contentInput.value || '').trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const readingMinutes = Math.max(1, Math.ceil(words / 200));

    wordCountEl.textContent = `${words} word${words === 1 ? '' : 's'}`;
    const propWords = document.getElementById('prop-word-count');
    if (propWords) propWords.textContent = `${words} word${words === 1 ? '' : 's'}`;
    const propTime = document.getElementById('prop-reading-time');
    if (propTime) propTime.textContent = words < 50 ? '< 1 min' : `~${readingMinutes} min read`;
  }

  function updateOutline() {
    const outlineEl = document.getElementById('vault-inspector-outline');
    if (!outlineEl) return;

    let headings = [];
    if (editorInstance && editorInstance.extractHeadings) {
      headings = editorInstance.extractHeadings();
    } else if (window.VaultEditor) {
      headings = window.VaultEditor.extractHeadings(wysiwygCanvas);
    }

    if (headings.length === 0) {
      outlineEl.innerHTML = `<span class="text-xs text-tertiary" style="font-size: 11px;">No headings found in this document. Add # Heading 1 or ## Heading 2.</span>`;
      return;
    }

    outlineEl.innerHTML = headings.map((h, i) => {
      const indent = (h.level - 1) * 12;
      return `
        <div class="outline-item" data-index="${i}" style="padding: 4px 6px 4px ${indent + 6}px; border-radius: var(--radius-sm); cursor: pointer; font-size: 12px; color: var(--text-primary); transition: background 140ms ease;">
          <span style="opacity: 0.6; font-size: 10px; font-weight: 700; margin-right: 4px;">H${h.level}</span>
          <span>${escapeHtml(h.text)}</span>
        </div>
      `;
    }).join('');

    outlineEl.querySelectorAll('.outline-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.getAttribute('data-index'), 10);
        const targetHeading = headings[idx];
        if (targetHeading && targetHeading.element) {
          targetHeading.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetHeading.element.style.transition = 'background-color 400ms ease';
          const originalBg = targetHeading.element.style.backgroundColor;
          targetHeading.element.style.backgroundColor = 'var(--accent-muted)';
          setTimeout(() => {
            targetHeading.element.style.backgroundColor = originalBg;
          }, 1000);
        }
      });
    });
  }

  function updatePreview() {
    const raw = contentInput.value || '';
    let rendered = renderMarkdown(raw);

    // Replace [[Note Title]] or [[note:123|Label]] with clickable links
    rendered = rendered.replace(/\[\[(.*?)\]\]/g, (_, raw) => {
      const trimmed = (raw || '').trim();
      const durable = trimmed.match(/^note:(\d+)(?:\|(.*))?$/i);
      if (durable) {
        const noteId = durable[1];
        const displayLabel = durable[2] ? durable[2].trim() : `Note #${noteId}`;
        return `<a href="javascript:void(0)" class="wiki-link" data-title="${encodeURIComponent(trimmed)}" data-note-id="${noteId}" style="color: var(--accent-primary); font-weight: 500; text-decoration: underline;">[[${escapeHtml(displayLabel)}]]</a>`;
      }
      const pipeMatch = trimmed.match(/^([^|]+)\|(.*)$/);
      if (pipeMatch) {
        return `<a href="javascript:void(0)" class="wiki-link" data-title="${encodeURIComponent(trimmed)}" style="color: var(--accent-primary); font-weight: 500; text-decoration: underline;">[[${escapeHtml(pipeMatch[2].trim())}]]</a>`;
      }
      return `<a href="javascript:void(0)" class="wiki-link" data-title="${encodeURIComponent(trimmed)}" style="color: var(--accent-primary); font-weight: 500; text-decoration: underline;">[[${escapeHtml(trimmed)}]]</a>`;
    });

    previewInner.innerHTML = rendered;

    previewInner.querySelectorAll('.wiki-link').forEach(linkEl => {
      linkEl.addEventListener('click', async (e) => {
        e.preventDefault();
        const noteIdAttr = linkEl.getAttribute('data-note-id');
        if (noteIdAttr) {
          const matchedById = allNotes.find(n => Number(n.id) === Number(noteIdAttr));
          if (matchedById) {
            openNote(matchedById.id);
            return;
          }
        }
        const targetTitle = decodeURIComponent(linkEl.getAttribute('data-title'));
        const durableMatch = targetTitle.match(/^note:(\d+)/i);
        if (durableMatch) {
          const matchedById = allNotes.find(n => Number(n.id) === Number(durableMatch[1]));
          if (matchedById) {
            openNote(matchedById.id);
            return;
          }
        }
        const titleOnly = targetTitle.includes('|') ? targetTitle.split('|')[1].trim() : targetTitle;
        const matched = allNotes.find(n => n.title.toLowerCase() === titleOnly.toLowerCase());
        if (matched) {
          openNote(matched.id);
        } else {
          window.Modal.confirm({
            title: 'Note Does Not Exist',
            message: `"${titleOnly}" does not exist yet. Would you like to create it?`,
            confirmText: 'Create Note',
            onConfirm: async () => {
              const created = await window.API.post('/notes', { title: titleOnly, content: `# ${titleOnly}\n\nLinked from [[${activeNote.title}]]` });
              await loadNotes();
              openNote(created.note.id);
            }
          });
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // Auto-Save Pipeline
  // --------------------------------------------------------------------------
  let autoSaveTimer = null;
  function triggerAutoSave() {
    saveIndicator.textContent = 'Saving...';
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      if (!activeNote) return;
      try {
        const title = titleInput.value.trim() || 'Untitled Note';
        const content = contentInput.value;
        const res = await window.API.put(`/notes/${activeNote.id}`, { title, content });
        activeNote = res.note;
        saveIndicator.textContent = 'Saved';
        document.getElementById('canvas-note-badge').textContent = title;
        loadNotes();
        renderBacklinksAndMentions();
      } catch (e) {
        saveIndicator.textContent = 'Error saving';
      }
    }, 800);
  }

  titleInput.addEventListener('input', () => {
    document.getElementById('canvas-note-badge').textContent = titleInput.value || 'Untitled Note';
    triggerAutoSave();
  });

  contentInput.addEventListener('input', () => {
    if (editorInstance) {
      editorInstance.setContentMarkdown(contentInput.value);
    }
    updateWordCountAndMetrics();
    updateOutline();
    updatePreview();
    triggerAutoSave();
  });

  // --------------------------------------------------------------------------
  // Formatting Bar & Commands
  // --------------------------------------------------------------------------
  document.querySelectorAll('.fmt-btn').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent button click from stealing editor focus/selection
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const cmd = btn.getAttribute('data-cmd') || btn.getAttribute('data-fmt');
      applyFormattingCommand(cmd);
    });
  });

  // --------------------------------------------------------------------------
  // WikiLink Note Selection Modal
  // --------------------------------------------------------------------------
  function openWikiLinkModal(initialQuery = '') {
    const sel = window.getSelection();
    let query = initialQuery;
    if (!query && sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      query = sel.toString().trim();
    }

    const existing = document.getElementById('vault-wikilink-modal-backdrop');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'vault-wikilink-modal-backdrop';
    backdrop.className = 'vault-wikilink-modal-backdrop';

    backdrop.innerHTML = `
      <div class="vault-wikilink-modal" role="dialog" aria-modal="true" aria-label="Connect Note via WikiLink">
        <div class="vault-wikilink-search-bar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" class="vault-wikilink-input" id="vault-wikilink-search-input" placeholder="Search note to link or type concept name..." value="${escapeHtml(query)}" autocomplete="off" />
          <kbd style="font-size: 10px; padding: 2px 5px; border-radius: 3px; background: var(--bg-tertiary); color: var(--text-tertiary); font-family: var(--font-mono);">ESC</kbd>
        </div>
        <div class="vault-wikilink-list" id="vault-wikilink-list"></div>
        <div class="vault-wikilink-footer">
          <span>Use &uarr;&darr; to navigate, Enter to insert link</span>
          <span>Esc to cancel</span>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const input = document.getElementById('vault-wikilink-search-input');
    const listEl = document.getElementById('vault-wikilink-list');

    function renderItems(filterText = '') {
      const q = filterText.toLowerCase().trim();
      const filtered = allNotes.filter(n => !q || n.title.toLowerCase().includes(q));

      let itemsHtml = '';
      if (q) {
        itemsHtml += `
          <div class="vault-wikilink-item is-selected" data-title="${escapeHtml(filterText.trim())}">
            <div style="display: flex; align-items: center; gap: 8px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Link to concept: <strong>[[${escapeHtml(filterText.trim())}]]</strong></span>
            </div>
            <span style="font-size: 10px; color: var(--text-tertiary);">New Concept</span>
          </div>
        `;
      }

      filtered.forEach((n, idx) => {
        const isSel = (!q && idx === 0);
        itemsHtml += `
          <div class="vault-wikilink-item ${isSel ? 'is-selected' : ''}" data-title="${escapeHtml(n.title)}">
            <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>
              <span class="text-truncate" style="font-size: 13px; font-weight: 500;">${escapeHtml(n.title)}</span>
            </div>
            <span style="font-size: 10px; color: var(--text-tertiary);">${new Date(n.updated_at || n.created_at).toLocaleDateString()}</span>
          </div>
        `;
      });

      if (!itemsHtml) {
        itemsHtml = '<div style="padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 12px;">No matching notes found</div>';
      }

      listEl.innerHTML = itemsHtml;

      listEl.querySelectorAll('.vault-wikilink-item').forEach(item => {
        item.addEventListener('click', () => {
          selectTitle(item.getAttribute('data-title'));
        });
      });
    }

    function selectTitle(title) {
      if (!title || !title.trim()) {
        closeModal();
        return;
      }
      closeModal();
      insertWikiLinkToken(title.trim());
    }

    function closeModal() {
      backdrop.remove();
    }

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    input.addEventListener('input', () => {
      renderItems(input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
        return;
      }

      const items = Array.from(listEl.querySelectorAll('.vault-wikilink-item'));
      let selIdx = items.findIndex(el => el.classList.contains('is-selected'));

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (selIdx < items.length - 1) {
          if (selIdx >= 0) items[selIdx].classList.remove('is-selected');
          selIdx++;
          items[selIdx].classList.add('is-selected');
          items[selIdx].scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selIdx > 0) {
          items[selIdx].classList.remove('is-selected');
          selIdx--;
          items[selIdx].classList.add('is-selected');
          items[selIdx].scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selIdx >= 0 && items[selIdx]) {
          selectTitle(items[selIdx].getAttribute('data-title'));
        } else if (input.value.trim()) {
          selectTitle(input.value.trim());
        }
      }
    });

    renderItems(query);
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  }

  function insertWikiLinkToken(title) {
    if (viewMode === 'edit') {
      wysiwygCanvas.focus();
      const pillHtml = `<span class="wiki-link-pill" data-title="${escapeHtml(title)}" contenteditable="false">[[${escapeHtml(title)}]]</span>&nbsp;`;
      document.execCommand('insertHTML', false, pillHtml);
      if (editorInstance) {
        contentInput.value = editorInstance.getContentMarkdown();
        updateWordCountAndMetrics();
        updateOutline();
        updatePreview();
        triggerAutoSave();
      }
    } else {
      const ta = contentInput;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const rep = `[[${title}]] `;
      ta.setRangeText(rep, start, end, 'end');
      ta.focus();
      if (editorInstance) {
        editorInstance.setContentMarkdown(ta.value);
      }
      updateWordCountAndMetrics();
      updateOutline();
      updatePreview();
      triggerAutoSave();
    }
  }

  function applyFormattingCommand(cmd) {
    const ed = editorInstance || window.vaultEditorInstance;
    if (cmd === 'undo') {
      if (ed && typeof ed.undo === 'function') {
        ed.undo();
      } else {
        document.execCommand('undo', false, null);
      }
      return;
    }

    if (cmd === 'redo') {
      if (ed && typeof ed.redo === 'function') {
        ed.redo();
      } else {
        document.execCommand('redo', false, null);
      }
      return;
    }

    if (cmd === 'image') {
      document.getElementById('vault-hidden-image-input')?.click();
      return;
    }

    if (cmd === 'video') {
      document.getElementById('vault-hidden-video-input')?.click();
      return;
    }

    if (cmd === 'audio') {
      document.getElementById('vault-hidden-audio-input')?.click();
      return;
    }

    if (cmd === 'file') {
      document.getElementById('vault-hidden-file-input')?.click();
      return;
    }

    if (cmd === 'wikilink' || cmd === 'link') {
      openWikiLinkModal();
      return;
    }

    if (viewMode === 'edit') {
      wysiwygCanvas.focus();
      switch (cmd) {
        case 'h1':
          if (editorInstance) editorInstance.insertBlock('<h1>Heading 1</h1>');
          else document.execCommand('formatBlock', false, '<h1>');
          break;
        case 'h2':
          if (editorInstance) editorInstance.insertBlock('<h2>Heading 2</h2>');
          else document.execCommand('formatBlock', false, '<h2>');
          break;
        case 'h3':
          if (editorInstance) editorInstance.insertBlock('<h3>Heading 3</h3>');
          else document.execCommand('formatBlock', false, '<h3>');
          break;
        case 'bold':
          document.execCommand('bold', false, null);
          break;
        case 'italic':
          document.execCommand('italic', false, null);
          break;
        case 'strike':
          document.execCommand('strikeThrough', false, null);
          break;
        case 'mark':
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const mark = document.createElement('mark');
            mark.className = 'editor-mark';
            mark.appendChild(range.extractContents());
            range.insertNode(mark);
          }
          break;
        case 'code':
          document.execCommand('insertHTML', false, `<code>${window.getSelection()?.toString() || 'code'}</code>`);
          break;
        case 'todo':
        case 'check':
          if (editorInstance) editorInstance.insertBlock('<div class="vault-checklist-item" data-task="true"><input type="checkbox" /> <span class="vault-checklist-text">Task item</span></div>');
          else document.execCommand('insertHTML', false, '<div class="vault-checklist-item" data-task="true"><input type="checkbox" /> <span class="vault-checklist-text">Task item</span></div><p><br></p>');
          break;
        case 'bullet':
        case 'list':
          if (editorInstance) editorInstance.insertBlock('<ul><li>List item</li></ul>');
          else document.execCommand('insertUnorderedList', false, null);
          break;
        case 'number':
          if (editorInstance) editorInstance.insertBlock('<ol><li>First step</li></ol>');
          else document.execCommand('insertOrderedList', false, null);
          break;
        case 'quote':
          if (editorInstance) editorInstance.insertBlock('<blockquote><p>Quote text...</p></blockquote>');
          else document.execCommand('formatBlock', false, '<blockquote>');
          break;
        case 'callout':
          const calloutHtml = '<div class="vault-callout" data-callout="NOTE"><span class="vault-callout-icon" contenteditable="false"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span><div class="vault-callout-body"><strong>NOTE:</strong> Important knowledge item.</div></div>';
          if (editorInstance) editorInstance.insertBlock(calloutHtml);
          else document.execCommand('insertHTML', false, calloutHtml);
          break;
        case 'table':
          const tableHtml = '<div class="vault-table-block"><table class="vault-table"><thead><tr><th>Header 1</th><th>Header 2</th></tr></thead><tbody><tr><td>Cell 1</td><td>Cell 2</td></tr></tbody></table></div>';
          if (editorInstance) editorInstance.insertBlock(tableHtml);
          else document.execCommand('insertHTML', false, tableHtml);
          break;
        case 'divider':
          if (editorInstance) editorInstance.insertBlock('<div class="vault-divider-block"><hr class="vault-divider" /></div>');
          else document.execCommand('insertHorizontalRule', false, null);
          break;
      }
      // Sync to canonical Markdown
      if (editorInstance) {
        contentInput.value = editorInstance.getContentMarkdown();
        updateWordCountAndMetrics();
        updateOutline();
        updatePreview();
        triggerAutoSave();
      }
    } else {
      // Split / Textarea mode fallback
      const ta = contentInput;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = ta.value.substring(start, end);
      let rep = '';
      switch (cmd) {
        case 'h1': rep = `\n# ${selected || 'Heading 1'}\n`; break;
        case 'h2': rep = `\n## ${selected || 'Heading 2'}\n`; break;
        case 'h3': rep = `\n### ${selected || 'Heading 3'}\n`; break;
        case 'bold': rep = `**${selected || 'bold text'}**`; break;
        case 'italic': rep = `*${selected || 'italic text'}*`; break;
        case 'strike': rep = `~~${selected || 'strikethrough text'}~~`; break;
        case 'mark': rep = `==${selected || 'highlighted text'}==`; break;
        case 'code': rep = `\`${selected || 'code'}\``; break;
        case 'todo':
        case 'check': rep = `\n- [ ] ${selected || 'Task item'}\n`; break;
        case 'bullet':
        case 'list': rep = `\n- ${selected || 'Bullet item'}\n`; break;
        case 'number': rep = `\n1. ${selected || 'Numbered item'}\n`; break;
        case 'quote': rep = `\n> ${selected || 'Blockquote'}\n`; break;
        case 'callout': rep = `\n> [!NOTE]\n> ${selected || 'Important note'}\n`; break;
        case 'table': rep = `\n| Column 1 | Column 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n`; break;
        case 'divider': rep = `\n---\n`; break;
      }
      ta.setRangeText(rep, start, end, 'end');
      ta.focus();
      if (editorInstance) {
        editorInstance.setContentMarkdown(ta.value);
      }
      updateWordCountAndMetrics();
      updateOutline();
      updatePreview();
      triggerAutoSave();
    }
  }

  // --------------------------------------------------------------------------
  // Mode Switcher (Edit, Split, Read)
  // --------------------------------------------------------------------------
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.remove('btn--primary');
        b.classList.add('btn--ghost');
      });
      btn.classList.remove('btn--ghost');
      btn.classList.add('btn--primary');
      viewMode = btn.getAttribute('data-mode');

      if (viewMode === 'edit') {
        wysiwygContainer.style.display = 'block';
        textareaPane.style.display = 'none';
        previewPane.style.display = 'none';
        if (editorInstance) {
          editorInstance.setContentMarkdown(contentInput.value);
        }
      } else if (viewMode === 'split') {
        wysiwygContainer.style.display = 'none';
        textareaPane.style.display = 'block';
        previewPane.style.display = 'block';
        textareaPane.style.borderRight = '1px solid var(--border-primary)';
        updatePreview();
      } else if (viewMode === 'preview') {
        wysiwygContainer.style.display = 'none';
        textareaPane.style.display = 'none';
        previewPane.style.display = 'block';
        textareaPane.style.borderRight = 'none';
        updatePreview();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Properties Tab Management
  // --------------------------------------------------------------------------
  async function refreshPropertiesFolderSelect() {
    const noteFolderSelect = document.getElementById('note-folder-select');
    if (!noteFolderSelect || !activeNote) return;
    try {
      const q = activeNote.project_id ? `?project_id=${activeNote.project_id}` : '';
      const fRes = await window.API.get(`/notes/folders${q}`);
      const fList = fRes.folders || [];
      let pSelectHtml = `<option value="">(None - Uncategorized)</option>`;
      fList.forEach(f => {
        pSelectHtml += `<option value="${f.id}">${escapeHtml(f.name)}</option>`;
      });
      noteFolderSelect.innerHTML = pSelectHtml;
      noteFolderSelect.value = activeNote.folder_id || '';
    } catch (_) {}
  }

  function renderProperties() {
    if (!activeNote) return;

    refreshPropertiesFolderSelect();

    const pinToggle = document.getElementById('note-pin-toggle');
    if (pinToggle) {
      pinToggle.checked = !!activeNote.is_pinned;
    }

    document.getElementById('prop-created-at').textContent = activeNote.created_at ? new Date(activeNote.created_at).toLocaleString() : '-';
    document.getElementById('prop-updated-at').textContent = activeNote.updated_at ? new Date(activeNote.updated_at).toLocaleString() : '-';

    renderNoteTags();
  }

  function renderNoteTags() {
    const container = document.getElementById('note-inspector-tags');
    const headerContainer = document.getElementById('note-tags-container');
    if (!activeNote) return;

    const rawTags = activeNote.tags || [];
    const noteTags = rawTags.map(t => typeof t === 'string' ? t : (t && t.name ? t.name : String(t || ''))).filter(Boolean);
    const html = noteTags.map(tagName => `
      <span class="tag tag--violet" style="font-size: 10px; padding: 1px 6px; display: inline-flex; align-items: center; gap: 4px;">
        #${escapeHtml(tagName)}
        <button class="btn-del-note-tag" data-tag="${escapeHtml(tagName)}" style="background: none; border: none; padding: 0; color: var(--text-tertiary); cursor: pointer; font-size: 10px;">&times;</button>
      </span>
    `).join('');

    if (container) container.innerHTML = html || '<span class="text-xs text-tertiary">No tags</span>';
    if (headerContainer) headerContainer.innerHTML = html;

    const bindTagDeletes = (root) => {
      root.querySelectorAll('.btn-del-note-tag').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const tagToDel = btn.getAttribute('data-tag');
          const currentTags = (activeNote.tags || []).map(t => typeof t === 'string' ? t : (t && t.name ? t.name : String(t || ''))).filter(Boolean);
          const nextTags = currentTags.filter(t => t !== tagToDel);
          try {
            const res = await window.API.put(`/notes/${activeNote.id}`, { tags: nextTags });
            activeNote = res.note;
            renderNoteTags();
            loadFoldersAndTags();
          } catch (err) {
            window.showToast('Failed to remove tag', 'error');
          }
        });
      });
    };

    if (container) bindTagDeletes(container);
    if (headerContainer) bindTagDeletes(headerContainer);
  }

  document.getElementById('note-tags-input')?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = e.target.value.trim().replace(/^#/, '');
      if (!val || !activeNote) return;
      const current = (activeNote.tags || []).map(t => typeof t === 'string' ? t : (t && t.name ? t.name : String(t || ''))).filter(Boolean);
      if (!current.includes(val)) {
        current.push(val);
        try {
          const res = await window.API.put(`/notes/${activeNote.id}`, { tags: current });
          activeNote = res.note;
          e.target.value = '';
          renderNoteTags();
          loadFoldersAndTags();
        } catch (err) {
          window.showToast('Failed to add tag', 'error');
        }
      }
    }
  });

  document.getElementById('note-folder-select')?.addEventListener('change', async (e) => {
    if (!activeNote) return;
    const fId = e.target.value || null;
    try {
      const res = await window.API.put(`/notes/${activeNote.id}`, { folder_id: fId });
      activeNote = res.note;
      const folderMatch = folders.find(f => f.id === activeNote.folder_id);
      document.getElementById('canvas-folder-badge').textContent = folderMatch ? folderMatch.name : 'Uncategorized';
      loadNotes();
      window.showToast('Folder updated', 'success');
    } catch (err) {
      window.showToast('Failed to update folder', 'error');
    }
  });

  document.getElementById('note-pin-toggle')?.addEventListener('change', async (e) => {
    if (!activeNote) return;
    const isPinned = e.target.checked;
    try {
      const res = await window.API.put(`/notes/${activeNote.id}`, { is_pinned: isPinned });
      activeNote = res.note;
      loadNotes();
      window.showToast(isPinned ? 'Note pinned' : 'Note unpinned', 'success');
    } catch (err) {
      window.showToast('Failed to update pin', 'error');
    }
  });

  // --------------------------------------------------------------------------
  // Backlinks & Unlinked Mentions
  // --------------------------------------------------------------------------
  function renderBacklinksAndMentions() {
    const bList = document.getElementById('backlinks-list');
    const uList = document.getElementById('unlinked-list');
    const bottomBList = document.getElementById('bottom-backlinks-list');
    const bottomUList = document.getElementById('bottom-unlinked-list');
    const bottomBCount = document.getElementById('bottom-backlinks-count');
    const bottomUCount = document.getElementById('bottom-mentions-count');

    if (!activeNote) return;

    const backlinks = activeNote.backlinks || [];
    const unlinked = activeNote.unlinkedMentions || [];

    if (bottomBCount) bottomBCount.textContent = backlinks.length;
    if (bottomUCount) bottomUCount.textContent = unlinked.length;

    if (backlinks.length > 0) {
      const bHtml = backlinks.map(b => `
        <span class="tag tag--violet backlink-pill" data-id="${b.id}" style="cursor: pointer; padding: 2px 8px; font-size: 11px;">
          ← ${escapeHtml(b.title)}
        </span>
      `).join('');
      if (bList) bList.innerHTML = bHtml;
      if (bottomBList) bottomBList.innerHTML = bHtml;
    } else {
      const emptyHtml = `<span class="text-xs text-tertiary">No incoming backlinks</span>`;
      if (bList) bList.innerHTML = emptyHtml;
      if (bottomBList) bottomBList.innerHTML = emptyHtml;
    }

    document.querySelectorAll('.backlink-pill').forEach(p => {
      p.addEventListener('click', () => openNote(p.getAttribute('data-id')));
    });

    if (unlinked.length > 0) {
      const uHtml = unlinked.map(u => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; background: var(--bg-tertiary); border-radius: var(--radius-sm);">
          <span class="text-xs text-secondary text-truncate" style="max-width: 170px;">${escapeHtml(u.title)}</span>
          <button class="btn btn--xs btn--primary btn-link-mention" data-id="${u.id}" data-title="${escapeHtml(u.title)}" style="font-size: 10px; padding: 1px 6px; height: 18px;">
            Link
          </button>
        </div>
      `).join('');
      if (uList) uList.innerHTML = uHtml;
      if (bottomUList) bottomUList.innerHTML = uHtml;

      document.querySelectorAll('.btn-link-mention').forEach(btn => {
        btn.addEventListener('click', async () => {
          const uId = btn.getAttribute('data-id');
          try {
            await window.API.post(`/notes/${activeNote.id}/link-mention`, { targetNoteId: uId });
            window.showToast('Mention converted to active link', 'success');
            openNote(activeNote.id);
          } catch (err) {
            window.showToast('Failed to link mention', 'error');
          }
        });
      });
    } else {
      const emptyHtml = `<span class="text-xs text-tertiary">No unlinked mentions found</span>`;
      if (uList) uList.innerHTML = emptyHtml;
      if (bottomUList) bottomUList.innerHTML = emptyHtml;
    }
  }

  // --------------------------------------------------------------------------
  // Note Connections (entity_links)
  // --------------------------------------------------------------------------
  async function loadConnectedNotes() {
    const listEl = document.getElementById('vault-connected-notes-list');
    if (!listEl || !activeNote) return;

    try {
      const res = await window.API.get(`/notes/${activeNote.id}/connections`);
      const connections = res.connections || [];

      if (connections.length === 0) {
        listEl.innerHTML = `<span class="text-xs text-tertiary">No notes connected</span>`;
        return;
      }

      const relLabels = {
        'relates_to': 'Relates to',
        'supports': 'Supports',
        'contradicts': 'Contradicts',
        'inspired_by': 'Inspired by',
        'depends_on': 'Depends on',
        'references': 'References'
      };

      listEl.innerHTML = connections.map(conn => {
        const rawRel = conn.link_type || 'relates_to';
        const label = relLabels[rawRel] || rawRel.replace(/_/g, ' ');
        const arrow = conn.direction === 'outgoing' ? '&rarr;' : '&larr;';
        return `
          <div class="connected-note-pill" data-id="${conn.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border-radius: var(--radius-sm); background: var(--bg-tertiary); border: 1px solid var(--border-primary); cursor: pointer;">
            <div class="note-conn-title" style="display: flex; flex-direction: column; overflow: hidden; max-width: 210px;">
              <span style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent-primary);">${label} ${arrow}</span>
              <strong style="font-size: 11px; color: var(--text-primary);" class="text-truncate">${escapeHtml(conn.title)}</strong>
            </div>
            <button class="btn btn--ghost btn--xs btn-unlink-note" data-target-id="${conn.id}" data-target-title="${escapeHtml(conn.title)}" title="Unlink note" style="padding: 0 4px; height: 18px; color: var(--text-tertiary); font-size: 12px;">&times;</button>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('.connected-note-pill .note-conn-title').forEach(el => {
        el.addEventListener('click', () => {
          const pill = el.closest('.connected-note-pill');
          const targetId = pill.getAttribute('data-id');
          if (targetId) openNote(targetId);
        });
      });

      listEl.querySelectorAll('.btn-unlink-note').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const targetId = btn.getAttribute('data-target-id');
          const targetTitle = btn.getAttribute('data-target-title') || 'this note';
          if (!confirm(`Disconnect "${targetTitle}"? Both original notes will remain intact.`)) {
            return;
          }
          try {
            await window.API.delete(`/notes/${activeNote.id}/connections/${targetId}`);
            window.showToast(`Unlinked from "${targetTitle}"`, 'success');
            loadConnectedNotes();
          } catch (err) {
            window.showToast('Failed to unlink: ' + err.message, 'error');
          }
        });
      });
    } catch (err) {
      console.warn('Error loading connected notes:', err);
      listEl.innerHTML = `<span class="text-xs text-tertiary">Failed to load connections</span>`;
    }
  }

  async function openConnectNoteModal() {
    if (!activeNote) {
      window.showToast('Please open or create a note first', 'error');
      return;
    }

    try {
      const notesRes = await window.API.get('/notes');
      const allUserNotes = notesRes.notes || [];

      const connsRes = await window.API.get(`/notes/${activeNote.id}/connections`);
      const existingConnIds = new Set((connsRes.connections || []).map(c => parseInt(c.id, 10)));
      existingConnIds.add(parseInt(activeNote.id, 10));

      const candidates = allUserNotes.filter(n => !existingConnIds.has(parseInt(n.id, 10)));

      if (candidates.length === 0) {
        window.showToast('No other available notes to connect. Create another note first!', 'info');
        return;
      }

      let selectedNoteId = candidates[0].id;

      const modalContent = `
        <div style="display: flex; flex-direction: column; gap: var(--space-4);">
          <div>
            <label class="label" style="margin-bottom: 4px; display: block; font-size: var(--text-xs); font-weight: 600;">Relationship Type</label>
            <select id="modal-conn-relationship" class="input" style="height: 36px; width: 100%; font-size: var(--text-sm);">
              <option value="relates_to">Relates To (General Connection)</option>
              <option value="supports">Supports (Confirms or strengthens)</option>
              <option value="contradicts">Contradicts (Opposing argument)</option>
              <option value="inspired_by">Inspired By (Ideation source)</option>
              <option value="depends_on">Depends On (Prerequisite)</option>
              <option value="references">References (Cites concept)</option>
            </select>
          </div>

          <div>
            <label class="label" style="margin-bottom: 4px; display: block; font-size: var(--text-xs); font-weight: 600;">Search & Select Note</label>
            <input type="text" id="modal-conn-search" class="input" placeholder="Type to filter notes by title or folder..." style="height: 36px; width: 100%; font-size: var(--text-sm); margin-bottom: 8px;" />
            
            <div id="modal-conn-notes-list" style="max-height: 240px; overflow-y: auto; border: 1px solid var(--border-primary); border-radius: var(--radius-sm); background: var(--bg-primary);">
              ${candidates.map((n, idx) => `
                <div class="modal-note-option-row" data-id="${n.id}" style="padding: 10px 12px; border-bottom: 1px solid var(--border-primary); cursor: pointer; display: flex; align-items: center; justify-content: space-between; background-color: ${idx === 0 ? 'var(--bg-active)' : 'transparent'};">
                  <div>
                    <div style="font-weight: 600; font-size: var(--text-sm); color: var(--text-primary);">${escapeHtml(n.title)}</div>
                    <div class="text-xs text-secondary" style="font-size: 11px;">${n.folder_name ? escapeHtml(n.folder_name) + ' &bull; ' : ''}${n.word_count || 0} words</div>
                  </div>
                  <span class="badge badge--primary" style="font-size: 10px; display: ${idx === 0 ? 'inline-block' : 'none'};">Selected</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      window.Modal.open({
        title: `Connect Note to "${escapeHtml(activeNote.title)}"`,
        content: modalContent,
        size: 'md',
        buttons: [
          {
            text: 'Cancel',
            variant: 'ghost',
            onClick: (m, inst) => inst.close()
          },
          {
            text: 'Connect Note',
            variant: 'primary',
            onClick: async (m, inst) => {
              if (!selectedNoteId) {
                alert('Please select a target note to connect');
                return;
              }
              const relSelect = document.getElementById('modal-conn-relationship');
              const relationship = relSelect ? relSelect.value : 'relates_to';
              const selectedTarget = candidates.find(c => c.id == selectedNoteId);

              try {
                await window.API.post(`/notes/${activeNote.id}/connections`, {
                  targetNoteId: selectedNoteId,
                  relationship
                });
                inst.close();
                window.showToast(`Connected to "${selectedTarget ? selectedTarget.title : 'note'}"`, 'success');
                loadConnectedNotes();
              } catch (err) {
                window.showToast('Failed to connect note: ' + err.message, 'error');
              }
            }
          }
        ]
      });

      setTimeout(() => {
        const searchInput = document.getElementById('modal-conn-search');
        const listContainer = document.getElementById('modal-conn-notes-list');

        function updateSelection(id) {
          selectedNoteId = id;
          if (!listContainer) return;
          listContainer.querySelectorAll('.modal-note-option-row').forEach(row => {
            const isSel = row.getAttribute('data-id') == id;
            row.style.backgroundColor = isSel ? 'var(--bg-active)' : 'transparent';
            const badge = row.querySelector('.badge');
            if (badge) badge.style.display = isSel ? 'inline-block' : 'none';
          });
        }

        if (listContainer) {
          listContainer.querySelectorAll('.modal-note-option-row').forEach(row => {
            row.addEventListener('click', () => {
              updateSelection(row.getAttribute('data-id'));
            });
          });
        }

        if (searchInput && listContainer) {
          searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            let firstVisibleId = null;
            listContainer.querySelectorAll('.modal-note-option-row').forEach(row => {
              const text = row.textContent.toLowerCase();
              const match = !q || text.includes(q);
              row.style.display = match ? 'flex' : 'none';
              if (match && !firstVisibleId) firstVisibleId = row.getAttribute('data-id');
            });
            if (firstVisibleId && (!selectedNoteId || listContainer.querySelector(`[data-id="${selectedNoteId}"]`).style.display === 'none')) {
              updateSelection(firstVisibleId);
            }
          });
        }
      }, 50);

    } catch (err) {
      window.showToast('Failed to open connect dialog: ' + err.message, 'error');
    }
  }

  document.getElementById('btn-vault-connect-note')?.addEventListener('click', openConnectNoteModal);
  document.getElementById('btn-tray-connect-note')?.addEventListener('click', openConnectNoteModal);

  // --------------------------------------------------------------------------
  // Connected Workflow Tasks
  // --------------------------------------------------------------------------
  async function loadConnectedTasks() {
    const tList = document.getElementById('vault-connected-tasks-list');
    const bottomTList = document.getElementById('bottom-tasks-list');
    const bottomTCount = document.getElementById('bottom-tasks-count');
    if (!activeNote) return;

    try {
      const res = await window.API.get(`/notes/${activeNote.id}/tasks`);
      const tasks = res.tasks || [];
      if (bottomTCount) bottomTCount.textContent = tasks.length;

      if (tasks.length === 0) {
        const emptyHtml = `<span class="text-xs text-tertiary">No tasks connected</span>`;
        if (tList) tList.innerHTML = emptyHtml;
        if (bottomTList) bottomTList.innerHTML = emptyHtml;
        return;
      }

      const statusColors = {
        planned: 'var(--text-tertiary, #94a3b8)',
        in_progress: 'var(--color-info, #2563eb)',
        done: 'var(--color-success, #16a34a)'
      };

      const tasksHtml = tasks.map(t => {
        const statusColor = statusColors[t.status] || '#94a3b8';
        return `
          <div class="task-linked-pill" data-task-id="${t.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; border-radius: var(--radius-sm); background: var(--bg-tertiary); border: 1px solid var(--border-primary); cursor: pointer;" title="Open in Workflow Tracker">
            <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; max-width: 210px;">
              <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${statusColor}; flex-shrink: 0;"></span>
              <span style="font-weight: 500; color: var(--text-primary); font-size: 11px;" class="text-truncate">${escapeHtml(t.title)}</span>
              <span class="badge badge--status-${t.status}" style="font-size: 9px; padding: 1px 4px;">${escapeHtml(t.status)}</span>
            </div>
            <button type="button" class="btn-unlink-task" data-task-id="${t.id}" title="Unlink task" style="background: none; border: none; padding: 0 4px; cursor: pointer; color: var(--text-tertiary); font-size: 12px; line-height: 1;">&times;</button>
          </div>
        `;
      }).join('');

      if (tList) tList.innerHTML = tasksHtml;
      if (bottomTList) bottomTList.innerHTML = tasksHtml;

      document.querySelectorAll('.task-linked-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
          if (e.target.closest('.btn-unlink-task')) return;
          const taskId = pill.getAttribute('data-task-id');
          window.Router.navigate(`/workflow?taskId=${taskId}`);
        });
      });

      document.querySelectorAll('.btn-unlink-task').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const taskId = btn.getAttribute('data-task-id');
          if (!confirm('Unlink this task from the note? (The original task will not be deleted)')) return;
          try {
            await window.API.delete(`/notes/${activeNote.id}/tasks/${taskId}`);
            window.showToast('Task unlinked from note', 'success');
            loadConnectedTasks();
          } catch (err) {
            window.showToast('Failed to unlink task: ' + err.message, 'error');
          }
        });
      });
    } catch (err) {
      console.warn('Error loading connected tasks:', err);
    }
  }

  document.getElementById('btn-vault-add-task')?.addEventListener('click', async () => {
    if (!activeNote) return;

    let existingTasks = [];
    try {
      const res = await window.API.get('/tasks');
      existingTasks = res.tasks || [];
    } catch (e) {
      console.warn('Failed to load tasks for link modal:', e);
    }

    const modal = window.Modal.open({
      title: `Connect Task to "${escapeHtml(activeNote.title)}"`,
      size: 'md',
      content: `
        <div style="margin-bottom: var(--space-4);">
          <div style="display: flex; gap: var(--space-2); margin-bottom: var(--space-4); border-bottom: 1px solid var(--border-primary); padding-bottom: var(--space-2);">
            <button type="button" class="btn btn--sm btn--primary modal-tab-btn" data-tab="create" id="tab-create-task">Create New Task</button>
            <button type="button" class="btn btn--sm btn--ghost modal-tab-btn" data-tab="link" id="tab-link-task">Link Existing Task</button>
          </div>

          <div id="pane-create-task">
            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label" for="new-task-title" style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 4px;">Task Title *</label>
              <input type="text" id="new-task-title" class="input" placeholder="e.g. Implement schema migration script" autofocus style="width: 100%; height: 32px;" />
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label" for="new-task-desc" style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 4px;">Description</label>
              <textarea id="new-task-desc" class="textarea" rows="2" placeholder="Task details or acceptance criteria..." style="width: 100%; font-size: 12px;"></textarea>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="new-task-status" style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 4px;">Status</label>
                <select id="new-task-status" class="select" style="width: 100%; height: 32px;">
                  <option value="planned">Planned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="new-task-priority" style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 4px;">Priority</label>
                <select id="new-task-priority" class="select" style="width: 100%; height: 32px;">
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
          </div>

          <div id="pane-link-task" style="display: none;">
            <div class="form-group">
              <label class="form-label" for="select-existing-task" style="font-size: 11px; font-weight: 600; display: block; margin-bottom: 4px;">Select Existing Workflow Task</label>
              <select id="select-existing-task" class="select" style="width: 100%; height: 34px;">
                ${existingTasks.length === 0 ? '<option value="">No existing tasks found</option>' : existingTasks.map(t => `<option value="${t.id}">${escapeHtml(t.title)} (${escapeHtml(t.status)})</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      `,
      buttons: [
        { text: 'Cancel', variant: 'ghost', onClick: (m, inst) => inst.close() },
        {
          text: 'Connect Task',
          variant: 'primary',
          onClick: async (m, inst) => {
            const isCreate = document.getElementById('pane-create-task').style.display !== 'none';
            try {
              if (isCreate) {
                const title = document.getElementById('new-task-title').value.trim();
                if (!title) {
                  alert('Please enter a task title');
                  return;
                }
                const description = document.getElementById('new-task-desc').value.trim();
                const status = document.getElementById('new-task-status').value;
                const priority = document.getElementById('new-task-priority').value;

                await window.API.post(`/notes/${activeNote.id}/tasks`, {
                  title,
                  description,
                  status,
                  priority
                });
                window.showToast('Task created and linked to note', 'success');
              } else {
                const taskId = document.getElementById('select-existing-task').value;
                if (!taskId) {
                  alert('Please select a task to connect');
                  return;
                }
                await window.API.post(`/notes/${activeNote.id}/tasks`, { taskId });
                window.showToast('Task linked to note', 'success');
              }
              inst.close();
              loadConnectedTasks();
            } catch (err) {
              window.showToast('Failed to connect task: ' + err.message, 'error');
            }
          }
        }
      ]
    });

    const tabCreate = document.getElementById('tab-create-task');
    const tabLink = document.getElementById('tab-link-task');
    const paneCreate = document.getElementById('pane-create-task');
    const paneLink = document.getElementById('pane-link-task');

    if (tabCreate && tabLink && paneCreate && paneLink) {
      tabCreate.addEventListener('click', () => {
        tabCreate.className = 'btn btn--sm btn--primary modal-tab-btn';
        tabLink.className = 'btn btn--sm btn--ghost modal-tab-btn';
        paneCreate.style.display = 'block';
        paneLink.style.display = 'none';
      });

      tabLink.addEventListener('click', () => {
        tabLink.className = 'btn btn--sm btn--primary modal-tab-btn';
        tabCreate.className = 'btn btn--sm btn--ghost modal-tab-btn';
        paneCreate.style.display = 'none';
        paneLink.style.display = 'block';
      });
    }
  });

  // --------------------------------------------------------------------------
  // Version History Modal
  // --------------------------------------------------------------------------
  document.getElementById('btn-version-history')?.addEventListener('click', async () => {
    if (!activeNote) return;

    try {
      const res = await window.API.get(`/notes/${activeNote.id}/versions`);
      const versions = res.versions || [];

      if (versions.length === 0) {
        window.Modal.open({
          title: 'Version History',
          size: 'sm',
          content: `
            <div style="text-align: center; padding: var(--space-6) var(--space-4);">
              <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; margin: 0 auto var(--space-3) auto; color: var(--text-tertiary);">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">No Previous Versions Yet</div>
              <p class="text-xs text-secondary">Flowden automatically snapshots versions whenever you save meaningful edits to your notes.</p>
            </div>
          `,
          buttons: [{ text: 'Close', variant: 'ghost', onClick: (m, inst) => inst.close() }]
        });
        return;
      }

      const modal = window.Modal.open({
        title: `Version History: "${escapeHtml(activeNote.title)}"`,
        size: 'lg',
        content: `
          <div style="display: flex; gap: var(--space-4); height: 460px; overflow: hidden;">
            <div style="width: 210px; border-right: 1px solid var(--border-primary); padding-right: var(--space-3); overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-2);">
              <div style="font-size: var(--text-xs); font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 2px;">Snapshots (${versions.length})</div>
              ${versions.map((v, idx) => `
                <div class="card card--interactive version-item ${idx === 0 ? 'card--active' : ''}" data-ver-id="${v.id}" data-ver-num="${v.version_number}" style="padding: var(--space-2) var(--space-3); cursor: pointer; border-radius: var(--radius-sm); border: 1px solid ${idx === 0 ? 'var(--accent-primary)' : 'var(--border-primary)'}; background-color: var(--bg-secondary);">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                    <strong style="font-size: var(--text-xs); color: var(--text-primary);">v${v.version_number}</strong>
                    <span class="text-xs text-secondary" style="font-size: 10px;">${v.char_count || 0} chars</span>
                  </div>
                  <div class="text-xs text-tertiary" style="font-size: 11px;">
                    ${new Date(v.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              `).join('')}
            </div>

            <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;" id="version-inspect-pane">
              <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: var(--space-2); border-bottom: 1px solid var(--border-primary); margin-bottom: var(--space-3);">
                <div>
                  <span id="inspect-version-title" style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);">Loading version...</span>
                  <div class="text-xs text-secondary" id="inspect-version-date"></div>
                </div>
                <button class="btn btn--primary btn--sm" id="btn-restore-version-action" disabled>
                  Restore this Version
                </button>
              </div>

              <div class="diff-container" id="version-diff-output" style="flex: 1; height: 100%; overflow-y: auto; font-family: var(--font-mono); font-size: 12px; line-height: 1.5; white-space: pre-wrap; background: var(--bg-tertiary); padding: 12px; border-radius: var(--radius-sm);">
                Loading version contents...
              </div>
            </div>
          </div>
        `,
        buttons: [
          { text: 'Close', variant: 'ghost', onClick: (m, inst) => inst.close() }
        ]
      });

      function renderDiffLines(oldText, newText) {
        const oldLines = (oldText || '').split('\n');
        const newLines = (newText || '').split('\n');
        const result = [];
        let i = 0, j = 0;

        while (i < oldLines.length || j < newLines.length) {
          if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
            result.push(`<span class="diff-line--same" style="color: var(--text-secondary);">  ${escapeHtml(oldLines[i])}</span>`);
            i++; j++;
          } else if (i < oldLines.length && (j >= newLines.length || !newLines.includes(oldLines[i]))) {
            result.push(`<span class="diff-line--del" style="color: var(--status-red); background: rgba(239,68,68,0.1);">- ${escapeHtml(oldLines[i])}</span>`);
            i++;
          } else if (j < newLines.length) {
            result.push(`<span class="diff-line--add" style="color: var(--status-green); background: rgba(52,211,153,0.1);">+ ${escapeHtml(newLines[j])}</span>`);
            j++;
          }
        }
        return result.join('\n');
      }

      let selectedVersionData = null;

      async function loadVersionDetail(versionId) {
        const outputEl = document.getElementById('version-diff-output');
        const titleEl = document.getElementById('inspect-version-title');
        const dateEl = document.getElementById('inspect-version-date');
        const restoreBtn = document.getElementById('btn-restore-version-action');

        if (!outputEl) return;
        outputEl.innerHTML = '<span class="text-secondary">Loading version snapshot...</span>';

        try {
          const detailRes = await window.API.get(`/notes/${activeNote.id}/versions/${versionId}`);
          selectedVersionData = detailRes.version;

          titleEl.textContent = `Version ${selectedVersionData.version_number}: "${selectedVersionData.title}"`;
          dateEl.textContent = `Captured ${new Date(selectedVersionData.created_at).toLocaleString()}`;
          restoreBtn.disabled = false;

          const currentContent = activeNote.content || '';
          const versionContent = selectedVersionData.content_markdown || '';
          outputEl.innerHTML = renderDiffLines(versionContent, currentContent);
        } catch (err) {
          outputEl.textContent = 'Error loading version detail.';
        }
      }

      setTimeout(() => {
        const items = document.querySelectorAll('.version-item');
        items.forEach(item => {
          item.addEventListener('click', () => {
            items.forEach(i => {
              i.style.borderColor = 'var(--border-primary)';
              i.classList.remove('card--active');
            });
            item.style.borderColor = 'var(--accent-primary)';
            item.classList.add('card--active');
            loadVersionDetail(item.getAttribute('data-ver-id'));
          });
        });

        if (versions.length > 0) {
          loadVersionDetail(versions[0].id);
        }

        document.getElementById('btn-restore-version-action')?.addEventListener('click', async () => {
          if (!selectedVersionData) return;
          try {
            await window.API.post(`/notes/${activeNote.id}/versions/${selectedVersionData.id}/restore`, {});
            window.Modal.close();
            window.showToast(`Restored version v${selectedVersionData.version_number}`, 'success');
            openNote(activeNote.id);
          } catch (err) {
            window.showToast('Failed to restore version: ' + err.message, 'error');
          }
        });
      }, 50);

    } catch (err) {
      window.showToast('Failed to load version history: ' + err.message, 'error');
    }
  });

  // --------------------------------------------------------------------------
  // Help Hub & Flowden Tour Integration
  // --------------------------------------------------------------------------
  document.getElementById('btn-vault-help')?.addEventListener('click', () => {
    if (window.VaultHelpCatalog && window.VaultHelpCatalog.openHelpHubModal) {
      window.VaultHelpCatalog.openHelpHubModal();
    } else if (window.VaultHelp && window.VaultHelp.openHelpMenu) {
      window.VaultHelp.openHelpMenu();
    }
  });

  // --------------------------------------------------------------------------
  // Knowledge Graph Navigation
  // --------------------------------------------------------------------------
  document.getElementById('btn-vault-graph')?.addEventListener('click', () => {
    window.Router.navigate('/graph');
  });

  // --------------------------------------------------------------------------
  // Create, Delete, Export, Import Note
  // --------------------------------------------------------------------------
  let isCreatingNote = false;
  async function createNewNote() {
    if (isCreatingNote) return;
    isCreatingNote = true;
    try {
      const folderVal = currentFolderId !== 'all' && currentFolderId !== 'root' ? currentFolderId : null;
      const res = await window.API.post('/notes', {
        title: 'Untitled Note',
        content: '',
        folder_id: folderVal
      });
      await loadNotes();
      await openNote(res.note.id);
      titleInput.focus();
      titleInput.select();
      window.showToast('New note created', 'success');
    } catch (err) {
      window.showToast('Failed to create note: ' + err.message, 'error');
    } finally {
      isCreatingNote = false;
    }
  }

  document.getElementById('btn-vault-create-note')?.addEventListener('click', createNewNote);
  document.getElementById('btn-vault-empty-create')?.addEventListener('click', createNewNote);
  document.getElementById('btn-bottom-add-task')?.addEventListener('click', () => {
    document.getElementById('btn-vault-add-task')?.click();
  });

  const onVaultGlobalKeyDown = (e) => {
    if (e.altKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      createNewNote();
    }
  };
  window.addEventListener('keydown', onVaultGlobalKeyDown);

  document.getElementById('btn-delete-current-note')?.addEventListener('click', () => {
    if (!activeNote) return;
    window.Modal.confirm({
      title: 'Delete Note',
      message: `Are you sure you want to permanently delete "${activeNote.title}"? This action cannot be undone.`,
      confirmText: 'Delete Note',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          await window.API.delete(`/notes/${activeNote.id}`);
          window.showToast('Note deleted', 'success');
          activeNote = null;
          emptyState.style.display = 'flex';
          editorActive.style.display = 'none';
          loadNotes();
        } catch (err) {
          window.showToast('Failed to delete note: ' + err.message, 'error');
        }
      }
    });
  });

  document.getElementById('btn-export-note-md')?.addEventListener('click', () => {
    if (!activeNote) return;
    const blob = new Blob([contentInput.value || ''], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(activeNote.title || 'untitled').replace(/[^a-z0-9_-]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    window.showToast('Markdown file downloaded', 'success');
  });

  document.getElementById('btn-vault-import-md')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.txt';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const title = file.name.replace(/\.[^/.]+$/, '');
      try {
        const created = await window.API.post('/notes', {
          title,
          content: text
        });
        await loadNotes();
        openNote(created.note.id);
        window.showToast(`Imported "${title}"`, 'success');
      } catch (err) {
        window.showToast('Failed to import file: ' + err.message, 'error');
      }
    };
    input.click();
  });

  document.getElementById('btn-vault-add-folder')?.addEventListener('click', () => {
    window.Modal.prompt({
      title: 'Create New Folder',
      message: 'Enter folder name:',
      placeholder: 'e.g. Distributed Systems, Architecture',
      confirmText: 'Create Folder',
      onConfirm: async (name) => {
        if (!name || !name.trim()) return;
        try {
          const payload = { name: name.trim() };
          const targetProjId = (activeNote && activeNote.project_id) || currentProjectId;
          if (targetProjId) {
            payload.project_id = targetProjId;
          }
          await window.API.post('/notes/folders', payload);
          window.showToast('Folder created', 'success');
          await loadFoldersAndTags();
          if (activeNote) await refreshPropertiesFolderSelect();
        } catch (err) {
          window.showToast('Failed to create folder: ' + err.message, 'error');
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Simple Markdown Renderer Helper for Preview
  // --------------------------------------------------------------------------
  function renderMarkdown(md) {
    if (!md) return '<p class="text-tertiary">Empty note</p>';
    if (window.VaultEditor && window.VaultEditor.markdownToHtml) {
      return window.VaultEditor.markdownToHtml(md);
    }
    return md
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/\n/gim, '<br>');
  }

  function escapeHtml(str) {
    const s = typeof str === 'string' ? str : (str && str.name ? str.name : String(str || ''));
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

window.renderVaultPage = renderVaultPage;
