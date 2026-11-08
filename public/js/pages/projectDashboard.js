// Flowden Per-Project Dashboard & Decision Log Engine

async function renderProjectDashboard(container, params) {
  const projectId = params.id;
  const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';

  container.innerHTML = `
    <div style="padding: var(--space-6); max-width: 1200px; margin: 0 auto;">
      <div class="skeleton skeleton--title" style="margin-bottom: var(--space-4);"></div>
      <div class="skeleton skeleton--card"></div>
    </div>
  `;

  try {
    const data = await window.API.get(`/projects/${projectId}/dashboard`);
    const project = data.project;

    if (!project) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-16);">
          <div class="empty-state-title">Project not found</div>
          <button class="btn btn--secondary btn--md" id="btn-dashboard-return-projects">Return to Projects</button>
        </div>
      `;
      document.getElementById('btn-dashboard-return-projects')?.addEventListener('click', () => {
        window.Router.navigate('/projects');
      });
      return;
    }

    container.innerHTML = `
      <div style="padding: var(--space-6); max-width: 1200px; margin: 0 auto;">
        <!-- Project Header -->
        <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: var(--space-4); margin-bottom: var(--space-6); border-bottom: 1px solid var(--border-primary); padding-bottom: var(--space-6);">
          <div style="display: flex; gap: var(--space-4); align-items: flex-start;">
            <div style="width: 44px; height: 44px; border-radius: var(--radius-md); background-color: ${project.color || 'var(--accent-primary)'}; display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0;">
              ${getIcon('folder')}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: 4px;">
                <h1 style="font-size: var(--text-xl); font-weight: var(--font-semibold);">${project.title}</h1>
                <span class="badge badge--status-${project.status}">${project.status}</span>
              </div>
              <p class="text-secondary text-sm" style="max-width: 650px;">
                ${project.description || 'No description set.'}
              </p>
            </div>
          </div>

          <div style="display: flex; gap: var(--space-2);">
            <button class="btn btn--primary btn--md" id="btn-open-spatial-board">
              ${getIcon('layout-grid')}
              <span>Open Board</span>
            </button>
            <button class="btn btn--secondary btn--md" id="btn-edit-project-props">
              ${getIcon('pencil')}
              <span>Settings</span>
            </button>
          </div>
        </div>

        <!-- Project Tab Switcher -->
        <div class="segmented-control" style="margin-bottom: var(--space-6);" id="project-nav-tabs">
          <button class="segmented-btn segmented-btn--active tab-btn" data-tab="overview">Overview</button>
          <button class="segmented-btn tab-btn" data-tab="decisions">Decision Log</button>
          <button class="segmented-btn tab-btn" data-tab="notes">Related Notes (${project.counts ? project.counts.notes : 0})</button>
          <button class="segmented-btn tab-btn" data-tab="tasks">Related Tasks (${project.counts ? project.counts.tasks : 0})</button>
        </div>

        <!-- Tab Body Container -->
        <div id="project-tab-body"></div>
      </div>
    `;

    document.getElementById('btn-open-spatial-board').addEventListener('click', () => {
      window.Router.navigate(`/projects/${project.id}/board`);
    });

    document.getElementById('btn-edit-project-props').addEventListener('click', () => {
      openEditProjectModal(project, () => renderProjectDashboard(container, params));
    });

    const tabBtns = document.querySelectorAll('#project-nav-tabs .tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('segmented-btn--active'));
        btn.classList.add('segmented-btn--active');
        switchProjectTab(btn.getAttribute('data-tab'));
      });
    });

    function switchProjectTab(tab) {
      const body = document.getElementById('project-tab-body');
      if (tab === 'overview') renderProjectOverviewTab(body, project, getIcon);
      else if (tab === 'decisions') renderProjectDecisionsTab(body, project, getIcon);
      else if (tab === 'notes') renderProjectNotesTab(body, project, getIcon);
      else if (tab === 'tasks') renderProjectTasksTab(body, project, getIcon);
    }

    switchProjectTab('overview');

  } catch (err) {
    container.innerHTML = `<div style="padding: var(--space-6); color: var(--status-error);">Error loading project: ${err.message}</div>`;
  }
}

function renderProjectOverviewTab(body, project, getIcon) {
  body.innerHTML = `
    <!-- Metric Badges Row -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-6);">
      <div class="card" style="padding: var(--space-3) var(--space-4);">
        <div class="text-xs text-secondary" style="margin-bottom: 4px;">Execution Progress</div>
        <div style="font-size: 24px; font-weight: 700; color: ${project.color || 'var(--accent-primary)'};">${project.progress || 0}%</div>
        <div style="height: 4px; background-color: var(--bg-hover); border-radius: var(--radius-full); margin-top: 6px; overflow: hidden;">
          <div style="width: ${project.progress || 0}%; height: 100%; background-color: ${project.color || 'var(--accent-primary)'};"></div>
        </div>
      </div>

      <div class="card" style="padding: var(--space-3) var(--space-4);">
        <div class="text-xs text-secondary" style="margin-bottom: 4px;">Tasks Completed</div>
        <div style="font-size: 24px; font-weight: 700; color: var(--text-primary);">${project.counts.tasks_done} / ${project.counts.tasks}</div>
        <div class="text-xs text-tertiary" style="margin-top: 4px;">delivered</div>
      </div>

      <div class="card" style="padding: var(--space-3) var(--space-4);">
        <div class="text-xs text-secondary" style="margin-bottom: 4px;">Vault Notes</div>
        <div style="font-size: 24px; font-weight: 700; color: var(--text-primary);">${project.counts.notes}</div>
        <div class="text-xs text-tertiary" style="margin-top: 4px;">referenced</div>
      </div>

      <div class="card" style="padding: var(--space-3) var(--space-4);">
        <div class="text-xs text-secondary" style="margin-bottom: 4px;">Research Documents</div>
        <div style="font-size: 24px; font-weight: 700; color: var(--text-primary);">${project.counts.research}</div>
        <div class="text-xs text-tertiary" style="margin-top: 4px;">sources mapped</div>
      </div>
    </div>

    <!-- Spatial Workspaces Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--space-4);">
      <div class="card card--interactive" id="card-dash-open-board" tabindex="0" role="button" aria-label="Open Spatial Workspace Board">
        <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2);">
          <span style="color: ${project.color || 'var(--accent-primary)'};">${getIcon('layout-grid')}</span>
          <h3 class="card-title">Open Spatial Workspace Board</h3>
        </div>
        <p class="card-body">2D pan/zoom spatial canvas for modular cards, clusters, and cubic bezier relationship connections.</p>
        <div class="card-footer" style="color: var(--accent-deep, var(--accent-primary)); font-weight: 500;">
          Open Canvas ${getIcon('chevron-right')}
        </div>
      </div>

      <div class="card card--interactive" id="card-dash-open-graph" tabindex="0" role="button" aria-label="Project Knowledge Graph">
        <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2);">
          <span style="color: var(--accent-deep, var(--accent-primary));">${getIcon('share-2')}</span>
          <h3 class="card-title">Project Knowledge Graph</h3>
        </div>
        <p class="card-body">Visual graph nodes highlighting notes, tasks, and research interconnected for this project.</p>
        <div class="card-footer" style="color: var(--accent-deep, var(--accent-primary)); font-weight: 500;">
          Explore Graph ${getIcon('chevron-right')}
        </div>
      </div>
    </div>
  `;

  const boardCard = body.querySelector('#card-dash-open-board');
  if (boardCard) {
    boardCard.addEventListener('click', () => window.Router.navigate(`/projects/${project.id}/board`));
    boardCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.Router.navigate(`/projects/${project.id}/board`);
      }
    });
  }

  const graphCard = body.querySelector('#card-dash-open-graph');
  if (graphCard) {
    graphCard.addEventListener('click', () => window.Router.navigate('/graph'));
    graphCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.Router.navigate('/graph');
      }
    });
  }
}

async function renderProjectDecisionsTab(body, project, getIcon) {
  body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4);">
      <div>
        <h2 style="font-size: var(--text-md); font-weight: 600;">Decision Log (ADR)</h2>
        <p class="text-secondary text-xs">Record architectural and design decisions, rationale, and outcomes.</p>
      </div>
      <button class="btn btn--primary btn--sm" id="btn-add-decision">
        ${getIcon('plus')}
        <span>Log Decision</span>
      </button>
    </div>

    <div id="decisions-list-container">
      <div class="skeleton skeleton--card"></div>
    </div>
  `;

  document.getElementById('btn-add-decision').addEventListener('click', () => {
    openAddDecisionModal(project.id, () => renderProjectDecisionsTab(body, project, getIcon));
  });

  try {
    const res = await window.API.get(`/decision-logs/project/${project.id}`);
    const list = res.decision_logs || [];
    const container = document.getElementById('decisions-list-container');

    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: var(--space-8);">
          <div class="empty-state-title">No decisions logged yet</div>
          <div class="empty-state-description">Log technical decisions, architectural trade-offs, and strategic choices to keep team context intact.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(d => `
      <div class="card" style="margin-bottom: var(--space-3); padding: var(--space-4);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2);">
          <span style="font-size: var(--text-md); font-weight: 600; color: var(--text-primary);">${d.title}</span>
          <span class="text-xs text-tertiary">${d.decided_at || ''}</span>
        </div>
        ${d.context ? `<div class="text-xs text-secondary" style="margin-bottom: 6px;"><strong>Context:</strong> ${d.context}</div>` : ''}
        <div class="text-sm text-primary" style="margin-bottom: 6px; padding: 6px 10px; background: var(--bg-secondary); border-radius: var(--radius-sm); border-left: 3px solid var(--accent-primary);">
          <strong>Decision:</strong> ${d.decision}
        </div>
        ${d.outcome ? `<div class="text-xs text-tertiary"><strong>Outcome:</strong> ${d.outcome}</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    document.getElementById('decisions-list-container').innerHTML = `<div class="form-error">${err.message}</div>`;
  }
}

function openAddDecisionModal(projectId, onSuccess) {
  window.Modal.open({
    title: 'Log Project Decision',
    size: 'md',
    content: `
      <form id="form-log-decision">
        <div class="form-group">
          <label class="form-label">Decision Title</label>
          <input type="text" id="decision-title" class="input" placeholder="e.g. Adopt MySQL Relational Store with InnoDB" required autofocus />
        </div>
        <div class="form-group">
          <label class="form-label">Context & Problem Statement</label>
          <textarea id="decision-context" class="textarea" placeholder="Why was this decision needed?"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Decision Made</label>
          <textarea id="decision-text" class="textarea" placeholder="What is the chosen strategy or architecture?" required></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Expected Outcome / Consequences</label>
          <textarea id="decision-outcome" class="textarea" placeholder="Trade-offs, positive and negative implications..."></textarea>
        </div>
      </form>
    `,
    buttons: [
      { text: 'Cancel', variant: 'ghost', onClick: (m, inst) => inst.close() },
      {
        text: 'Save Decision',
        variant: 'primary',
        onClick: async (m, inst) => {
          const title = document.getElementById('decision-title').value.trim();
          const context = document.getElementById('decision-context').value.trim();
          const decision = document.getElementById('decision-text').value.trim();
          const outcome = document.getElementById('decision-outcome').value.trim();

          if (!title || !decision) return;

          try {
            await window.API.post('/decision-logs', { project_id: projectId, title, context, decision, outcome });
            inst.close();
            window.showToast('Decision logged successfully.', 'success');
            if (onSuccess) onSuccess();
          } catch (err) {
            window.showToast(err.message, 'error');
          }
        }
      }
    ]
  });
}

async function renderProjectNotesTab(body, project, getIcon) {
  body.innerHTML = `<div class="skeleton skeleton--card"></div>`;
  try {
    const res = await window.API.get(`/notes?project_id=${project.id}`);
    const notes = res.notes || [];

    if (notes.length === 0) {
      body.innerHTML = `
        <div class="empty-state" style="padding: var(--space-8);">
          <div class="empty-state-title">No notes associated with this project</div>
          <button class="btn btn--primary btn--md" id="btn-project-empty-vault">Open Knowledge Vault</button>
        </div>
      `;
      body.querySelector('#btn-project-empty-vault')?.addEventListener('click', () => window.Router.navigate('/vault'));
      return;
    }

    body.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-4);">
        ${notes.map(n => `
          <div class="card card--interactive note-card-item" data-note-id="${n.id}" tabindex="0" role="button" aria-label="Open note ${n.title}">
            <div style="font-weight: 600; font-size: var(--text-sm); margin-bottom: 4px;">${n.title}</div>
            <p class="text-xs text-secondary text-truncate" style="margin-bottom: 8px;">${n.content || ''}</p>
            <div class="text-xs text-tertiary">${n.word_count || 0} words</div>
          </div>
        `).join('')}
      </div>
    `;

    body.querySelectorAll('.note-card-item').forEach(card => {
      const nid = card.getAttribute('data-note-id');
      const nav = () => window.Router.navigate(`/vault/${nid}`);
      card.addEventListener('click', nav);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          nav();
        }
      });
    });
  } catch (err) {
    body.innerHTML = `<div class="form-error">${err.message}</div>`;
  }
}

async function renderProjectTasksTab(body, project, getIcon) {
  body.innerHTML = `<div class="skeleton skeleton--card"></div>`;
  try {
    const res = await window.API.get(`/tasks?project_id=${project.id}`);
    const tasks = res.tasks || [];

    if (tasks.length === 0) {
      body.innerHTML = `
        <div class="empty-state" style="padding: var(--space-8);">
          <div class="empty-state-title">No tasks logged for this project</div>
          <button class="btn btn--primary btn--md" id="btn-project-empty-workflow">Open Workflow Tracker</button>
        </div>
      `;
      body.querySelector('#btn-project-empty-workflow')?.addEventListener('click', () => window.Router.navigate('/workflow'));
      return;
    }

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-2);">
        ${tasks.map(t => `
          <div class="card" style="padding: var(--space-3) var(--space-4); display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge badge--status-${t.status}">${t.status}</span>
              <span style="font-size: var(--text-sm); font-weight: 500;">${t.title}</span>
            </div>
            <span class="tag tag--violet">${t.priority}</span>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="form-error">${err.message}</div>`;
  }
}

function openEditProjectModal(project, onSave) {
  window.Modal.open({
    title: 'Project Settings',
    size: 'md',
    content: `
      <form id="form-edit-project">
        <div class="form-group">
          <label class="form-label">Project Title</label>
          <input type="text" id="edit-project-title" class="input" value="${project.title}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea id="edit-project-desc" class="textarea">${project.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="edit-project-status" class="select">
            <option value="active" ${project.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="archived" ${project.status === 'archived' ? 'selected' : ''}>Archived</option>
          </select>
        </div>
      </form>
    `,
    buttons: [
      {
        text: 'Delete Project',
        variant: 'danger',
        onClick: () => {
          window.Modal.confirm({
            title: 'Delete Project',
            message: `Permanently delete "${project.title}" and its workspace board?`,
            confirmText: 'Delete Project',
            danger: true,
            onConfirm: async () => {
              try {
                await window.API.delete(`/projects/${project.id}`);
                window.showToast('Project deleted.', 'info');
                window.Router.navigate('/projects');
              } catch (err) {
                window.showToast(err.message, 'error');
              }
            }
          });
        }
      },
      {
        text: 'Save Changes',
        variant: 'primary',
        onClick: async (modal, mInstance) => {
          const title = document.getElementById('edit-project-title').value.trim();
          const description = document.getElementById('edit-project-desc').value.trim();
          const status = document.getElementById('edit-project-status').value;

          try {
            await window.API.put(`/projects/${project.id}`, { title, description, status });
            mInstance.close();
            window.showToast('Project updated.', 'success');
            if (onSave) onSave();
          } catch (err) {
            window.showToast(err.message, 'error');
          }
        }
      }
    ]
  });
}

if (typeof window !== 'undefined') {
  window.renderProjectDashboard = renderProjectDashboard;
}
