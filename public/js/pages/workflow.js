// Flowden Workflow Tracker Engine v3.0 - Segment 4
// Multi-View Execution: Interactive Kanban Drag & Drop, Sortable List View, Monthly Calendar View

async function renderWorkflowPage(container, params = {}) {
  const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';

  // Current state
  let currentTasks = [];
  let currentProjects = [];
  let currentView = localStorage.getItem('flowden_workflow_view') || 'board';
  let searchQuery = '';
  let filterStatus = 'all';
  let filterPriority = 'all';
  let filterProject = 'all';
  let sortField = 'due_date';
  let sortAsc = true;
  let selectedTaskIds = new Set();
  
  // Calendar state
  const today = new Date();
  let calYear = today.getFullYear();
  let calMonth = today.getMonth(); // 0-indexed

  container.innerHTML = `
    <div style="padding: var(--space-6); max-width: 1300px; margin: 0 auto; height: 100%; display: flex; flex-direction: column;">
      <!-- Workflow Header -->
      <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: var(--space-4); margin-bottom: var(--space-4); flex-shrink: 0;">
        <div>
          <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1);">
            <h1 style="font-size: var(--text-xl); font-weight: var(--font-semibold);">Workflow Tracker</h1>
            <span class="badge badge--primary" style="font-size: 11px;">Segment 4 Active</span>
          </div>
          <p class="text-secondary text-sm">Convert research and vault knowledge into prioritized, trackable deliverables.</p>
        </div>

        <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
          <!-- View Switcher -->
          <div class="segmented-control" id="workflow-view-control">
            <button class="segmented-btn ${currentView === 'board' ? 'segmented-btn--active' : ''}" data-view="board">
              ${getIcon('layout-grid')} Board
            </button>
            <button class="segmented-btn ${currentView === 'list' ? 'segmented-btn--active' : ''}" data-view="list">
              ${getIcon('list')} List
            </button>
            <button class="segmented-btn ${currentView === 'calendar' ? 'segmented-btn--active' : ''}" data-view="calendar">
              ${getIcon('calendar')} Calendar
            </button>
          </div>

          <button class="btn btn--primary btn--md btn-workflow-create-task" id="btn-create-task">
            ${getIcon('plus')}
            <span>New Task</span>
          </button>
        </div>
      </div>

      <!-- Execution Progress Summary Banner -->
      <div class="card" style="padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4); background-color: var(--bg-secondary); border: 1px solid var(--border-primary); flex-shrink: 0;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3);">
          <div style="display: flex; align-items: center; gap: var(--space-4);">
            <div>
              <span class="text-xs text-secondary" style="display: block; margin-bottom: 2px;">Deliverable Completion</span>
              <span id="progress-summary-text" style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);">0 of 0 tasks completed (0%)</span>
            </div>
            <div style="width: 140px; height: 6px; background: var(--bg-tertiary); border-radius: var(--radius-full); overflow: hidden;">
              <div id="progress-bar-fill" style="width: 0%; height: 100%; background: var(--status-success); transition: width 300ms ease;"></div>
            </div>
          </div>

          <!-- Quick Filters Toolbar -->
          <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
            <input type="text" id="task-filter-search" class="input" placeholder="Search tasks..." style="height: 30px; width: 170px; font-size: var(--text-xs);" />
            
            <select id="task-filter-project" class="select" style="height: 30px; font-size: var(--text-xs); padding: 0 var(--space-2);">
              <option value="all">All Projects</option>
            </select>

            <select id="task-filter-priority" class="select" style="height: 30px; font-size: var(--text-xs); padding: 0 var(--space-2);">
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Bulk Actions Bar (Hidden unless items selected) -->
      <div id="workflow-bulk-bar" class="card" style="display: none; padding: var(--space-2) var(--space-4); margin-bottom: var(--space-3); background-color: var(--bg-elevated); border: 1px solid var(--accent-primary); align-items: center; justify-content: space-between;">
        <span class="text-xs" id="bulk-selected-count" style="font-weight: 600; color: var(--accent-deep, var(--accent-primary));">0 selected</span>
        <div style="display: flex; gap: var(--space-2);">
          <button class="btn btn--secondary btn--sm" id="btn-bulk-done">Mark as Done</button>
          <button class="btn btn--danger btn--sm" id="btn-bulk-delete">Delete Selected</button>
          <button class="btn btn--ghost btn--sm" id="btn-bulk-cancel">Clear Selection</button>
        </div>
      </div>

      <!-- Main Dynamic View Container -->
      <div id="workflow-view-container" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 480px;">
        <!-- Injected via renderCurrentView() -->
      </div>
    </div>
  `;

  // Fetch projects for project filter & modal dropdown
  async function loadProjects() {
    try {
      const res = await window.API.get('/projects');
      currentProjects = res.projects || [];
      const sel = document.getElementById('task-filter-project');
      if (sel) {
        sel.innerHTML = '<option value="all">All Projects</option>' + 
          currentProjects.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
      }
    } catch (e) {
      console.error('[Workflow] Failed loading projects:', e);
    }
  }

  // Fetch tasks
  async function loadTasks() {
    try {
      const res = await window.API.get('/tasks');
      currentTasks = res.tasks || [];
      updateProgressSummary();
      renderCurrentView();
    } catch (e) {
      console.error('[Workflow] Failed loading tasks:', e);
      window.showToast('Could not load workflow tasks', 'error');
    }
  }

  // Update progress bar
  function updateProgressSummary() {
    const total = currentTasks.length;
    const done = currentTasks.filter(t => t.status === 'done').length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);

    const txt = document.getElementById('progress-summary-text');
    const fill = document.getElementById('progress-bar-fill');
    if (txt) txt.textContent = `${done} of ${total} tasks completed (${pct}%)`;
    if (fill) fill.style.width = `${pct}%`;
  }

  // Filter tasks based on search and dropdowns
  function getFilteredTasks() {
    return currentTasks.filter(t => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
      if (filterProject !== 'all' && String(t.project_id) !== String(filterProject)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const mTitle = t.title && t.title.toLowerCase().includes(q);
        const mDesc = t.description && t.description.toLowerCase().includes(q);
        if (!mTitle && !mDesc) return false;
      }
      return true;
    });
  }

  // Render current selected view
  function renderCurrentView() {
    const containerEl = document.getElementById('workflow-view-container');
    if (!containerEl) return;

    if (currentView === 'board') {
      renderBoardView(containerEl);
    } else if (currentView === 'list') {
      renderListView(containerEl);
    } else if (currentView === 'calendar') {
      renderCalendarView(containerEl);
    }
  }

  /* --------------------------------------------------------------------------
     1. KANBAN BOARD VIEW with HTML5 Drag & Drop
     -------------------------------------------------------------------------- */
  function renderBoardView(containerEl) {
    const filtered = getFilteredTasks();
    const planned = filtered.filter(t => t.status === 'planned');
    const inProgress = filtered.filter(t => t.status === 'in_progress');
    const done = filtered.filter(t => t.status === 'done');

    containerEl.innerHTML = `
      <div style="flex: 1; display: grid; grid-template-columns: repeat(3, minmax(280px, 1fr)); gap: var(--space-4); overflow-x: auto; overflow-y: hidden;">
        <!-- Planned Column -->
        <div class="kanban-column" data-status="planned" id="kanban-col-planned">
          <div style="padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <span style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);">Planned</span>
            </div>
            <span class="badge" style="background-color: var(--bg-tertiary);">${planned.length}</span>
          </div>
          <div class="kanban-task-list" style="flex: 1; padding: var(--space-3); overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-2);" data-status="planned">
            ${planned.map(t => renderKanbanCardHtml(t)).join('')}
            ${planned.length === 0 ? `<div class="empty-state" style="padding: var(--space-6) 0; font-size: var(--text-xs); color: var(--text-tertiary);">No planned tasks</div>` : ''}
          </div>
          <div style="padding: var(--space-2) var(--space-3); border-top: 1px solid var(--border-primary);">
            <button class="btn btn--ghost btn--sm btn-quick-add" data-status="planned" style="width: 100%; justify-content: flex-start;">
              ${getIcon('plus')} Add Task
            </button>
          </div>
        </div>

        <!-- In Progress Column -->
        <div class="kanban-column" data-status="in_progress" id="kanban-col-in-progress">
          <div style="padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <span style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);">In Progress</span>
            </div>
            <span class="badge" style="background-color: var(--bg-tertiary);">${inProgress.length}</span>
          </div>
          <div class="kanban-task-list" style="flex: 1; padding: var(--space-3); overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-2);" data-status="in_progress">
            ${inProgress.map(t => renderKanbanCardHtml(t)).join('')}
            ${inProgress.length === 0 ? `<div class="empty-state" style="padding: var(--space-6) 0; font-size: var(--text-xs); color: var(--text-tertiary);">No active tasks</div>` : ''}
          </div>
          <div style="padding: var(--space-2) var(--space-3); border-top: 1px solid var(--border-primary);">
            <button class="btn btn--ghost btn--sm btn-quick-add" data-status="in_progress" style="width: 100%; justify-content: flex-start;">
              ${getIcon('plus')} Add Task
            </button>
          </div>
        </div>

        <!-- Done Column -->
        <div class="kanban-column" data-status="done" id="kanban-col-done">
          <div style="padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: var(--space-2);">
              <span style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);">Done</span>
            </div>
            <span class="badge" style="background-color: var(--bg-tertiary);">${done.length}</span>
          </div>
          <div class="kanban-task-list" style="flex: 1; padding: var(--space-3); overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-2);" data-status="done">
            ${done.map(t => renderKanbanCardHtml(t)).join('')}
            ${done.length === 0 ? `<div class="empty-state" style="padding: var(--space-6) 0; font-size: var(--text-xs); color: var(--text-tertiary);">No completed tasks</div>` : ''}
          </div>
          <div style="padding: var(--space-2) var(--space-3); border-top: 1px solid var(--border-primary);">
            <button class="btn btn--ghost btn--sm btn-quick-add" data-status="done" style="width: 100%; justify-content: flex-start;">
              ${getIcon('plus')} Add Task
            </button>
          </div>
        </div>
      </div>
    `;

    setupKanbanDragAndDrop();
    attachCardClickHandlers();
  }

  function renderKanbanCardHtml(t) {
    const proj = currentProjects.find(p => p.id === t.project_id);
    const projName = proj ? proj.title : null;
    const dueDateFormatted = t.due_date ? new Date(t.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;

    return `
      <div class="kanban-card" draggable="true" data-task-id="${t.id}" id="task-card-${t.id}">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2); margin-bottom: 4px;">
          <div style="font-size: var(--text-sm); font-weight: 500; color: var(--text-primary); line-height: 1.3;">${t.title}</div>
          <span class="badge-priority badge-priority--${t.priority || 'medium'}">${t.priority || 'med'}</span>
        </div>
        ${t.description ? `<div class="text-xs text-secondary text-truncate" style="margin-bottom: 8px;">${window.SmartLinkHandler ? window.SmartLinkHandler.renderMarkdownLinks(t.description) : t.description}</div>` : ''}
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--text-tertiary); margin-top: var(--space-2);">
          ${projName ? `<span class="badge" style="background: var(--bg-elevated); font-size: 10px; padding: 1px 5px;">${projName}</span>` : '<span></span>'}
          ${dueDateFormatted ? `<span style="display: flex; align-items: center; gap: 3px;">${getIcon('calendar')} ${dueDateFormatted}</span>` : ''}
        </div>
      </div>
    `;
  }

  function setupKanbanDragAndDrop() {
    const cards = container.querySelectorAll('.kanban-card');
    const columns = container.querySelectorAll('.kanban-column');

    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        card.classList.add('is-dragging');
        e.dataTransfer.setData('text/plain', card.getAttribute('data-task-id'));
        e.dataTransfer.effectAllowed = 'move';
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
      });
    });

    columns.forEach(col => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('is-dragover');
      });

      col.addEventListener('dragleave', (e) => {
        if (!col.contains(e.relatedTarget)) {
          col.classList.remove('is-dragover');
        }
      });

      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('is-dragover');
        const taskId = e.dataTransfer.getData('text/plain');
        const targetStatus = col.getAttribute('data-status');

        if (!taskId || !targetStatus) return;

        const task = currentTasks.find(t => String(t.id) === String(taskId));
        if (task && task.status !== targetStatus) {
          task.status = targetStatus;
          updateProgressSummary();
          renderCurrentView();

          try {
            await window.API.put(`/tasks/${taskId}`, { status: targetStatus });
            window.showToast(`Task moved to ${targetStatus.replace('_', ' ')}`, 'success', 1500);
          } catch (err) {
            window.showToast('Failed to update task status', 'error');
            loadTasks();
          }
        }
      });
    });

    // Quick add buttons inside columns
    container.querySelectorAll('.btn-quick-add').forEach(btn => {
      btn.addEventListener('click', () => {
        openTaskModal(null, btn.getAttribute('data-status'));
      });
    });
  }

  function attachCardClickHandlers() {
    container.querySelectorAll('.kanban-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const taskId = card.getAttribute('data-task-id');
        const task = currentTasks.find(t => String(t.id) === String(taskId));
        if (task) openTaskModal(task);
      });
    });
  }

  /* --------------------------------------------------------------------------
     2. SORTABLE LIST VIEW with Inline Status Toggle & Bulk Actions
     -------------------------------------------------------------------------- */
  function renderListView(containerEl) {
    let filtered = getFilteredTasks();

    // Sort list
    filtered.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB);
        return sortAsc ? cmp : -cmp;
      }
      return sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });

    containerEl.innerHTML = `
      <div class="workflow-table-container" style="flex: 1; overflow-y: auto;">
        <table class="workflow-table">
          <thead>
            <tr>
              <th style="width: 38px; text-align: center;">
                <input type="checkbox" id="check-all-tasks" ${selectedTaskIds.size === filtered.length && filtered.length > 0 ? 'checked' : ''} />
              </th>
              <th class="sortable" data-sort="title">Title ${sortField === 'title' ? (sortAsc ? '▲' : '▼') : ''}</th>
              <th class="sortable" data-sort="status" style="width: 140px;">Status ${sortField === 'status' ? (sortAsc ? '▲' : '▼') : ''}</th>
              <th class="sortable" data-sort="priority" style="width: 110px;">Priority ${sortField === 'priority' ? (sortAsc ? '▲' : '▼') : ''}</th>
              <th class="sortable" data-sort="due_date" style="width: 130px;">Due Date ${sortField === 'due_date' ? (sortAsc ? '▲' : '▼') : ''}</th>
              <th style="width: 150px;">Project</th>
              <th style="width: 80px; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0 ? `
              <tr>
                <td colspan="7" style="text-align: center; padding: var(--space-8); color: var(--text-tertiary);">
                  No tasks found matching criteria.
                </td>
              </tr>
            ` : filtered.map(t => {
              const proj = currentProjects.find(p => p.id === t.project_id);
              const isChecked = selectedTaskIds.has(t.id);
              const due = t.due_date ? new Date(t.due_date).toLocaleDateString() : '-';
              const isOverdue = t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

              return `
                <tr data-task-id="${t.id}">
                  <td style="text-align: center;">
                    <input type="checkbox" class="task-checkbox" data-task-id="${t.id}" ${isChecked ? 'checked' : ''} />
                  </td>
                  <td>
                    <div style="font-weight: 500; color: var(--text-primary); cursor: pointer;" class="task-title-click" data-task-id="${t.id}">${t.title}</div>
                    ${t.description ? `<div class="text-xs text-secondary text-truncate" style="max-width: 400px;">${window.SmartLinkHandler ? window.SmartLinkHandler.renderMarkdownLinks(t.description) : t.description}</div>` : ''}
                  </td>
                  <td>
                    <span class="status-pill status-pill--${t.status}" data-task-id="${t.id}" title="Click to cycle status" style="display: inline-flex; align-items: center; gap: 4px;">
                      ${t.status === 'done' ? getIcon('check') : (t.status === 'in_progress' ? getIcon('circle-dot') : getIcon('circle'))} <span>${t.status.replace('_', ' ')}</span>
                    </span>
                  </td>
                  <td>
                    <span class="badge-priority badge-priority--${t.priority || 'medium'}">${t.priority || 'medium'}</span>
                  </td>
                  <td style="color: ${isOverdue ? '#ef4444' : 'var(--text-secondary)'}; font-size: var(--text-xs);">
                    ${due} ${isOverdue ? '(Overdue)' : ''}
                  </td>
                  <td>
                    ${proj ? `<span class="badge" style="background: var(--bg-tertiary); font-size: 11px;">${proj.title}</span>` : '-'}
                  </td>
                  <td style="text-align: right;">
                    <button class="btn btn--ghost btn--sm btn-edit-task" data-task-id="${t.id}" title="Edit Task">${getIcon('edit')}</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Sort header click
    containerEl.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.getAttribute('data-sort');
        if (sortField === field) {
          sortAsc = !sortAsc;
        } else {
          sortField = field;
          sortAsc = true;
        }
        renderListView(containerEl);
      });
    });

    // Row checkbox click
    containerEl.querySelectorAll('.task-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = parseInt(cb.getAttribute('data-task-id'), 10);
        if (cb.checked) selectedTaskIds.add(id);
        else selectedTaskIds.delete(id);
        updateBulkBar();
      });
    });

    // Check all checkbox
    const checkAll = containerEl.querySelector('#check-all-tasks');
    if (checkAll) {
      checkAll.addEventListener('change', () => {
        if (checkAll.checked) {
          filtered.forEach(t => selectedTaskIds.add(t.id));
        } else {
          selectedTaskIds.clear();
        }
        renderListView(containerEl);
        updateBulkBar();
      });
    }

    // Inline status cycle click
    containerEl.querySelectorAll('.status-pill').forEach(pill => {
      pill.addEventListener('click', async () => {
        const id = parseInt(pill.getAttribute('data-task-id'), 10);
        const task = currentTasks.find(t => t.id === id);
        if (!task) return;

        const nextStatusMap = { planned: 'in_progress', in_progress: 'done', done: 'planned' };
        const nextStatus = nextStatusMap[task.status] || 'planned';

        task.status = nextStatus;
        updateProgressSummary();
        renderListView(containerEl);

        try {
          await window.API.put(`/tasks/${id}`, { status: nextStatus });
        } catch (err) {
          loadTasks();
        }
      });
    });

    // Title / Edit click
    containerEl.querySelectorAll('.task-title-click, .btn-edit-task').forEach(el => {
      el.addEventListener('click', () => {
        const id = parseInt(el.getAttribute('data-task-id'), 10);
        const task = currentTasks.find(t => t.id === id);
        if (task) openTaskModal(task);
      });
    });
  }

  function updateBulkBar() {
    const bar = document.getElementById('workflow-bulk-bar');
    const cnt = document.getElementById('bulk-selected-count');
    if (!bar || !cnt) return;

    if (selectedTaskIds.size > 0) {
      bar.style.display = 'flex';
      cnt.textContent = `${selectedTaskIds.size} task${selectedTaskIds.size > 1 ? 's' : ''} selected`;
    } else {
      bar.style.display = 'none';
    }
  }

  // Setup bulk actions
  document.getElementById('btn-bulk-done').addEventListener('click', async () => {
    if (selectedTaskIds.size === 0) return;
    try {
      await window.API.post('/tasks/bulk-status', { taskIds: Array.from(selectedTaskIds), status: 'done' });
      window.showToast(`${selectedTaskIds.size} tasks marked as done`, 'success');
      selectedTaskIds.clear();
      updateBulkBar();
      loadTasks();
    } catch (e) {
      window.showToast('Bulk update failed', 'error');
    }
  });

  document.getElementById('btn-bulk-delete').addEventListener('click', async () => {
    if (selectedTaskIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedTaskIds.size} selected tasks?`)) return;
    try {
      await window.API.post('/tasks/bulk-delete', { taskIds: Array.from(selectedTaskIds) });
      window.showToast('Tasks deleted successfully', 'success');
      selectedTaskIds.clear();
      updateBulkBar();
      loadTasks();
    } catch (e) {
      window.showToast('Bulk delete failed', 'error');
    }
  });

  document.getElementById('btn-bulk-cancel').addEventListener('click', () => {
    selectedTaskIds.clear();
    updateBulkBar();
    renderCurrentView();
  });

  /* --------------------------------------------------------------------------
     3. MONTHLY CALENDAR VIEW with Task Dates & Date-Click Creation
     -------------------------------------------------------------------------- */
  function renderCalendarView(containerEl) {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();

    // Map tasks by date YYYY-MM-DD
    const tasksByDate = {};
    getFilteredTasks().forEach(t => {
      if (t.due_date) {
        const dStr = t.due_date.substring(0, 10);
        if (!tasksByDate[dStr]) tasksByDate[dStr] = [];
        tasksByDate[dStr].push(t);
      }
    });

    containerEl.innerHTML = `
      <div class="calendar-view-wrapper" style="flex: 1; overflow-y: auto;">
        <!-- Calendar Month Toolbar -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3);">
          <div style="display: flex; align-items: center; gap: var(--space-2);">
            <button class="btn btn--secondary btn--sm" id="cal-prev-month">◀</button>
            <button class="btn btn--secondary btn--sm" id="cal-today">Today</button>
            <button class="btn btn--secondary btn--sm" id="cal-next-month">▶</button>
            <h2 style="font-size: var(--text-md); font-weight: 600; margin-left: var(--space-2);">${monthNames[calMonth]} ${calYear}</h2>
          </div>
          <span class="text-xs text-secondary">Click any day cell to create a task on that date</span>
        </div>

        <!-- Days of Week Header -->
        <div class="calendar-header-days">
          ${dayNames.map(d => `<div class="calendar-day-name">${d}</div>`).join('')}
        </div>

        <!-- Days Grid -->
        <div class="calendar-days-grid" id="calendar-days-grid">
          <!-- Calendar cells rendered dynamically -->
        </div>
      </div>
    `;

    const gridEl = containerEl.querySelector('#calendar-days-grid');
    let cellsHtml = '';

    // Leading days from previous month
    for (let i = firstDay - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      cellsHtml += `<div class="calendar-day-cell is-other-month"><span class="calendar-day-number">${dayNum}</span></div>`;
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d;
      const dayTasks = tasksByDate[dateStr] || [];

      cellsHtml += `
        <div class="calendar-day-cell ${isToday ? 'is-today' : ''}" data-date="${dateStr}">
          <span class="calendar-day-number">${d}</span>
          <div style="display: flex; flex-direction: column; gap: 3px; overflow-y: auto; max-height: 80px;">
            ${dayTasks.map(t => `
              <div class="calendar-task-pill" data-task-id="${t.id}" title="${t.title} (${t.status})">
                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${t.status === 'done' ? '#34d399' : (t.priority === 'urgent' ? '#ef4444' : '#3b82f6')}; margin-right: 3px;"></span>
                ${t.title}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Trailing days to round out 35 or 42 cells
    const totalCells = firstDay + daysInMonth;
    const remainingCells = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
    for (let d = 1; d <= remainingCells; d++) {
      cellsHtml += `<div class="calendar-day-cell is-other-month"><span class="calendar-day-number">${d}</span></div>`;
    }

    gridEl.innerHTML = cellsHtml;

    // Navigation handlers
    containerEl.querySelector('#cal-prev-month').addEventListener('click', () => {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendarView(containerEl);
    });

    containerEl.querySelector('#cal-next-month').addEventListener('click', () => {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendarView(containerEl);
    });

    containerEl.querySelector('#cal-today').addEventListener('click', () => {
      calMonth = today.getMonth();
      calYear = today.getFullYear();
      renderCalendarView(containerEl);
    });

    // Day cell click (creates task on that date)
    containerEl.querySelectorAll('.calendar-day-cell:not(.is-other-month)').forEach(cell => {
      cell.addEventListener('click', (e) => {
        // If clicked on task pill, let the task click handler take over
        if (e.target.closest('.calendar-task-pill')) return;
        const dateStr = cell.getAttribute('data-date');
        openTaskModal(null, 'planned', dateStr);
      });
    });

    // Calendar task pill click
    containerEl.querySelectorAll('.calendar-task-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = parseInt(pill.getAttribute('data-task-id'), 10);
        const task = currentTasks.find(t => t.id === taskId);
        if (task) openTaskModal(task);
      });
    });
  }

  /* --------------------------------------------------------------------------
     4. TASK MODAL (Create & Edit)
     -------------------------------------------------------------------------- */
  function openTaskModal(task = null, defaultStatus = 'planned', defaultDueDate = null) {
    const isEditing = !!task;
    const title = isEditing ? 'Edit Workflow Task' : 'Create Workflow Task';
    const statusVal = isEditing ? task.status : defaultStatus;
    const priorityVal = isEditing ? (task.priority || 'medium') : 'medium';
    const dueDateVal = isEditing ? (task.due_date ? task.due_date.substring(0, 10) : '') : (defaultDueDate || '');
    const projectIdVal = isEditing ? (task.project_id || '') : '';

    const modal = window.Modal.open({
      title,
      size: 'md',
      content: `
        <form id="form-task-modal">
          <div class="form-group">
            <label class="form-label" for="task-title-input">Task Title *</label>
            <input type="text" id="task-title-input" class="input" value="${isEditing ? (task.title || '') : ''}" placeholder="e.g. Implement schema migration script" required autofocus />
          </div>

          <div class="form-group">
            <label class="form-label" for="task-desc-input">Description / Acceptance Criteria</label>
            <textarea id="task-desc-input" class="textarea" rows="3" placeholder="Detail deliverables and acceptance criteria...">${isEditing ? (task.description || '') : ''}</textarea>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="task-status-select">Status</label>
              <select id="task-status-select" class="select">
                <option value="planned" ${statusVal === 'planned' ? 'selected' : ''}>Planned</option>
                <option value="in_progress" ${statusVal === 'in_progress' ? 'selected' : ''}>In Progress</option>
                <option value="done" ${statusVal === 'done' ? 'selected' : ''}>Done</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="task-priority-select">Priority</label>
              <select id="task-priority-select" class="select">
                <option value="low" ${priorityVal === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${priorityVal === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${priorityVal === 'high' ? 'selected' : ''}>High</option>
                <option value="urgent" ${priorityVal === 'urgent' ? 'selected' : ''}>Urgent</option>
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            <div class="form-group">
              <label class="form-label" for="task-due-date">Due Date</label>
              <input type="date" id="task-due-date" class="input" value="${dueDateVal}" />
            </div>

            <div class="form-group">
              <label class="form-label" for="task-project-select">Associated Project</label>
              <select id="task-project-select" class="select">
                <option value="">(No Project)</option>
                ${currentProjects.map(p => `<option value="${p.id}" ${String(projectIdVal) === String(p.id) ? 'selected' : ''}>${p.title}</option>`).join('')}
              </select>
            </div>
          </div>

          ${isEditing ? `
            <div style="margin-top: var(--space-3); border-top: 1px solid var(--border-primary); padding-top: var(--space-3);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <label class="form-label" style="margin: 0; font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary);">Connected Knowledge Notes</label>
                <button type="button" class="btn btn--ghost btn--xs" id="btn-toggle-link-note" style="padding: 2px 6px; font-size: 11px;">+ Link Note</button>
              </div>

              <div id="modal-linked-notes-list" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
                <span class="text-tertiary text-xs">Loading connected notes...</span>
              </div>

              <div id="inline-connect-note-form" style="display: none; margin-top: 6px; padding: 8px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm);">
                <div style="display: flex; gap: 6px; align-items: center;">
                  <select id="select-note-to-link" class="select" style="flex: 1; height: 30px; font-size: 12px;">
                    <option value="">-- Select Note from Vault --</option>
                  </select>
                  <button type="button" class="btn btn--primary btn--sm" id="btn-confirm-link-note" style="height: 30px; padding: 0 10px; font-size: 12px;">Link</button>
                </div>
              </div>
            </div>
          ` : ''}

          <div id="task-modal-error" class="form-error" style="display: none; margin-top: var(--space-2);"></div>
        </form>
      `,
      buttons: [
        ...(isEditing ? [{
          text: 'Delete',
          variant: 'danger',
          onClick: async (m, inst) => {
            if (!confirm('Are you sure you want to delete this task?')) return;
            try {
              await window.API.delete(`/tasks/${task.id}`);
              inst.close();
              window.showToast('Task deleted', 'success');
              loadTasks();
            } catch (err) {
              window.showToast('Failed to delete task', 'error');
            }
          }
        }] : []),
        { text: 'Cancel', variant: 'ghost', onClick: (m, inst) => inst.close() },
        {
          text: isEditing ? 'Save Changes' : 'Create Task',
          variant: 'primary',
          onClick: async (m, inst) => {
            const titleVal = document.getElementById('task-title-input').value.trim();
            const descVal = document.getElementById('task-desc-input').value.trim();
            const stat = document.getElementById('task-status-select').value;
            const prio = document.getElementById('task-priority-select').value;
            const due = document.getElementById('task-due-date').value || null;
            const projId = document.getElementById('task-project-select').value || null;
            const errEl = document.getElementById('task-modal-error');

            if (!titleVal) {
              errEl.textContent = 'Task title is required.';
              errEl.style.display = 'block';
              return;
            }

            try {
              if (isEditing) {
                await window.API.put(`/tasks/${task.id}`, {
                  title: titleVal,
                  description: descVal,
                  status: stat,
                  priority: prio,
                  due_date: due,
                  project_id: projId ? parseInt(projId, 10) : null
                });
                window.showToast('Task updated successfully.', 'success');
              } else {
                await window.API.post('/tasks', {
                  title: titleVal,
                  description: descVal,
                  status: stat,
                  priority: prio,
                  due_date: due,
                  project_id: projId ? parseInt(projId, 10) : null
                });
                window.showToast('Task created successfully.', 'success');
              }
              inst.close();
              loadTasks();
            } catch (err) {
              errEl.textContent = err.message || 'Operation failed.';
              errEl.style.display = 'block';
            }
          }
        }
      ]
    });

    setTimeout(() => {
      const descInput = document.getElementById('task-desc-input');
      if (descInput && window.SmartLinkHandler) {
        window.SmartLinkHandler.attachToTextarea(descInput);
      }
    }, 20);

    if (isEditing) {
      async function refreshLinkedNotes() {
        const listEl = document.getElementById('modal-linked-notes-list');
        if (!listEl) return;
        try {
          const res = await window.API.get(`/tasks/${task.id}/notes`);
          const notes = res.notes || [];
          if (notes.length === 0) {
            listEl.innerHTML = `<span class="text-tertiary text-xs">No knowledge notes connected</span>`;
            return;
          }
          listEl.innerHTML = notes.map(n => `
            <div class="tag note-linked-pill" data-note-id="${n.id}" style="display: inline-flex; align-items: center; gap: 6px; background-color: var(--bg-elevated); border: 1px solid var(--border-primary); padding: 3px 8px; border-radius: var(--radius-sm); cursor: pointer;" title="Open in Knowledge Vault">
              <span style="color: var(--accent-deep, var(--accent-primary)); display: flex;">${getIcon('book-open')}</span>
              <span style="font-weight: 500; color: var(--text-primary); font-size: 11px;">${n.title}</span>
              <button type="button" class="btn-unlink-note" data-note-id="${n.id}" title="Unlink note" style="background: none; border: none; padding: 0 2px; cursor: pointer; color: var(--text-tertiary); font-size: 12px; line-height: 1; margin-left: 2px;">&times;</button>
            </div>
          `).join('');

          listEl.querySelectorAll('.note-linked-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
              if (e.target.closest('.btn-unlink-note')) return;
              const noteId = pill.getAttribute('data-note-id');
              window.Modal.close();
              window.Router.navigate(`/vault/${noteId}`);
            });
          });

          listEl.querySelectorAll('.btn-unlink-note').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              e.stopPropagation();
              const noteId = btn.getAttribute('data-note-id');
              if (!confirm('Unlink this note from the task? (The note will not be deleted)')) return;
              try {
                await window.API.delete(`/tasks/${task.id}/notes/${noteId}`);
                window.showToast('Note unlinked', 'success');
                refreshLinkedNotes();
              } catch (err) {
                window.showToast('Failed to unlink: ' + err.message, 'error');
              }
            });
          });
        } catch (e) {
          console.warn('Error loading linked notes for modal:', e);
        }
      }

      refreshLinkedNotes();

      const toggleLinkBtn = document.getElementById('btn-toggle-link-note');
      const inlineForm = document.getElementById('inline-connect-note-form');
      const selectNote = document.getElementById('select-note-to-link');
      const confirmLinkBtn = document.getElementById('btn-confirm-link-note');

      let notesLoaded = false;
      if (toggleLinkBtn && inlineForm) {
        toggleLinkBtn.addEventListener('click', async () => {
          const isHidden = inlineForm.style.display === 'none';
          inlineForm.style.display = isHidden ? 'block' : 'none';
          if (isHidden && !notesLoaded) {
            try {
              const res = await window.API.get('/notes');
              const allNotes = res.notes || [];
              selectNote.innerHTML = '<option value="">-- Select Note from Vault --</option>' +
                allNotes.map(n => `<option value="${n.id}">${n.title}</option>`).join('');
              notesLoaded = true;
            } catch (err) {
              console.warn('Failed to load notes for select:', err);
            }
          }
        });
      }

      if (confirmLinkBtn && selectNote) {
        confirmLinkBtn.addEventListener('click', async () => {
          const noteId = selectNote.value;
          if (!noteId) {
            alert('Please select a note to link');
            return;
          }
          try {
            await window.API.post(`/tasks/${task.id}/notes`, { noteId });
            window.showToast('Note connected to task', 'success');
            inlineForm.style.display = 'none';
            refreshLinkedNotes();
          } catch (err) {
            window.showToast('Failed to link note: ' + err.message, 'error');
          }
        });
      }
    }
  }

  /* --------------------------------------------------------------------------
     5. VIEW SWITCHER & SEARCH LISTENERS
     -------------------------------------------------------------------------- */
  document.querySelectorAll('#workflow-view-control .segmented-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#workflow-view-control .segmented-btn').forEach(b => b.classList.remove('segmented-btn--active'));
      btn.classList.add('segmented-btn--active');
      currentView = btn.getAttribute('data-view');
      localStorage.setItem('flowden_workflow_view', currentView);
      renderCurrentView();
    });
  });

  // Search input
  const searchInput = document.getElementById('task-filter-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderCurrentView();
    });
  }

  // Project filter
  const projFilter = document.getElementById('task-filter-project');
  if (projFilter) {
    projFilter.addEventListener('change', (e) => {
      filterProject = e.target.value;
      renderCurrentView();
    });
  }

  // Priority filter
  const prioFilter = document.getElementById('task-filter-priority');
  if (prioFilter) {
    prioFilter.addEventListener('change', (e) => {
      filterPriority = e.target.value;
      renderCurrentView();
    });
  }

  // Create Task button
  document.getElementById('btn-create-task').addEventListener('click', () => openTaskModal());

  // Initialize data
  await loadProjects();
  await loadTasks();

  // Auto-open task modal if URL query specifies taskId
  const currentHash = window.location.hash || '';
  let targetTaskId = null;
  if (params && params.taskId) {
    targetTaskId = parseInt(params.taskId, 10);
  } else if (currentHash.includes('taskId=')) {
    targetTaskId = parseInt(currentHash.split('taskId=')[1].split('&')[0], 10);
  }
  if (targetTaskId) {
    const targetTask = currentTasks.find(t => t.id === targetTaskId);
    if (targetTask) {
      openTaskModal(targetTask);
    }
  }
}

if (typeof window !== 'undefined') {
  window.renderWorkflowPage = renderWorkflowPage;
}
