// Flowden Universal Search Results Page

async function renderSearchPage(container, params) {
  const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';
  const hash = window.location.hash;
  const qParam = (hash.split('?q=')[1] || '').split('&')[0];
  const initialQuery = decodeURIComponent(qParam);

  container.innerHTML = `
    <div style="padding: var(--space-6); max-width: 900px; margin: 0 auto;">
      <div style="margin-bottom: var(--space-6);">
        <h1 style="font-size: var(--text-xl); font-weight: var(--font-semibold); margin-bottom: var(--space-2);">Universal Search</h1>
        <div style="display: flex; gap: var(--space-2);">
          <input type="text" id="search-page-input" class="input" placeholder="Search across projects, notes, tasks, and research..." value="${initialQuery}" autofocus />
          <button class="btn btn--primary btn--md" id="btn-execute-search">Search</button>
        </div>
      </div>

      <!-- Results Container -->
      <div id="search-results-output">
        <div class="text-xs text-tertiary">Type a query to search your workspace.</div>
      </div>
    </div>
  `;

  const inputEl = document.getElementById('search-page-input');
  const btnEl = document.getElementById('btn-execute-search');

  async function performSearch(query) {
    const output = document.getElementById('search-results-output');
    if (!query || query.trim().length === 0) {
      output.innerHTML = `<div class="text-xs text-tertiary">Type a query to search your workspace.</div>`;
      return;
    }

    output.innerHTML = `<div class="skeleton skeleton--card"></div>`;

    try {
      const data = await window.API.get(`/search?q=${encodeURIComponent(query)}`);
      const { results, total } = data;

      if (total === 0) {
        output.innerHTML = `
          <div class="empty-state" style="padding: var(--space-12);">
            <div class="empty-state-icon">${getIcon('search')}</div>
            <div class="empty-state-title">No matching results found</div>
            <div class="empty-state-description">We couldn't find any items matching "${query}". Try searching for another concept or keyword.</div>
          </div>
        `;
        return;
      }

      let html = `<div style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-4);">Found ${total} result${total === 1 ? '' : 's'} for <strong>"${query}"</strong></div>`;

      // Projects
      if (results.projects && results.projects.length > 0) {
        html += `<div style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: var(--space-2);">Projects (${results.projects.length})</div>`;
        results.projects.forEach(p => {
          const projectId = p.entity_id || p.id;
          const desc = p.description || p.search_text || '';
          html += `
            <div class="card card--interactive search-item-card" data-url="/projects/${projectId}" tabindex="0" role="button" aria-label="Open project ${p.title}" style="margin-bottom: var(--space-2); padding: var(--space-3) var(--space-4);">
              <div style="display: flex; align-items: center; gap: var(--space-2);">
                <span style="color: ${p.color || 'var(--accent-primary)'};">${getIcon('folder')}</span>
                <span style="font-weight: 500; font-size: var(--text-sm);">${p.title}</span>
              </div>
              ${desc ? `<p class="text-xs text-secondary" style="margin-top: 4px;">${desc}</p>` : ''}
            </div>
          `;
        });
      }

      // Notes
      if (results.notes && results.notes.length > 0) {
        html += `<div style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; color: var(--text-tertiary); margin-top: var(--space-4); margin-bottom: var(--space-2);">Knowledge Notes (${results.notes.length})</div>`;
        results.notes.forEach(n => {
          const noteId = n.entity_id || n.id;
          const snippet = n.search_text || n.content || '';
          html += `
            <div class="card card--interactive search-item-card" data-url="/vault/${noteId}" tabindex="0" role="button" aria-label="Open note ${n.title}" style="margin-bottom: var(--space-2); padding: var(--space-3) var(--space-4);">
              <div style="display: flex; align-items: center; gap: var(--space-2);">
                <span style="color: #38bdf8;">${getIcon('book-open')}</span>
                <span style="font-weight: 500; font-size: var(--text-sm);">${n.title}</span>
              </div>
              ${snippet ? `<p class="text-xs text-secondary" style="margin-top: 4px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${snippet}</p>` : ''}
            </div>
          `;
        });
      }

      // Tasks
      if (results.tasks && results.tasks.length > 0) {
        html += `<div style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; color: var(--text-tertiary); margin-top: var(--space-4); margin-bottom: var(--space-2);">Tasks (${results.tasks.length})</div>`;
        results.tasks.forEach(t => {
          const taskId = t.entity_id || t.id;
          const snippet = t.search_text || t.description || '';
          html += `
            <div class="card card--interactive search-item-card" data-url="/workflow?taskId=${taskId}" tabindex="0" role="button" aria-label="Open workflow tracker" style="margin-bottom: var(--space-2); padding: var(--space-3) var(--space-4);">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: var(--space-2);">
                  <span style="color: #34d399;">${getIcon('check-square')}</span>
                  <span style="font-weight: 500; font-size: var(--text-sm);">${t.title}</span>
                </div>
                <span class="badge badge--status-${t.status || 'planned'}">${t.status || 'planned'}</span>
              </div>
              ${snippet ? `<p class="text-xs text-secondary" style="margin-top: 4px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${snippet}</p>` : ''}
            </div>
          `;
        });
      }

      // Research Documents
      if (results.research && results.research.length > 0) {
        html += `<div style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; color: var(--text-tertiary); margin-top: var(--space-4); margin-bottom: var(--space-2);">Research Documents (${results.research.length})</div>`;
        results.research.forEach(r => {
          const snippet = r.search_text || r.summary || '';
          html += `
            <div class="card card--interactive search-item-card" data-url="/research" tabindex="0" role="button" aria-label="Open research document ${r.title}" style="margin-bottom: var(--space-2); padding: var(--space-3) var(--space-4);">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: var(--space-2);">
                  <span style="color: #a78bfa;">${getIcon('file-search')}</span>
                  <span style="font-weight: 500; font-size: var(--text-sm);">${r.title}</span>
                </div>
                ${r.file_type ? `<span class="badge" style="font-size: 10px; text-transform: uppercase;">${r.file_type}</span>` : ''}
              </div>
              ${snippet ? `<p class="text-xs text-secondary" style="margin-top: 4px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${snippet}</p>` : ''}
            </div>
          `;
        });
      }

      // Boards
      if (results.boards && results.boards.length > 0) {
        html += `<div style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; color: var(--text-tertiary); margin-top: var(--space-4); margin-bottom: var(--space-2);">Spatial Boards (${results.boards.length})</div>`;
        results.boards.forEach(b => {
          const projectId = b.project_id || b.primary_project_id;
          const boardUrl = projectId ? `/projects/${projectId}/board` : '/projects';
          html += `
            <div class="card card--interactive search-item-card" data-url="${boardUrl}" tabindex="0" role="button" aria-label="Open board ${b.title}" style="margin-bottom: var(--space-2); padding: var(--space-3) var(--space-4);">
              <div style="display: flex; align-items: center; gap: var(--space-2);">
                <span style="color: #f59e0b;">${getIcon('layout-grid')}</span>
                <span style="font-weight: 500; font-size: var(--text-sm);">${b.title}</span>
              </div>
            </div>
          `;
        });
      }

      output.innerHTML = html;

      output.querySelectorAll('.search-item-card').forEach(card => {
        const url = card.getAttribute('data-url');
        if (!url) return;
        const nav = () => window.Router.navigate(url);
        card.addEventListener('click', nav);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            nav();
          }
        });
      });
    } catch (err) {
      output.innerHTML = `<div class="form-error">Search failed: ${err.message}</div>`;
    }
  }

  btnEl.addEventListener('click', () => performSearch(inputEl.value.trim()));
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') performSearch(inputEl.value.trim());
  });

  if (initialQuery) {
    performSearch(initialQuery);
  }
}

if (typeof window !== 'undefined') {
  window.renderSearchPage = renderSearchPage;
}

