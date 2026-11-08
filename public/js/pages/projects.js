// Flowden Projects Management Page & System Templates Integration

async function renderProjectsPage(container) {
  const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';

  container.innerHTML = `
    <div style="padding: var(--space-6); max-width: 1200px; margin: 0 auto;">
      <!-- Page Header -->
      <div style="margin-bottom: var(--space-6); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3);">
        <div>
          <h1 style="font-size: var(--text-xl); font-weight: var(--font-semibold);">Projects</h1>
          <p class="text-secondary text-sm">Spatial workspace hubs connecting research, notes, boards, and execution.</p>
        </div>
        <div style="display: flex; gap: var(--space-2);">
          <button class="btn btn--secondary btn--md" id="btn-browse-templates">
            ${getIcon('layout-grid')}
            <span>Templates</span>
          </button>
          <button class="btn btn--primary btn--md" id="btn-create-project">
            ${getIcon('plus')}
            <span>New Project</span>
          </button>
        </div>
      </div>

      <!-- Filter Bar -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); border-bottom: 1px solid var(--border-primary); padding-bottom: var(--space-3);">
        <div class="segmented-control" id="project-status-filters">
          <button class="segmented-btn btn--active" data-status="all">All Projects</button>
          <button class="segmented-btn" data-status="active">Active</button>
          <button class="segmented-btn" data-status="archived">Archived</button>
        </div>
        <span class="text-xs text-tertiary" id="projects-total-count">Loading...</span>
      </div>

      <!-- Projects Grid -->
      <div id="projects-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--space-4);">
        <div class="skeleton skeleton--card"></div>
        <div class="skeleton skeleton--card"></div>
      </div>
    </div>
  `;

  document.getElementById('btn-create-project').addEventListener('click', () => {
    openNewProjectModal(() => renderProjectsPage(container));
  });

  document.getElementById('btn-browse-templates').addEventListener('click', () => {
    openTemplatesModal(() => renderProjectsPage(container));
  });

  let currentStatus = 'all';

  const filterButtons = document.querySelectorAll('#project-status-filters .segmented-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('btn--active'));
      btn.classList.add('btn--active');
      currentStatus = btn.getAttribute('data-status');
      loadProjects();
    });
  });

  async function loadProjects() {
    const grid = document.getElementById('projects-grid');
    try {
      const url = currentStatus === 'all' ? '/projects' : `/projects?status=${currentStatus}`;
      const data = await window.API.get(url);
      const projects = data.projects || [];

      document.getElementById('projects-total-count').textContent = `${projects.length} project${projects.length === 1 ? '' : 's'}`;

      if (projects.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1; padding: var(--space-12);">
            <div class="empty-state-icon">${getIcon('folder-kanban')}</div>
            <div class="empty-state-title">No ${currentStatus !== 'all' ? currentStatus : ''} projects found</div>
            <div class="empty-state-description">Start a project from scratch or pick a system template to organize your spatial knowledge.</div>
            <div style="display: flex; gap: var(--space-2); margin-top: var(--space-3);">
              <button class="btn btn--primary btn--md" id="btn-grid-create-project">
                ${getIcon('plus')}
                <span>Create Project</span>
              </button>
              <button class="btn btn--secondary btn--md" id="btn-grid-browse-templates">
                ${getIcon('layout-grid')}
                <span>Use Template</span>
              </button>
            </div>
          </div>
        `;
        document.getElementById('btn-grid-create-project').addEventListener('click', () => {
          openNewProjectModal(() => renderProjectsPage(container));
        });
        document.getElementById('btn-grid-browse-templates').addEventListener('click', () => {
          openTemplatesModal(() => renderProjectsPage(container));
        });
        return;
      }

      grid.innerHTML = projects.map(p => `
        <div class="card card--interactive project-card" data-project-id="${p.id}" tabindex="0" role="button" aria-label="Open ${p.title} workspace" style="position: relative;">
          <div style="height: 3px; background-color: ${p.color || 'var(--accent-primary)'}; border-radius: var(--radius-sm); margin-bottom: var(--space-3);"></div>
          
          <div class="card-header" style="margin-bottom: var(--space-2);">
            <div style="display: flex; align-items: center; gap: var(--space-2); overflow: hidden;">
              <span style="color: ${p.color || 'var(--accent-primary)'}; display: flex;">${getIcon('folder')}</span>
              <h3 class="card-title text-truncate">${p.title}</h3>
            </div>
            <span class="badge badge--status-${p.status}">${p.status}</span>
          </div>

          <p class="card-body" style="min-height: 44px; margin-bottom: var(--space-3);">
            ${p.description || '<span class="text-tertiary">No description provided</span>'}
          </p>

          <div style="margin-bottom: var(--space-3);">
            <div style="display: flex; justify-content: space-between; font-size: var(--text-xs); margin-bottom: 4px;">
              <span class="text-tertiary">Task Execution</span>
              <span class="text-secondary" style="font-weight: 500;">${p.progress || 0}%</span>
            </div>
            <div style="height: 4px; background-color: var(--bg-hover); border-radius: var(--radius-full); overflow: hidden;">
              <div style="width: ${p.progress || 0}%; height: 100%; background-color: ${p.color || 'var(--accent-primary)'};"></div>
            </div>
          </div>

          <div class="card-footer" style="display: flex; justify-content: space-between; align-items: center; gap: var(--space-2);">
            <span class="text-xs text-tertiary">
              ${p.counts ? p.counts.tasks : 0} tasks · ${p.counts ? p.counts.notes : 0} notes · ${p.counts ? p.counts.research : 0} research
            </span>
            <button type="button" class="btn btn--secondary btn--sm btn-open-project-action" data-project-id="${p.id}" aria-label="Open ${p.title} workspace">
              <span>Open Workspace</span>
              ${getIcon('chevron-right')}
            </button>
          </div>
        </div>
      `).join('');

      // Attach event listeners to project cards and open workspace action buttons
      grid.querySelectorAll('.project-card').forEach(card => {
        const pId = card.getAttribute('data-project-id');
        if (!pId) return;

        const navigateToWorkspace = () => {
          window.Router.navigate(`/projects/${pId}`);
        };

        card.addEventListener('click', () => {
          navigateToWorkspace();
        });

        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigateToWorkspace();
          }
        });

        const actionBtn = card.querySelector('.btn-open-project-action');
        if (actionBtn) {
          actionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateToWorkspace();
          });
        }
      });
    } catch (err) {
      grid.innerHTML = `<div class="form-error" style="grid-column: 1 / -1;">Failed to load projects: ${err.message}</div>`;
    }
  }

  loadProjects();
}

function openTemplatesModal(onSuccess) {
  window.Modal.open({
    title: 'Project Templates',
    size: 'lg',
    content: `
      <div style="padding: 4px 0;">
        <p class="text-secondary text-sm" style="margin-bottom: var(--space-4);">
          Select an architectural blueprint to instantiate a project with pre-structured folders, spatial boards, and starter notes.
        </p>
        <div id="templates-list-modal" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4);">
          <div class="skeleton skeleton--card"></div>
        </div>
      </div>
    `,
    onOpen: async (modal) => {
      try {
        const res = await window.API.get('/templates');
        const list = res.templates || [];
        const container = modal.querySelector('#templates-list-modal');

        container.innerHTML = list.map(t => `
          <div class="card card--interactive" style="border-left: 3px solid ${t.color || 'var(--accent-primary)'}; padding: var(--space-4);">
            <div style="font-weight: 600; font-size: var(--text-md); margin-bottom: 6px;">${t.name}</div>
            <p class="text-xs text-secondary" style="margin-bottom: var(--space-4); line-height: 1.4;">${t.description}</p>
            <button class="btn btn--primary btn--sm btn-apply-template" data-id="${t.id}" style="width: 100%;">
              Use Template
            </button>
          </div>
        `).join('');

        container.querySelectorAll('.btn-apply-template').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            btn.disabled = true;
            btn.textContent = 'Instantiating...';
            try {
              const applied = await window.API.post(`/templates/${id}/apply`, {});
              window.Modal.close();
              window.showToast('Project created from template.', 'success');
              if (onSuccess) onSuccess();
              window.Router.navigate(`/projects/${applied.project.id}`);
            } catch (err) {
              window.showToast(err.message, 'error');
              btn.disabled = false;
              btn.textContent = 'Use Template';
            }
          });
        });
      } catch (err) {
        modal.querySelector('#templates-list-modal').innerHTML = `<div class="form-error">${err.message}</div>`;
      }
    }
  });
}

function openNewProjectModal(onSuccess = null) {
  const colors = [
    { name: 'Steel Blue', value: '#6B8AFD' },
    { name: 'Violet', value: '#9B8AE0' },
    { name: 'Cyan', value: '#5BA3D9' },
    { name: 'Teal', value: '#4DB8A0' },
    { name: 'Green', value: '#5DBA6E' },
    { name: 'Amber', value: '#E0A040' },
    { name: 'Orange', value: '#D97B4A' },
    { name: 'Muted Gray', value: '#7A8694' }
  ];

  let selectedColor = '#6B8AFD';

  const contentHtml = `
    <form id="form-new-project" onsubmit="event.preventDefault(); document.getElementById('btn-submit-create-project')?.click();">
      <div class="form-group">
        <label class="form-label" for="project-title-input">Project Title *</label>
        <input type="text" id="project-title-input" class="input" placeholder="e.g. Cognitive Systems Architecture" required autofocus />
      </div>

      <div class="form-group">
        <label class="form-label" for="project-desc-input">Description / Scope <span class="text-tertiary">(Optional)</span></label>
        <textarea id="project-desc-input" class="textarea" placeholder="Brief summary of project intent, goals, and domain..."></textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Theme Accent Color</label>
        <div style="display: flex; gap: var(--space-2); margin-top: var(--space-1);" id="color-palette-options">
          ${colors.map((c, i) => `
            <div class="color-swatch ${i === 0 ? 'swatch--active' : ''}" 
                 data-color="${c.value}" 
                 style="width: 26px; height: 26px; border-radius: var(--radius-sm); background-color: ${c.value}; cursor: pointer; border: 2px solid ${i === 0 ? 'var(--text-primary)' : 'transparent'}; transition: border-color 150ms;" 
                 title="${c.name}">
            </div>
          `).join('')}
        </div>
      </div>
      <div id="new-project-error" class="form-error" style="display: none; margin-top: 8px;"></div>
    </form>
  `;

  window.Modal.open({
    title: 'Create New Project',
    size: 'md',
    content: contentHtml,
    buttons: [
      {
        id: 'btn-cancel-project',
        text: 'Cancel',
        variant: 'secondary',
        onClick: (modal, mInstance) => {
          mInstance.close();
        }
      },
      {
        id: 'btn-submit-create-project',
        text: 'Create Project',
        variant: 'primary',
        onClick: async (modal, mInstance) => {
          const titleInput = document.getElementById('project-title-input');
          const descInput = document.getElementById('project-desc-input');
          const errEl = document.getElementById('new-project-error');
          const submitBtn = document.getElementById('btn-submit-create-project');

          const title = titleInput ? titleInput.value.trim() : '';
          const description = descInput ? descInput.value.trim() : '';

          if (!title) {
            if (errEl) {
              errEl.textContent = 'Please enter a project title.';
              errEl.style.display = 'block';
            }
            if (titleInput) {
              titleInput.focus();
              titleInput.style.borderColor = 'var(--status-error)';
            }
            return;
          }

          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating...';
          }

          try {
            const result = await window.API.post('/projects', {
              title,
              description,
              color: selectedColor
            });

            mInstance.close();
            window.showToast(`Project "${result.project.title}" created successfully.`, 'success');
            if (onSuccess) {
              onSuccess(result.project);
            } else {
              window.Router.navigate(`/projects/${result.project.id}`);
            }
          } catch (err) {
            if (errEl) {
              errEl.textContent = err.message || 'Failed to create project.';
              errEl.style.display = 'block';
            }
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Create Project';
            }
          }
        }
      }
    ],
    onOpen: (modal) => {
      const titleInput = modal.querySelector('#project-title-input');
      const errEl = modal.querySelector('#new-project-error');

      if (titleInput) {
        titleInput.addEventListener('input', () => {
          if (titleInput.value.trim()) {
            titleInput.style.borderColor = '';
            if (errEl) errEl.style.display = 'none';
          }
        });
      }

      const swatches = modal.querySelectorAll('.color-swatch');
      swatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
          swatches.forEach(s => s.style.borderColor = 'transparent');
          swatch.style.borderColor = 'var(--text-primary)';
          selectedColor = swatch.getAttribute('data-color');
        });
      });
    }
  });
}

if (typeof window !== 'undefined') {
  window.renderProjectsPage = renderProjectsPage;
  window.openNewProjectModal = openNewProjectModal;
}
