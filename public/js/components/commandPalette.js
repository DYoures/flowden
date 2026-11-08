// Flowden Command Palette (Ctrl+K / Cmd+K)

const CommandPalette = {
  isOpen: false,
  overlayEl: null,
  selectedIndex: 0,
  filteredItems: [],
  liveWorkspaceItems: [],
  isLoading: false,
  errorMessage: null,
  debounceTimer: null,
  searchSeq: 0,
  lastSearchedQuery: '',

  commands: [
    // Navigation
    { id: 'nav-overview', title: 'Go to Overview Dashboard', category: 'Navigation', icon: 'layout-dashboard', shortcut: 'G O', action: () => window.Router.navigate('/overview') },
    { id: 'nav-projects', title: 'Go to Projects', category: 'Navigation', icon: 'folder-kanban', shortcut: 'G P', action: () => window.Router.navigate('/projects') },
    { id: 'nav-search', title: 'Go to Universal Search', category: 'Navigation', icon: 'search', shortcut: 'G F', action: () => window.Router.navigate('/search') },
    { id: 'nav-board', title: 'Go to Workspace Board', category: 'Navigation', icon: 'layout-grid', shortcut: 'G B', action: () => window.Router.navigate('/projects') },
    { id: 'nav-vault', title: 'Go to Knowledge Vault', category: 'Navigation', icon: 'book-open', shortcut: 'G V', action: () => window.Router.navigate('/vault') },
    { id: 'nav-graph', title: 'Go to Knowledge Graph', category: 'Navigation', icon: 'share-2', shortcut: 'G G', action: () => window.Router.navigate('/graph') },
    { id: 'nav-research', title: 'Go to Research Center', category: 'Navigation', icon: 'file-search', shortcut: 'G R', action: () => window.Router.navigate('/research') },
    { id: 'nav-workflow', title: 'Go to Workflow Tracker', category: 'Navigation', icon: 'check-square', shortcut: 'G W', action: () => window.Router.navigate('/workflow') },
    { id: 'nav-capture', title: 'Go to Quick Capture Inbox', category: 'Navigation', icon: 'inbox', shortcut: 'G C', action: () => window.Router.navigate('/capture') },
    { id: 'nav-assistant', title: 'Go to AI Assistant', category: 'Navigation', icon: 'bot', shortcut: 'G A', action: () => window.Router.navigate('/assistant') },
    { id: 'nav-guide', title: 'Go to Flowden Guide', category: 'Navigation', icon: 'help-circle', shortcut: 'G H', action: () => window.Router.navigate('/guide') },
    { id: 'nav-settings', title: 'Go to Settings', category: 'Navigation', icon: 'settings', shortcut: 'G S', action: () => window.Router.navigate('/settings') },

    // Actions
    { id: 'act-new-project', title: 'Create New Project', category: 'Actions', icon: 'plus', shortcut: 'N P', action: () => { window.Router.navigate('/projects'); if (window.openNewProjectModal) window.openNewProjectModal(); } },
    { id: 'act-new-note', title: 'Create Note in Vault', category: 'Actions', icon: 'pencil', shortcut: 'N N', action: () => window.Router.navigate('/vault') },
    { id: 'act-new-task', title: 'Create Task in Workflow', category: 'Actions', icon: 'check', shortcut: 'N T', action: () => window.Router.navigate('/workflow') },
    { id: 'act-quick-capture', title: 'Quick Capture Thought', category: 'Actions', icon: 'inbox', shortcut: 'Q', action: () => window.Router.navigate('/capture') },
    { id: 'act-toggle-theme', title: 'Toggle Light / Dark Mode', category: 'Actions', icon: 'moon', shortcut: 'T', action: () => window.toggleTheme && window.toggleTheme() }
  ],

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  init() {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.toggle();
      }
    });
  },

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  },

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.selectedIndex = 0;
    this.liveWorkspaceItems = [];
    this.isLoading = false;
    this.errorMessage = null;
    this.lastSearchedQuery = '';

    const overlay = document.createElement('div');
    overlay.className = 'command-palette-overlay';

    const searchIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon('search') : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';

    overlay.innerHTML = `
      <div class="command-palette">
        <div class="command-palette-header">
          <span style="color: var(--text-tertiary); display: flex;">${searchIcon}</span>
          <input type="text" class="command-palette-input" placeholder="Search notes, tasks, projects, boards, or type a command..." autocomplete="off" spellcheck="false" autofocus />
          <span style="font-size: 11px; color: var(--text-tertiary); font-family: var(--font-mono);">ESC to close</span>
        </div>
        <div class="command-palette-results"></div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlayEl = overlay;

    const input = overlay.querySelector('.command-palette-input');
    const resultsContainer = overlay.querySelector('.command-palette-results');

    input.focus();

    this.renderResults('', resultsContainer);

    input.addEventListener('input', (e) => {
      const val = e.target.value;
      this.selectedIndex = 0;
      this.handleQueryInput(val, resultsContainer);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.filteredItems.length > 0) {
          this.selectedIndex = (this.selectedIndex + 1) % this.filteredItems.length;
          this.updateSelectionHighlight(resultsContainer);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.filteredItems.length > 0) {
          this.selectedIndex = (this.selectedIndex - 1 + this.filteredItems.length) % this.filteredItems.length;
          this.updateSelectionHighlight(resultsContainer);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const trimmed = input.value.trim();
        if (this.filteredItems[this.selectedIndex]) {
          const item = this.filteredItems[this.selectedIndex];
          this.close();
          item.action();
        } else if (trimmed.length > 0) {
          this.close();
          window.Router.navigate(`/search?q=${encodeURIComponent(trimmed)}`);
        }
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });
  },

  handleQueryInput(rawQuery, container) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const trimmed = rawQuery.trim();
    if (!trimmed) {
      this.searchSeq++;
      this.liveWorkspaceItems = [];
      this.isLoading = false;
      this.errorMessage = null;
      this.lastSearchedQuery = '';
      this.renderResults('', container);
      return;
    }

    if (trimmed === this.lastSearchedQuery && !this.isLoading) {
      this.renderResults(rawQuery, container);
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;
    this.renderResults(rawQuery, container);

    const currentSeq = ++this.searchSeq;
    this.debounceTimer = setTimeout(async () => {
      try {
        const data = await window.API.get(`/search?q=${encodeURIComponent(trimmed)}&limit=15`);
        if (!this.isOpen || currentSeq !== this.searchSeq) return;
        this.lastSearchedQuery = trimmed;
        this.liveWorkspaceItems = this.mapSearchResultsToItems(data.results || {});
        this.isLoading = false;
        this.errorMessage = null;
        this.renderResults(rawQuery, container);
      } catch (err) {
        if (!this.isOpen || currentSeq !== this.searchSeq) return;
        this.liveWorkspaceItems = [];
        this.isLoading = false;
        this.errorMessage = err.message || 'Search request failed';
        this.renderResults(rawQuery, container);
      }
    }, 160);
  },

  mapSearchResultsToItems(results) {
    const items = [];

    // Notes
    (results.notes || []).forEach(n => {
      const noteId = n.entity_id || n.id;
      const snippet = n.search_text || n.content || '';
      items.push({
        id: `ent-note-${noteId}`,
        entityType: 'note',
        entityId: noteId,
        title: n.title,
        subtitle: snippet,
        category: 'Knowledge Notes',
        icon: 'book-open',
        url: `/vault/${noteId}`,
        action: () => window.Router.navigate(`/vault/${noteId}`)
      });
    });

    // Tasks
    (results.tasks || []).forEach(t => {
      const taskId = t.entity_id || t.id;
      const snippet = t.search_text || t.description || '';
      items.push({
        id: `ent-task-${taskId}`,
        entityType: 'task',
        entityId: taskId,
        title: t.title,
        subtitle: snippet,
        category: 'Workflow Tasks',
        icon: 'check-square',
        url: `/workflow?taskId=${taskId}`,
        action: () => window.Router.navigate(`/workflow?taskId=${taskId}`)
      });
    });

    // Projects
    (results.projects || []).forEach(p => {
      const projectId = p.entity_id || p.id;
      const snippet = p.description || p.search_text || '';
      items.push({
        id: `ent-project-${projectId}`,
        entityType: 'project',
        entityId: projectId,
        title: p.title,
        subtitle: snippet,
        category: 'Projects',
        icon: 'folder',
        url: `/projects/${projectId}`,
        action: () => window.Router.navigate(`/projects/${projectId}`)
      });
    });

    // Boards
    (results.boards || []).forEach(b => {
      const boardId = b.entity_id || b.id;
      const projectId = b.project_id || b.primary_project_id;
      const boardUrl = projectId ? `/projects/${projectId}/board` : '/projects';
      items.push({
        id: `ent-board-${boardId}`,
        entityType: 'board',
        entityId: boardId,
        title: b.title,
        subtitle: b.search_text || '',
        category: 'Spatial Boards',
        icon: 'layout-grid',
        url: boardUrl,
        action: () => window.Router.navigate(boardUrl)
      });
    });

    // Research
    (results.research || []).forEach(r => {
      const researchId = r.entity_id || r.id;
      const snippet = r.search_text || r.summary || '';
      items.push({
        id: `ent-research-${researchId}`,
        entityType: 'research',
        entityId: researchId,
        title: r.title,
        subtitle: snippet,
        category: 'Research Documents',
        icon: 'file-search',
        url: '/research',
        action: () => window.Router.navigate('/research')
      });
    });

    return items;
  },

  renderResults(query, container) {
    const trimmed = query.trim();
    const q = trimmed.toLowerCase();

    const matchedCommands = this.commands.filter(cmd => {
      return cmd.title.toLowerCase().includes(q) || cmd.category.toLowerCase().includes(q);
    });

    if (!trimmed) {
      this.filteredItems = [...matchedCommands];
    } else {
      const fullSearchItem = {
        id: 'act-universal-search-query',
        title: `Search workspace for "${trimmed}"`,
        subtitle: 'Open full Universal Search results page',
        category: 'Universal Search',
        icon: 'search',
        shortcut: 'Enter',
        url: `/search?q=${encodeURIComponent(trimmed)}`,
        action: () => window.Router.navigate(`/search?q=${encodeURIComponent(trimmed)}`)
      };
      this.filteredItems = [fullSearchItem, ...this.liveWorkspaceItems, ...matchedCommands];
    }

    if (this.selectedIndex >= this.filteredItems.length) {
      this.selectedIndex = 0;
    }

    let html = '';
    let currentCategory = '';

    this.filteredItems.forEach((cmd, idx) => {
      if (cmd.category !== currentCategory) {
        currentCategory = cmd.category;
        html += `<div class="command-palette-category">${this.escapeHtml(currentCategory)}</div>`;
      }

      const iconHtml = window.FlowdenIcons ? window.FlowdenIcons.getIcon(cmd.icon) : '';
      const isFocused = idx === this.selectedIndex;

      html += `
        <div class="command-palette-item ${isFocused ? 'command-palette-item--focused' : ''}" data-idx="${idx}" ${cmd.url ? `data-url="${this.escapeHtml(cmd.url)}"` : ''} ${cmd.entityType ? `data-entity-type="${this.escapeHtml(cmd.entityType)}"` : ''}>
          <span style="display: flex; color: var(--text-secondary); flex-shrink: 0;">${iconHtml}</span>
          <div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(cmd.title)}</span>
            ${cmd.subtitle ? `<span style="font-size: 11px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(cmd.subtitle)}</span>` : ''}
          </div>
          ${cmd.shortcut ? `<span class="command-palette-shortcut">${this.escapeHtml(cmd.shortcut)}</span>` : ''}
        </div>
      `;

      // Show inline status right below the Universal Search action item when typing
      if (idx === 0 && trimmed) {
        if (this.isLoading) {
          html += `
            <div class="command-palette-status" style="padding: var(--space-2) var(--space-4); font-size: var(--text-xs); color: var(--text-tertiary);">
              Searching workspace entities...
            </div>
          `;
        } else if (this.errorMessage) {
          html += `
            <div class="command-palette-status" style="padding: var(--space-2) var(--space-4); font-size: var(--text-xs); color: var(--danger);">
              Search error: ${this.escapeHtml(this.errorMessage)}
            </div>
          `;
        } else if (this.liveWorkspaceItems.length === 0) {
          html += `
            <div class="command-palette-status" style="padding: var(--space-2) var(--space-4); font-size: var(--text-xs); color: var(--text-tertiary);">
              No matching workspace entities found for "${this.escapeHtml(trimmed)}"
            </div>
          `;
        }
      }
    });

    container.innerHTML = html;

    // Attach click events
    container.querySelectorAll('.command-palette-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-idx'), 10);
        const cmd = this.filteredItems[idx];
        if (cmd) {
          this.close();
          cmd.action();
        }
      });
    });
  },

  updateSelectionHighlight(container) {
    const items = container.querySelectorAll('.command-palette-item');
    items.forEach((item, idx) => {
      if (idx === this.selectedIndex) {
        item.classList.add('command-palette-item--focused');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('command-palette-item--focused');
      }
    });
  },

  close() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.searchSeq++;
    if (this.overlayEl && this.overlayEl.parentElement) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
    this.isOpen = false;
  }
};

if (typeof window !== 'undefined') {
  window.CommandPalette = CommandPalette;
}

