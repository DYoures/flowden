// Flowden Overview Dashboard Page v2.0
// Deep Charcoal, Clean Metrics, Direct Spatial Entry, & Purposeful Actions

async function renderOverviewPage(container) {
  const user = window.Auth.getUser() || { display_name: 'Explorer' };
  const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';

  container.innerHTML = `
    <div style="padding: var(--space-6); max-width: 1200px; margin: 0 auto;">
      <!-- Welcome Header -->
      <div style="margin-bottom: var(--space-6); display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: var(--space-4);">
        <div>
          <h1 style="font-size: var(--text-xl); font-weight: var(--font-semibold); margin-bottom: var(--space-1);">
            Welcome, ${user.display_name}
          </h1>
          <p class="text-secondary text-sm" style="display: flex; align-items: center; gap: 8px;">
            <span>Flowden Workspace</span>
            <span class="text-tertiary">·</span>
            <span style="color: var(--text-secondary); font-size: var(--text-xs); letter-spacing: 0.02em;">Research → Knowledge → Connection → Planning → Execution</span>
          </p>
        </div>
        <div style="display: flex; gap: var(--space-2);">
          <button class="btn btn--secondary btn--md" id="btn-quick-capture">
            ${getIcon('inbox')}
            <span>Quick Capture</span>
          </button>
          <button class="btn btn--primary btn--md" id="btn-quick-new-project">
            ${getIcon('plus')}
            <span>New Project</span>
          </button>
        </div>
      </div>

      <!-- Real Metrics Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-6);">
        <div class="card" style="padding: var(--space-4);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2);">
            <span class="text-xs text-secondary" style="font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em;">Projects</span>
            <span style="color: var(--accent-deep, var(--accent-primary));">${getIcon('folder-kanban')}</span>
          </div>
          <div style="font-size: 26px; font-weight: 700; color: var(--text-primary); font-family: var(--font-heading);" id="metric-projects-count">-</div>
          <div class="text-xs text-tertiary" style="margin-top: 4px;">Active spatial workspaces</div>
        </div>

        <div class="card" style="padding: var(--space-4);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2);">
            <span class="text-xs text-secondary" style="font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em;">Knowledge Vault</span>
            <span style="color: var(--project-violet);">${getIcon('book-open')}</span>
          </div>
          <div style="font-size: 26px; font-weight: 700; color: var(--text-primary); font-family: var(--font-heading);" id="metric-notes-count">-</div>
          <div class="text-xs text-tertiary" style="margin-top: 4px;">Connected markdown notes</div>
        </div>

        <div class="card" style="padding: var(--space-4);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2);">
            <span class="text-xs text-secondary" style="font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em;">Workflow Tasks</span>
            <span style="color: var(--status-success);">${getIcon('check-square')}</span>
          </div>
          <div style="font-size: 26px; font-weight: 700; color: var(--text-primary); font-family: var(--font-heading);" id="metric-tasks-count">-</div>
          <div class="text-xs text-tertiary" style="margin-top: 4px;">Planned & active tasks</div>
        </div>

        <div class="card" style="padding: var(--space-4);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2);">
            <span class="text-xs text-secondary" style="font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em;">Research Center</span>
            <span style="color: var(--project-amber);">${getIcon('file-search')}</span>
          </div>
          <div style="font-size: 26px; font-weight: 700; color: var(--text-primary); font-family: var(--font-heading);" id="metric-research-count">0</div>
          <div class="text-xs text-tertiary" style="margin-top: 4px;">Imported literature & sources</div>
        </div>
      </div>

      <!-- Projects Section -->
      <div style="margin-bottom: var(--space-6);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3);">
          <h2 style="font-size: var(--text-md); font-weight: var(--font-semibold);">Active Projects</h2>
          <a href="#/projects" class="text-xs text-secondary" style="display: flex; align-items: center; gap: 4px;">
            <span>View All</span>
            ${getIcon('chevron-right')}
          </a>
        </div>
        <div id="overview-projects-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-4);">
          <div class="skeleton skeleton--card"></div>
        </div>
      </div>

      <!-- Quick Knowledge Capture Bar -->
      <div class="card" style="padding: var(--space-4); margin-bottom: var(--space-6); background-color: var(--surface-card, var(--bg-tertiary));">
        <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);">
          <span style="color: var(--accent-deep, var(--accent-primary));">${getIcon('inbox')}</span>
          <span style="font-size: var(--text-sm); font-weight: var(--font-semibold);">Quick Capture</span>
          <span class="text-xs text-tertiary">- Capture an idea, question, or reference link directly into your inbox</span>
        </div>
        <div style="display: flex; gap: var(--space-2);">
          <input type="text" id="quick-capture-input" class="input" placeholder="Type a note, question, or link and press Enter..." />
          <button class="btn btn--primary btn--md" id="btn-save-quick-capture">Capture</button>
        </div>
      </div>
    </div>
  `;

  // Attach event handlers
  document.getElementById('btn-quick-new-project').addEventListener('click', () => {
    if (window.openNewProjectModal) window.openNewProjectModal(() => renderOverviewPage(container));
  });

  document.getElementById('btn-quick-capture').addEventListener('click', () => {
    window.Router.navigate('/capture');
  });

  const saveQuickCapture = async () => {
    const input = document.getElementById('quick-capture-input');
    const val = input.value.trim();
    if (!val) return;
    try {
      await window.API.post('/quick-captures', { content: val, capture_type: 'text' });
      window.showToast('Captured to inbox.', 'success');
      input.value = '';
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  };

  document.getElementById('btn-save-quick-capture').addEventListener('click', saveQuickCapture);
  document.getElementById('quick-capture-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveQuickCapture();
  });

  // Load actual project, note, and task counts
  try {
    const [pData, nData, tData] = await Promise.all([
      window.API.get('/projects').catch(() => ({ projects: [] })),
      window.API.get('/notes').catch(() => ({ notes: [] })),
      window.API.get('/tasks').catch(() => ({ tasks: [] }))
    ]);

    const projects = pData.projects || [];
    const notes = nData.notes || [];
    const tasks = tData.tasks || [];

    document.getElementById('metric-projects-count').textContent = projects.length;
    document.getElementById('metric-notes-count').textContent = notes.length;
    document.getElementById('metric-tasks-count').textContent = tasks.length;

    const listEl = document.getElementById('overview-projects-list');
    if (projects.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: var(--space-8);">
          <div class="empty-state-icon">${getIcon('folder-kanban')}</div>
          <div class="empty-state-title">No projects created yet</div>
          <div class="empty-state-description">Flowden connects your research, boards, notes, and tasks in unified spatial projects.</div>
          <button class="btn btn--primary btn--md" id="btn-empty-create-project">
            ${getIcon('plus')}
            <span>Create Your First Project</span>
          </button>
        </div>
      `;
      document.getElementById('btn-empty-create-project').addEventListener('click', () => {
        if (window.openNewProjectModal) window.openNewProjectModal(() => renderOverviewPage(container));
      });
    } else {
      listEl.innerHTML = projects.slice(0, 4).map(p => `
        <div class="card card--interactive project-card" data-project-id="${p.id}" tabindex="0" role="button" aria-label="Open ${p.title} workspace">
          <div class="card-header" style="margin-bottom: var(--space-2);">
            <div class="card-title text-truncate" style="font-size: var(--text-sm); font-weight: 600;">${p.title}</div>
            <span class="badge badge--status-${p.status}">${p.status}</span>
          </div>
          <div class="card-body text-truncate" style="margin-bottom: var(--space-3); min-height: 38px; font-size: var(--text-xs);">
            ${p.description || '<span class="text-tertiary">No description provided</span>'}
          </div>
          <div style="margin-bottom: var(--space-2);">
            <div style="display: flex; justify-content: space-between; font-size: var(--text-xs); margin-bottom: 4px;">
              <span class="text-tertiary">Progress</span>
              <span class="text-secondary" style="font-weight: 500;">${p.progress || 0}%</span>
            </div>
            <div style="height: 3px; background-color: var(--bg-hover); border-radius: var(--radius-full); overflow: hidden;">
              <div style="width: ${p.progress || 0}%; height: 100%; background-color: ${p.color || 'var(--accent-primary)'};"></div>
            </div>
          </div>
          <div class="card-footer" style="display: flex; justify-content: space-between; align-items: center; gap: var(--space-2);">
            <span class="text-xs text-tertiary">${p.counts ? p.counts.tasks : 0} tasks · ${p.counts ? p.counts.notes : 0} notes</span>
            <button type="button" class="btn btn--secondary btn--sm btn-open-project-action" data-project-id="${p.id}" aria-label="Open ${p.title}">
              <span>Open</span>
              ${getIcon('chevron-right')}
            </button>
          </div>
        </div>
      `).join('');

      listEl.querySelectorAll('.project-card').forEach(card => {
        const pId = card.getAttribute('data-project-id');
        if (!pId) return;

        const navigateToProject = () => {
          window.Router.navigate(`/projects/${pId}`);
        };

        card.addEventListener('click', () => {
          navigateToProject();
        });

        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigateToProject();
          }
        });

        const actionBtn = card.querySelector('.btn-open-project-action');
        if (actionBtn) {
          actionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateToProject();
          });
        }
      });
    }
  } catch (err) {
    console.error('Error loading overview data:', err);
  }
}

if (typeof window !== 'undefined') {
  window.renderOverviewPage = renderOverviewPage;
}
