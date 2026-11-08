// Flowden Quick Capture Inbox Engine
// Ingestion, Staging, & 1-Click Processing into Notes or Tasks

async function renderCapturePage(container) {
  const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';

  container.innerHTML = `
    <div style="padding: var(--space-6); max-width: 800px; margin: 0 auto;">
      <div style="margin-bottom: var(--space-6);">
        <h1 style="font-size: var(--text-xl); font-weight: var(--font-semibold); margin-bottom: var(--space-1);">Quick Capture Inbox</h1>
        <p class="text-secondary text-sm">Frictionless inbox for capturing thoughts and research links before processing into notes or tasks.</p>
      </div>

      <!-- Quick Capture Box -->
      <div class="card" style="padding: var(--space-5); margin-bottom: var(--space-6); background-color: var(--bg-secondary);">
        <div class="form-group" style="margin-bottom: var(--space-3);">
          <textarea id="inbox-capture-text" class="textarea" style="min-height: 90px;" placeholder="What's on your mind? Capture an idea, question, or link..."></textarea>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div class="segmented-control">
            <button class="segmented-btn segmented-btn--active capture-type-btn" data-type="text">Text</button>
            <button class="segmented-btn capture-type-btn" data-type="link">Link</button>
            <button class="segmented-btn capture-type-btn" data-type="image">Reference</button>
          </div>
          <button class="btn btn--primary btn--md" id="btn-inbox-submit">
            ${getIcon('plus')}
            <span>Capture to Inbox</span>
          </button>
        </div>
      </div>

      <!-- Inbox List Section -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3);">
        <h2 style="font-size: var(--text-md); font-weight: var(--font-semibold);" id="inbox-count-label">Unprocessed Captures</h2>
      </div>

      <div id="inbox-captures-list">
        <div class="skeleton skeleton--card"></div>
      </div>
    </div>
  `;

  let selectedType = 'text';
  const typeBtns = document.querySelectorAll('.capture-type-btn');
  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeBtns.forEach(b => b.classList.remove('segmented-btn--active'));
      btn.classList.add('segmented-btn--active');
      selectedType = btn.getAttribute('data-type');
    });
  });

  const listEl = document.getElementById('inbox-captures-list');
  const countLabel = document.getElementById('inbox-count-label');

  async function loadCaptures() {
    try {
      const res = await window.API.get('/quick-captures');
      const captures = res.captures || [];
      const unprocessed = captures.filter(c => !c.is_processed);
      countLabel.textContent = `Unprocessed Captures (${unprocessed.length})`;

      if (unprocessed.length === 0) {
        listEl.innerHTML = `
          <div class="card" style="padding: var(--space-8); text-align: center;">
            <div class="empty-state" style="padding: 0;">
              <div class="empty-state-icon">${getIcon('inbox')}</div>
              <div class="empty-state-title">Inbox is clear</div>
              <div class="empty-state-description">Your inbox is empty. Use quick capture anytime to dump ideas without breaking your workflow.</div>
            </div>
          </div>
        `;
        return;
      }

      listEl.innerHTML = unprocessed.map(c => `
        <div class="card" style="margin-bottom: var(--space-3); padding: var(--space-4);" data-id="${c.id}">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-3);">
            <div style="font-size: var(--text-sm); line-height: 1.5; color: var(--text-primary); white-space: pre-wrap;">${c.content}</div>
            <span class="tag tag--violet" style="font-size: 10px; text-transform: uppercase;">${c.capture_type}</span>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-primary); padding-top: var(--space-2); margin-top: var(--space-2);">
            <span class="text-xs text-tertiary">${new Date(c.created_at).toLocaleString()}</span>
            <div style="display: flex; gap: var(--space-2);">
              <button class="btn btn--secondary btn--sm btn-process-note" data-id="${c.id}">
                Convert to Note
              </button>
              <button class="btn btn--secondary btn--sm btn-process-task" data-id="${c.id}">
                Convert to Task
              </button>
              <button class="btn btn--ghost btn--icon btn--sm btn-delete-capture" data-id="${c.id}" title="Dismiss">
                ${getIcon('trash-2')}
              </button>
            </div>
          </div>
        </div>
      `).join('');

      // Actions
      listEl.querySelectorAll('.btn-process-note').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await window.API.post(`/quick-captures/${id}/process`, { target_type: 'note' });
          window.showToast('Converted to Knowledge Note.', 'success');
          loadCaptures();
        });
      });

      listEl.querySelectorAll('.btn-process-task').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await window.API.post(`/quick-captures/${id}/process`, { target_type: 'task' });
          window.showToast('Converted to Workflow Task.', 'success');
          loadCaptures();
        });
      });

      listEl.querySelectorAll('.btn-delete-capture').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await window.API.delete(`/quick-captures/${id}`);
          window.showToast('Capture dismissed.', 'info');
          loadCaptures();
        });
      });
    } catch (err) {
      listEl.innerHTML = `<div class="form-error">${err.message}</div>`;
    }
  }

  document.getElementById('btn-inbox-submit').addEventListener('click', async () => {
    const textEl = document.getElementById('inbox-capture-text');
    const val = textEl.value.trim();
    if (!val) return;

    try {
      await window.API.post('/quick-captures', { content: val, capture_type: selectedType });
      textEl.value = '';
      window.showToast('Captured to inbox.', 'success');
      loadCaptures();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });

  loadCaptures();
}

if (typeof window !== 'undefined') {
  window.renderCapturePage = renderCapturePage;
}
